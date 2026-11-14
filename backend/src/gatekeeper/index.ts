// Validador de Conformidade (gatekeeper): regras CONF-01 a CONF-07 de
// docs/prompt/estrutura-modelo-formal.md, seção 8, e regras de completude CONF-08 a CONF-12.
// Determinístico e sem LLM: só compara o modelo formal com os domain cards selecionados.
import { parse } from 'yaml';
import { schemaModeloFormal, type ModeloFormal } from '../prompt-engine/modelo-formal/schema';
import { lerDomainCard } from '../prompt-engine/modelo-formal/cards';
import { catalogoPadrao } from '../orchestrator/entrada';

export type RegraConformidade =
  | 'CONF-01'
  | 'CONF-02'
  | 'CONF-03'
  | 'CONF-04'
  | 'CONF-05'
  | 'CONF-06'
  | 'CONF-07'
  | 'CONF-08'
  | 'CONF-09'
  | 'CONF-10'
  | 'CONF-11'
  | 'CONF-12';

export interface Violacao {
  regra: RegraConformidade;
  caminho: string;
  descricao: string;
  acaoEsperada: string;
}

export interface RelatorioValidacao {
  aprovado: boolean;
  violacoes: Violacao[];
  regrasAplicadas: RegraConformidade[];
}

interface SchemaCard {
  campos?: Record<string, string>;
  enum?: string[];
}

interface CardLido {
  service_domain: string;
  control_record: string;
  schemas: Record<string, SchemaCard>;
}

// Índice dos cards: o que existe e pode ser citado.
export interface IndiceCatalogo {
  fontes: Set<string>;
  controlRecords: Set<string>;
  camposPorFonte: Map<string, Set<string>>;
  enumPorTipo: Map<string, string[]>;
  todosOsValoresDeEnum: Set<string>;
  camposPorControlRecord: Map<string, string[]>;
  // Campos, schemas e valores de enum: tudo o que uma invariante ou um payload pode citar.
  nomesConhecidos: Set<string>;
  serviceDomainsSelecionados: Set<string>;
  // Ids do landscape; vazio quando o índice foi montado só com cards (não confere externos).
  serviceDomainsDoCatalogo: Set<string>;
}

export function indexarCards(cardsYaml: string[]): IndiceCatalogo {
  const indice: IndiceCatalogo = {
    fontes: new Set(),
    controlRecords: new Set(),
    camposPorFonte: new Map(),
    enumPorTipo: new Map(),
    todosOsValoresDeEnum: new Set(),
    camposPorControlRecord: new Map(),
    nomesConhecidos: new Set(),
    serviceDomainsSelecionados: new Set(),
    serviceDomainsDoCatalogo: new Set(),
  };
  for (const texto of cardsYaml) {
    const card = parse(texto) as CardLido;
    indice.controlRecords.add(card.control_record);
    indice.serviceDomainsSelecionados.add(card.service_domain);
    for (const [id, schema] of Object.entries(card.schemas ?? {})) {
      indice.fontes.add(id);
      const campos = Object.keys(schema?.campos ?? {});
      indice.camposPorFonte.set(id, new Set(campos));
      const nomeSchema = id.split('/').pop()!;
      indice.nomesConhecidos.add(nomeSchema);
      campos.forEach((campo) => indice.nomesConhecidos.add(campo));
      if (nomeSchema === card.control_record) indice.camposPorControlRecord.set(nomeSchema, campos);
      if (Array.isArray(schema?.enum)) {
        const valores = schema.enum.map(String);
        indice.enumPorTipo.set(id.split('/').pop()!, valores);
        valores.forEach((valor) => {
          indice.todosOsValoresDeEnum.add(valor);
          indice.nomesConhecidos.add(valor);
        });
      }
    }
  }
  return indice;
}

export function indexarServiceDomains(serviceDomains: string[]): IndiceCatalogo {
  const indice = indexarCards(serviceDomains.map(lerDomainCard));
  catalogoPadrao().serviceDomains.forEach((sd) => indice.serviceDomainsDoCatalogo.add(sd.id));
  return indice;
}

