// Monta o prompt de geração do modelo formal a partir da entrada estruturada (task #63).
// Blocos e ordem seguem docs/prompt/estrutura-modelo-formal.md, seção 4; o B6 só entra nas
// tentativas 2 e 3 e fica para a task de realimentação.
import { catalogoPadrao, type Catalogo, type EntradaEstruturada } from '../../orchestrator/entrada';
import { lerDomainCard, manifestoDosCards } from './cards';
import { SAIDA_EXEMPLO, TRECHO_CARD_EXEMPLO } from './exemplo';
import { GLOSSARIO } from './glossario';
import { jsonSchemaModeloFormal } from './schema';

export interface BlocoPrompt {
  id: 'B0' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B7';
  titulo: string;
  papel: 'system' | 'user';
  conteudo: string;
}

export interface PromptModeloFormal {
  system: string;
  prompt: string;
  blocos: BlocoPrompt[];
  // Estimativa grosseira (~4 caracteres por token), só para acompanhar o RNF004.
  tokensEstimados: number;
}

const B0 = `Você é um tradutor estrutural de arquitetura de referência para modelo formal de domínio.
Recebe recortes do catálogo BIAN e produz o modelo formal de regras de negócio dos Service Domains selecionados.
Duas regras não negociáveis:
1. Nada é afirmado sem fonte em <domain_cards>.
2. Tudo o que não vier de <domain_cards> precisa ser declarado como derivado.`;

const B3 = `<restricoes_tecnicas>
- Use exclusivamente a terminologia de <domain_cards>; não traduza nem parafraseie nomes de schema, campo ou valor de enum.
- Copie valores de enum literalmente da lista do card.
- Não invente campo, tipo ou valor que não esteja em <domain_cards>.
- Só identificadores de schema presentes em <domain_cards> podem ser citados em "fonte"; o glossário e o landscape não são fonte de campos, tipos ou enums.
- Quando uma informação necessária não existir em <domain_cards>, registre em "lacunas" em vez de preencher por conhecimento próprio.
- Invariantes, transições de estado e cardinalidades são sempre "derivado", porque o catálogo BIAN não declara nenhum dos três.
- Restrições em <restricoes_usuario> entram como candidatas a invariante derivada, nunca como alteração do catálogo.
- Máquinas de estado: toda entidade tem exatamente uma, a do seu ciclo de vida, sempre sobre um campo de status. Se o card tiver um enum de status do ciclo de vida da entidade, use em "estados" os valores literais dele, com origem "catalogo" e "fonte" no schema do enum. Se não tiver, derive de 3 a 6 estados com origem "derivado", "fonte" null e uma lacuna. Nunca crie máquina para enums de tipo, de data ou de classificação. As transições devem ligar os estados de um início a estados terminais.
- Eventos de domínio: declare um evento para cada transição relevante, no mínimo um por entidade, com origem "derivado" e "fonte" null. Em "payload" use apenas nomes de campos do card.
- Relacionamentos: declare um para cada atributo que referencia outra parte, conta ou domínio. Nunca aponte uma entidade para ela mesma ou para o próprio Service Domain. Em "para" com "externo" = true, use só ids de <service_landscape>; se nenhum servir, registre uma lacuna em vez do relacionamento.
- Invariantes: declare ao menos uma por entidade e cite nelas apenas campos, schemas e valores presentes no card.
- Modele apenas os Service Domains de <selecao>. O <service_landscape> é contexto, para situar a seleção e nomear os demais.
- Entidades: só o control record de cada Service Domain selecionado vira entidade, com "nome" e "control_record" iguais ao control_record do card. Todos os campos do control record viram atributos dela, sem omitir nenhum. Os demais schemas do card (objetos, enums, Datetime, Identifier etc.) nunca viram entidade: aparecem só como "tipo" de atributo.
- Atributo cujo tipo é um enum do card: copie os valores literais da lista em "valores" e mantenha em "fonte" o schema que declara o campo (o control record), nunca o schema do enum; nos demais atributos, "valores" é null.
- O catálogo não declara campos obrigatórios: use "obrigatorio" null e registre uma única lacuna sobre a obrigatoriedade dos atributos.
- Cada item de "behaviour_qualifiers" do card entra em "pontos_extensao", com "alvo" = control record e o motivo de não ter schema no card.
- Um tipo listado em "tipos_nao_expandidos" pode ser usado como "tipo" de atributo, mas cada um usado gera uma lacuna, porque seus campos não estão no card.
- Referência a um Service Domain não selecionado entra em "relacionamentos" com "para" = id do Service Domain e "externo" = true, sem criar entidades dele. Use origem "catalogo" com "fonte" no schema que declara o campo de referência apenas se o card disser explicitamente qual é o Service Domain de destino; caso contrário, origem "derivado" e "fonte" null.
</restricoes_tecnicas>`;

