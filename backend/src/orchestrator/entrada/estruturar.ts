// Valida a seleção contra o catálogo e a devolve em forma canônica para os blocos B1 e B2 do prompt.
import { createHash } from 'node:crypto';
import { catalogoPadrao, type Catalogo } from './catalogo';
import { schemaEntrada, type Restricao } from './schema';

export class ErroEntrada extends Error {
  // Uma mensagem por item com problema, para a tela mostrar tudo de uma vez.
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Entrada inválida: ${problemas.join('; ')}`);
    this.name = 'ErroEntrada';
    this.problemas = problemas;
  }
}

export interface ServiceDomainEstruturado {
  id: string;
  nome: string;
  controlRecord: string;
  arquivoOrigem: string;
}

export interface EntradaEstruturada {
  arquitetura: 'BIAN';
  versao: string;
  serviceDomains: ServiceDomainEstruturado[];
  gerarFrontend: boolean;
  restricoes: Restricao[];
  // sha256 da seleção normalizada: identifica rodadas repetidas da mesma entrada (Apêndice B).
  hash: string;
}

export function estruturarEntrada(
  corpo: unknown,
  catalogo: Catalogo = catalogoPadrao(),
): EntradaEstruturada {
  const validacao = schemaEntrada.safeParse(corpo);
  if (!validacao.success) {
    throw new ErroEntrada(
      validacao.error.issues.map((issue) => {
        const caminho = issue.path.join('.');
        return caminho ? `${caminho}: ${issue.message}` : issue.message;
      }),
    );
  }
  const entrada = validacao.data;
  const problemas: string[] = [];

  if (entrada.versao !== catalogo.versao) {
    problemas.push(`versao: "${entrada.versao}" difere da versão do catálogo (${catalogo.versao})`);
  }

  const selecionados = [...new Set(entrada.serviceDomains)];
  const disponiveis = catalogo.serviceDomains.filter((sd) => sd.disponivel).map((sd) => sd.id);
  for (const id of selecionados) {
    const sd = catalogo.porId.get(id);
    if (!sd) {
      problemas.push(`serviceDomains: "${id}" não existe no catálogo BIAN ${catalogo.versao}`);
    } else if (!sd.disponivel) {
      problemas.push(
        `serviceDomains: "${id}" está fora do recorte disponível (${disponiveis.join(', ')})`,
      );
    }
  }

  for (const restricao of entrada.restricoes) {
    if (!selecionados.includes(restricao.serviceDomain)) {
      problemas.push(
        `restricoes: "${restricao.serviceDomain}" não está entre os Service Domains selecionados`,
      );
    }
  }

  if (problemas.length > 0) throw new ErroEntrada(problemas);

  // Ordem do catálogo, não a de clique: a mesma seleção gera sempre a mesma estrutura (RNF005).
  const ordem = (id: string) => catalogo.porId.get(id)!.ordem;
  const serviceDomains = selecionados
    .sort((a, b) => ordem(a) - ordem(b))
    .map((id): ServiceDomainEstruturado => {
      const sd = catalogo.porId.get(id)!;
      return {
        id: sd.id,
        nome: sd.nome,
        controlRecord: sd.controlRecord!,
        arquivoOrigem: sd.arquivoOrigem!,
      };
    });

  const restricoes = removerRestricoesRepetidas(entrada.restricoes).sort(
    (a, b) =>
      ordem(a.serviceDomain) - ordem(b.serviceDomain) || compararTexto(a.descricao, b.descricao),
  );

  const normalizada = {
    arquitetura: catalogo.arquitetura,
    versao: catalogo.versao,
    serviceDomains,
    gerarFrontend: entrada.gerarFrontend,
    restricoes,
  };
  const hash = createHash('sha256').update(JSON.stringify(normalizada)).digest('hex');

  return { ...normalizada, hash };
}

function removerRestricoesRepetidas(restricoes: Restricao[]): Restricao[] {
  const vistas = new Map<string, Restricao>();
  for (const r of restricoes) {
    vistas.set(JSON.stringify([r.serviceDomain, r.descricao]), {
      serviceDomain: r.serviceDomain,
      descricao: r.descricao,
    });
  }
  return [...vistas.values()];
}

// Comparação por code unit, independente do locale da máquina.
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
