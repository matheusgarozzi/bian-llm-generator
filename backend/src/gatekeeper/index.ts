// Validador de Conformidade (gatekeeper): regras CONF-01 a CONF-07 de
// docs/prompt/estrutura-modelo-formal.md, seção 8. Determinístico e sem LLM: só compara o
// modelo formal com os domain cards dos Service Domains selecionados.
import { parse } from 'yaml';
import { schemaModeloFormal } from '../prompt-engine/modelo-formal/schema';
import { lerDomainCard } from '../prompt-engine/modelo-formal/cards';

export type RegraConformidade =
  | 'CONF-01'
  | 'CONF-02'
  | 'CONF-03'
  | 'CONF-04'
  | 'CONF-05'
  | 'CONF-06'
  | 'CONF-07';

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
}

export function indexarCards(cardsYaml: string[]): IndiceCatalogo {
  const indice: IndiceCatalogo = {
    fontes: new Set(),
    controlRecords: new Set(),
    camposPorFonte: new Map(),
    enumPorTipo: new Map(),
    todosOsValoresDeEnum: new Set(),
  };
  for (const texto of cardsYaml) {
    const card = parse(texto) as CardLido;
    indice.controlRecords.add(card.control_record);
    for (const [id, schema] of Object.entries(card.schemas ?? {})) {
      indice.fontes.add(id);
      indice.camposPorFonte.set(id, new Set(Object.keys(schema?.campos ?? {})));
      if (Array.isArray(schema?.enum)) {
        const valores = schema.enum.map(String);
        indice.enumPorTipo.set(id.split('/').pop()!, valores);
        valores.forEach((valor) => indice.todosOsValoresDeEnum.add(valor));
      }
    }
  }
  return indice;
}

export function indexarServiceDomains(serviceDomains: string[]): IndiceCatalogo {
  return indexarCards(serviceDomains.map(lerDomainCard));
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
  regrasAplicadas.push('CONF-03', 'CONF-04', 'CONF-05', 'CONF-06', 'CONF-07');

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
          v.push({
            regra: 'CONF-05',
            caminho: `${ca}.nome`,
            descricao: `O campo "${atributo.nome}" não existe em ${atributo.fonte}, mas está marcado como catalogo`,
            acaoEsperada: 'Usar o nome literal do campo do card ou marcar o atributo como derivado',
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

  return { aprovado: v.length === 0, violacoes: v, regrasAplicadas };
}