const B7 = `Gere o modelo formal dos Service Domains em <selecao>, usando apenas o conteúdo de <domain_cards>.
Não invente elementos; todo item com origem "catalogo" deve citar em "fonte" um identificador presente em <domain_cards>.
Responda exclusivamente com o JSON do contrato de saída, sem texto antes ou depois.`;

// Conteúdo de tag: basta escapar & e < para o texto não abrir nem fechar tags do prompt.
function escaparTexto(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function escaparAtributo(texto: string): string {
  return escaparTexto(texto).replace(/"/g, '&quot;');
}

function montarGlossario(catalogo: Catalogo): string[] {
  const linhas = ['  <glossario>'];
  for (const { termo, definicao } of GLOSSARIO) {
    linhas.push(`    <termo nome="${termo}">${escaparTexto(definicao)}</termo>`);
  }
  for (const [status, significado] of Object.entries(catalogo.legendaStatus)) {
    linhas.push(`    <termo nome="status=${status}">${escaparTexto(significado)}</termo>`);
  }
  linhas.push('  </glossario>');
  return linhas;
}

// O landscape inteiro entra em todo prompt; só os atributos "selecionado" mudam com a seleção.
function montarLandscape(catalogo: Catalogo, selecionados: Set<string>): string[] {
  const linhas = [
    `  <service_landscape grupo_funcional_mvp="${escaparAtributo(catalogo.grupoFuncionalMvp)}">`,
  ];
  for (const area of catalogo.businessAreas) {
    // A "nota" da Business Area é recado para a equipe (validar o agrupamento), não para o modelo.
    linhas.push(
      `    <business_area id="${area.id}" nome="${escaparAtributo(area.nome)}" nome_pt="${escaparAtributo(area.nomePt)}">`,
    );
    for (const dominio of area.businessDomains) {
      const atributos = `id="${dominio.id}" nome="${escaparAtributo(dominio.nome)}" nome_pt="${escaparAtributo(dominio.nomePt)}" status="${dominio.status}"`;
      if (dominio.serviceDomains.length === 0) {
        linhas.push(`      <business_domain ${atributos} />`);
        continue;
      }
      linhas.push(`      <business_domain ${atributos}>`);
      for (const sd of dominio.serviceDomains) {
        linhas.push(
          `        <service_domain id="${sd.id}" nome="${escaparAtributo(sd.nome)}" disponivel="${sd.disponivel}" selecionado="${selecionados.has(sd.id)}">${escaparTexto(sd.descricao)}</service_domain>`,
        );
      }
      linhas.push('      </business_domain>');
    }
    linhas.push('    </business_area>');
  }
  linhas.push('  </service_landscape>');
  return linhas;
}

// O card entra sem recuo e sem escape: é YAML literal do condensador (R4, R6) e não contém "<".
function montarDomainCards(entrada: EntradaEstruturada): string[] {
  const linhas = ['  <domain_cards>'];
  for (const sd of entrada.serviceDomains) {
    linhas.push(
      `    <domain_card service_domain="${sd.id}" control_record="${sd.controlRecord}" arquivo="${sd.arquivoOrigem}">`,
      lerDomainCard(sd.id),
      '    </domain_card>',
    );
  }
  linhas.push('  </domain_cards>');
  return linhas;
}

function montarB1(entrada: EntradaEstruturada, catalogo: Catalogo): string {
  const selecionados = new Set(entrada.serviceDomains.map((sd) => sd.id));
  // R7: o commit do repositório oficial do BIAN de onde os cards foram gerados.
  const commit = manifestoDosCards().commitBian.slice(0, 7);
  return [
    `<catalogo arquitetura="${entrada.arquitetura}" versao="${entrada.versao}" commit="${commit}">`,
    ...montarGlossario(catalogo),
    ...montarLandscape(catalogo, selecionados),
    ...montarDomainCards(entrada),
    '</catalogo>',
  ].join('\n');
}

// A opção de frontend (RF017) não afeta o modelo formal e fica para o prompt de geração de código.
function montarB2(entrada: EntradaEstruturada): string {
  const linhas = ['<selecao>'];
  for (const sd of entrada.serviceDomains) {
    linhas.push(`  <service_domain id="${sd.id}" nome="${sd.nome}" />`);
  }
  // Tag vazia explícita quando não há restrições, para o modelo saber que não há nenhuma.
  if (entrada.restricoes.length === 0) {
    linhas.push('  <restricoes_usuario />');
  } else {
    linhas.push('  <restricoes_usuario>');
    for (const r of entrada.restricoes) {
      // Texto digitado pelo usuário: escapado para não abrir ou fechar tags do prompt.
      linhas.push(
        `    <restricao service_domain="${r.serviceDomain}">${escaparTexto(r.descricao)}</restricao>`,
      );
    }
    linhas.push('  </restricoes_usuario>');
  }
  linhas.push('</selecao>');
  return linhas.join('\n');
}

function montarB4(): string {
  return `<contrato_saida>\n${JSON.stringify(jsonSchemaModeloFormal(), null, 2)}\n</contrato_saida>`;
}

function montarB5(): string {
  return [
    '<exemplo>',
    'Exemplo da forma esperada, com um Service Domain que não está em <selecao>. Não copie nada dele para a resposta.',
    '<domain_card_exemplo>',
    TRECHO_CARD_EXEMPLO,
    '</domain_card_exemplo>',
    '<saida_exemplo>',
    JSON.stringify(SAIDA_EXEMPLO, null, 2),
    '</saida_exemplo>',
    '</exemplo>',
  ].join('\n');
}

export function montarPromptModeloFormal(
  entrada: EntradaEstruturada,
  catalogo: Catalogo = catalogoPadrao(),
): PromptModeloFormal {
  const blocos: BlocoPrompt[] = [
    { id: 'B0', titulo: 'Papel e enquadramento', papel: 'system', conteudo: B0 },
    {
      id: 'B1',
      titulo: 'Catálogo (glossário, landscape completo e domain cards)',
      papel: 'user',
      conteudo: montarB1(entrada, catalogo),
    },
    { id: 'B2', titulo: 'Seleção do usuário', papel: 'user', conteudo: montarB2(entrada) },
    { id: 'B3', titulo: 'Restrições técnicas e de conformidade', papel: 'user', conteudo: B3 },
    { id: 'B4', titulo: 'Contrato de saída', papel: 'user', conteudo: montarB4() },
    { id: 'B5', titulo: 'Exemplo de referência (few-shot)', papel: 'user', conteudo: montarB5() },
    { id: 'B7', titulo: 'Instrução final', papel: 'user', conteudo: B7 },
  ];

  const system = blocos
    .filter((b) => b.papel === 'system')
    .map((b) => b.conteudo)
    .join('\n\n');
  const prompt = blocos
    .filter((b) => b.papel === 'user')
    .map((b) => b.conteudo)
    .join('\n\n');

  return {
    system,
    prompt,
    blocos,
    tokensEstimados: Math.ceil((system.length + prompt.length) / 4),
  };
}
