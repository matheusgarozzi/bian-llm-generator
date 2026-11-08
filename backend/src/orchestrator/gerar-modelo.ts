// Orquestrador do modelo formal: monta o prompt, chama o LLM, valida com o gatekeeper e, se
// reprovar, realimenta o motivo (bloco B6) em até 3 tentativas (RF008, RF009 e RF010).
import { gerarObjeto, ErroLLM, type LLMConfig } from '../llm';
import {
  montarPromptModeloFormal,
  schemaModeloFormal,
  type ModeloFormal,
} from '../prompt-engine/modelo-formal';
import {
  indexarServiceDomains,
  validarModeloFormal,
  type RelatorioValidacao,
  type Violacao,
} from '../gatekeeper';
import type { EntradaEstruturada } from './entrada';

export const MAX_TENTATIVAS = 3;

export type StatusGeracao = 'CONCLUIDA' | 'FALHA_VALIDACAO' | 'FALHA_INFRA';

export interface Tentativa {
  numero: number;
  tokensEstimados: number;
  duracaoMs: number;
  modelo: ModeloFormal | null;
  relatorio: RelatorioValidacao;
}

export interface ResultadoGeracao {
  status: StatusGeracao;
  modelo: ModeloFormal | null;
  tentativas: Tentativa[];
  erro?: string;
}

// Função que chama o LLM; injetável para testar o ciclo sem servidor de modelo.
export type ChamarLLM = (params: { system: string; prompt: string }) => Promise<unknown>;

export function chamadaPadrao(config?: LLMConfig): ChamarLLM {
  return ({ system, prompt }) =>
    gerarObjeto({ schema: schemaModeloFormal, system, prompt, nomeSchema: 'modelo_formal', config });
}

// Bloco B6 (docs/prompt/estrutura-modelo-formal.md): só o relatório da tentativa anterior e a
// saída anterior, para correção pontual em vez de regeneração do zero.
export function montarB6(numero: number, violacoes: Violacao[], saidaAnterior: unknown): string {
  const itens = violacoes
    .slice(0, 20)
    .map(
      (v) =>
        `  <violacao regra="${v.regra}" caminho="${v.caminho}">\n    <descricao>${v.descricao}</descricao>\n    <acao_esperada>${v.acaoEsperada}</acao_esperada>\n  </violacao>`,
    )
    .join('\n');
  return [
    `<reprovacao tentativa="${numero}" de="${MAX_TENTATIVAS}">`,
    itens,
    saidaAnterior ? `  <saida_anterior>${JSON.stringify(saidaAnterior)}</saida_anterior>` : '',
    '  Corrija apenas os pontos reprovados e devolva o modelo completo.',
    '</reprovacao>',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function gerarModeloFormal(
  entrada: EntradaEstruturada,
  chamar: ChamarLLM = chamadaPadrao(),
): Promise<ResultadoGeracao> {
  const base = montarPromptModeloFormal(entrada);
  const indice = indexarServiceDomains(entrada.serviceDomains.map((sd) => sd.id));
  const tentativas: Tentativa[] = [];
  let feedback = '';

  for (let numero = 1; numero <= MAX_TENTATIVAS; numero++) {
    // O B6 entra antes da instrução final, que continua sendo o último bloco do prompt.
    const prompt = feedback ? `${feedback}\n\n${base.prompt}` : base.prompt;
    const inicio = Date.now();
    let saida: unknown = null;
    let relatorio: RelatorioValidacao;
    try {
      saida = await chamar({ system: base.system, prompt });
      relatorio = validarModeloFormal(saida, indice);
    } catch (erro) {
      // Saída fora do schema conta como reprovação em CONF-01; as demais falhas são de infraestrutura.
      if (erro instanceof ErroLLM && erro.tipo === 'resposta_invalida') {
        relatorio = {
          aprovado: false,
          regrasAplicadas: ['CONF-01'],
          violacoes: [
            {
              regra: 'CONF-01',
              caminho: '',
              descricao: 'A resposta do LLM não é um JSON conforme ao contrato de saída',
              acaoEsperada: 'Responder exclusivamente com o JSON do contrato, sem texto ao redor',
            },
          ],
        };
      } else {
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        return { status: 'FALHA_INFRA', modelo: null, tentativas, erro: mensagem };
      }
    }
    const aprovado = relatorio.aprovado;
    tentativas.push({
      numero,
      tokensEstimados: Math.ceil((base.system.length + prompt.length) / 4),
      duracaoMs: Date.now() - inicio,
      modelo: aprovado || saida ? (saida as ModeloFormal) : null,
      relatorio,
    });
    if (aprovado) return { status: 'CONCLUIDA', modelo: saida as ModeloFormal, tentativas };
    feedback = montarB6(numero + 1, relatorio.violacoes, saida);
  }
  return { status: 'FALHA_VALIDACAO', modelo: null, tentativas };
}