// Problemas do Zod viram CONF-01 (formato) ou CONF-02 (fonte obrigatória com origem = catalogo).
function violacoesDoSchema(saida: unknown): Violacao[] {
  const resultado = schemaModeloFormal.safeParse(saida);
  if (resultado.success) return [];
  return resultado.error.issues.map((issue) => {
    const caminho = issue.path.join('.');
    const ehFonte = issue.path.at(-1) === 'fonte';
    return {
      regra: ehFonte ? 'CONF-02' : 'CONF-01',
      caminho,
      descricao: ehFonte
        ? `Campo "fonte" inválido em ${caminho}: ${issue.message}`
        : `Saída fora do contrato em ${caminho || 'raiz'}: ${issue.message}`,
      acaoEsperada: ehFonte
        ? 'Preencher "fonte" com um identificador de <domain_cards> quando origem = catalogo, ou usar null quando origem = derivado'
        : 'Corrigir o campo para obedecer ao contrato de saída',
    } satisfies Violacao;
  });
}

export function validarModeloFormal(saida: unknown, indice: IndiceCatalogo): RelatorioValidacao {
  const regrasAplicadas: RegraConformidade[] = ['CONF-01', 'CONF-02'];
  const doSchema = violacoesDoSchema(saida);
  // Sem estrutura válida não há como aplicar as demais regras com segurança.
  if (doSchema.length > 0) return { aprovado: false, violacoes: doSchema, regrasAplicadas };

  const modelo = schemaModeloFormal.parse(saida);
  const v: Violacao[] = [];
  regrasAplicadas.push(
    'CONF-03',
    'CONF-04',
    'CONF-05',
    'CONF-06',
    'CONF-07',
    'CONF-08',
    'CONF-09',
    'CONF-10',
    'CONF-11',
    'CONF-12',
  );

  // CONF-03: toda fonte citada existe nos cards.
  const conferirFonte = (fonte: string | null, caminho: string): boolean => {
    if (fonte !== null && !indice.fontes.has(fonte)) {
      v.push({
        regra: 'CONF-03',
        caminho: `${caminho}.fonte`,
        descricao: `A fonte "${fonte}" não existe nos domain cards selecionados`,
        acaoEsperada: 'Citar um identificador presente em <domain_cards> ou marcar o item como derivado',
      });
      return false;
    }
    return true;
  };

  modelo.entidades.forEach((entidade, i) => {
    const caminho = `entidades[${i}]`;
    conferirFonte(entidade.fonte, caminho);
    // CONF-07: toda entidade corresponde a um control record selecionado.
    if (!indice.controlRecords.has(entidade.control_record)) {
      v.push({
        regra: 'CONF-07',
        caminho: `${caminho}.control_record`,
        descricao: `"${entidade.control_record}" não é control record de nenhum Service Domain selecionado`,
        acaoEsperada: 'Criar entidades apenas para os control records dos cards selecionados',
      });
    }
    entidade.atributos.forEach((atributo, j) => {
      const ca = `${caminho}.atributos[${j}]`;
      const fonteOk = conferirFonte(atributo.fonte, ca);
      // CONF-05: atributo marcado como catálogo precisa existir nos campos do schema citado.
      if (atributo.origem === 'catalogo' && fonteOk && atributo.fonte) {
        const campos = indice.camposPorFonte.get(atributo.fonte);
        if (campos && !campos.has(atributo.nome)) {
          const schemaQueDeclara = entidade.fonte && indice.camposPorFonte.get(entidade.fonte)?.has(atributo.nome) ? entidade.fonte : null;
          v.push({
            regra: 'CONF-05',
            caminho: `${ca}.nome`,
            descricao: `O campo "${atributo.nome}" não existe em ${atributo.fonte}, mas está marcado como catalogo`,
            acaoEsperada: schemaQueDeclara
              ? `Manter o nome "${atributo.nome}" e usar em "fonte" o schema que declara o campo: ${schemaQueDeclara}. O schema do enum vale só para os valores`
              : 'Usar o nome literal do campo do card ou marcar o atributo como derivado',
          });
        }
      }
      // CONF-04: valores de enum literalmente iguais aos do card.
      const enumDoTipo = indice.enumPorTipo.get(atributo.tipo);
      if (atributo.valores && enumDoTipo) {
        const fora = atributo.valores.filter((valor) => !enumDoTipo.includes(valor));
        if (fora.length > 0) {
          v.push({
            regra: 'CONF-04',
            caminho: `${ca}.valores`,
            descricao: `Valores fora do enum ${atributo.tipo}: ${fora.join(', ')}`,
            acaoEsperada: `Copiar literalmente os valores de ${atributo.tipo}: ${enumDoTipo.join(', ')}`,
          });
        }
      }
    });
  });

  modelo.relacionamentos.forEach((rel, i) => conferirFonte(rel.fonte, `relacionamentos[${i}]`));
  modelo.eventos_dominio.forEach((ev, i) => conferirFonte(ev.fonte, `eventos_dominio[${i}]`));

  modelo.maquinas_estado.forEach((maquina, i) => {
    const caminho = `maquinas_estado[${i}]`;
    conferirFonte(maquina.fonte, caminho);
    // CONF-04: estados declarados como vindos do catálogo precisam ser valores de enum do card.
    if (maquina.origem === 'catalogo') {
      const fora = maquina.estados.filter((estado) => !indice.todosOsValoresDeEnum.has(estado));
      if (fora.length > 0) {
        v.push({
          regra: 'CONF-04',
          caminho: `${caminho}.estados`,
          descricao: `Estados que não existem em nenhum enum do card: ${fora.join(', ')}`,
          acaoEsperada: 'Usar os valores literais do enum de status do card',
        });
      }
    }
    // CONF-06: transições são derivadas, mas só podem ligar estados declarados na própria máquina.
    maquina.transicoes.forEach((t, j) => {
      const invalidos = [t.de, t.para].filter((estado) => !maquina.estados.includes(estado));
      if (invalidos.length > 0) {
        v.push({
          regra: 'CONF-06',
          caminho: `${caminho}.transicoes[${j}]`,
          descricao: `Transição ${t.de} → ${t.para} usa estado não declarado: ${invalidos.join(', ')}`,
          acaoEsperada: 'Ligar apenas estados presentes em "estados"',
        });
      }
    });
  });

  validarCompletude(modelo, indice, v);

  return { aprovado: v.length === 0, violacoes: v, regrasAplicadas };
}

// Identificador em PascalCase composto, como SessionDuration; palavras simples não entram.
const IDENTIFICADOR = /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g;

// CONF-08 a CONF-12: pegam omissões e referências soltas que as regras de origem não veem.
// Continuam estruturais: não dizem se uma regra de negócio derivada está certa.
function validarCompletude(modelo: ModeloFormal, indice: IndiceCatalogo, v: Violacao[]): void {
  const entidades = new Set(modelo.entidades.map((e) => e.nome));
  const desconhecidos = (nomes: string[]) =>
    nomes.filter((nome) => !indice.nomesConhecidos.has(nome));

  modelo.entidades.forEach((entidade, i) => {
    const caminho = `entidades[${i}]`;
    const gerados = new Set(entidade.atributos.map((a) => a.nome));
    const faltam = (indice.camposPorControlRecord.get(entidade.control_record) ?? []).filter(
      (campo) => !gerados.has(campo),
    );
    if (faltam.length > 0) {
      v.push({
        regra: 'CONF-08',
        caminho: `${caminho}.atributos`,
        descricao: `Campos do control record ausentes: ${faltam.join(', ')}`,
        acaoEsperada: 'Incluir todos os campos do control record como atributos',
      });
    }
    if (!modelo.maquinas_estado.some((m) => m.entidade === entidade.nome)) {
      v.push({
        regra: 'CONF-09',
        caminho: 'maquinas_estado',
        descricao: `A entidade ${entidade.nome} não tem máquina de estados`,
        acaoEsperada:
          'Modelar o ciclo de vida: usar o enum de status do card ou, se não houver, estados derivados com lacuna',
      });
    }
    if (!modelo.eventos_dominio.some((ev) => ev.nome && ev.gatilho.trim() !== '')) {
      v.push({
        regra: 'CONF-10',
        caminho: 'eventos_dominio',
        descricao: `Nenhum evento de domínio para ${entidade.nome}`,
        acaoEsperada: 'Declarar ao menos um evento por entidade, ligado a uma transição do ciclo de vida',
      });
    }
    const referencias = entidade.atributos.filter(
      (a) => a.nome.endsWith('Reference') && a.tipo !== 'Party',
    );
    if (referencias.length > 0 && !modelo.relacionamentos.some((r) => r.de === entidade.nome)) {
      v.push({
        regra: 'CONF-11',
        caminho: 'relacionamentos',
        descricao: `${entidade.nome} tem referências (${referencias.map((a) => a.nome).join(', ')}), mas nenhum relacionamento`,
        acaoEsperada: 'Declarar um relacionamento para cada atributo que referencia outra parte ou domínio',
      });
    }
    if (!modelo.invariantes.some((inv) => inv.entidades_afetadas.includes(entidade.nome))) {
      v.push({
        regra: 'CONF-12',
        caminho: 'invariantes',
        descricao: `Nenhuma invariante para ${entidade.nome}`,
        acaoEsperada: 'Declarar ao menos uma invariante usando apenas campos do card',
      });
    }
  });

  modelo.maquinas_estado.forEach((maquina, i) => {
    const caminho = `maquinas_estado[${i}]`;
    if (!/status/i.test(maquina.campo)) {
      v.push({
        regra: 'CONF-09',
        caminho: `${caminho}.campo`,
        descricao: `"${maquina.campo}" não é um campo de status, então não representa um ciclo de vida`,
        acaoEsperada: 'Usar máquina de estados só para campos de status, nunca para enums de tipo ou de data',
      });
    }
    if (maquina.estados.length < 2 || maquina.transicoes.length === 0) {
      v.push({
        regra: 'CONF-09',
        caminho,
        descricao: 'Máquina de estados sem ao menos 2 estados e 1 transição',
        acaoEsperada: 'Declarar os estados e as transições válidas entre eles',
      });
    }
  });

  modelo.eventos_dominio.forEach((evento, i) => {
    const fora = desconhecidos(evento.payload);
    if (fora.length > 0) {
      v.push({
        regra: 'CONF-10',
        caminho: `eventos_dominio[${i}].payload`,
        descricao: `Payload cita nomes fora do card: ${fora.join(', ')}`,
        acaoEsperada: 'Usar no payload apenas nomes de campos presentes no card',
      });
    }
  });

  modelo.relacionamentos.forEach((rel, i) => {
    const caminho = `relacionamentos[${i}].para`;
    const problema = (descricao: string, acaoEsperada: string) =>
      v.push({ regra: 'CONF-11', caminho, descricao, acaoEsperada });
    if (!rel.externo && !entidades.has(rel.para)) {
      problema(`"${rel.para}" não é uma entidade do modelo`, 'Apontar para uma entidade gerada ou marcar externo = true');
    }
    if (rel.externo && indice.serviceDomainsSelecionados.has(rel.para)) {
      problema(`"${rel.para}" está selecionado e não pode ser externo`, 'Apontar para a entidade do domínio selecionado, sem relacionamento consigo mesmo');
    }
    if (
      rel.externo &&
      indice.serviceDomainsDoCatalogo.size > 0 &&
      !indice.serviceDomainsDoCatalogo.has(rel.para)
    ) {
      problema(`"${rel.para}" não é um Service Domain do catálogo`, 'Usar o id de um Service Domain de <service_landscape>, ou registrar como lacuna');
    }
    if (rel.de === rel.para) {
      problema('Relacionamento da entidade consigo mesma', 'Remover o relacionamento ou apontar para outra entidade');
    }
  });

  modelo.invariantes.forEach((invariante, i) => {
    const fora = desconhecidos(invariante.expressao.match(IDENTIFICADOR) ?? []);
    if (fora.length > 0) {
      v.push({
        regra: 'CONF-12',
        caminho: `invariantes[${i}].expressao`,
        descricao: `A invariante cita nomes fora do card: ${[...new Set(fora)].join(', ')}`,
        acaoEsperada: 'Escrever a invariante usando apenas campos, schemas e valores presentes no card',
      });
    }
  });
}
