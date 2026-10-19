// Condensador do catálogo (docs/prompt/estrutura-modelo-formal.md, seção 3): lê os YAMLs oficiais do
// BIAN em docs/bian-catalogs/oas3 e gera um domain card por Service Domain em docs/bian-catalogs/cards.
// Offline e determinístico: a mesma entrada gera sempre os mesmos arquivos.
//
// Uso: npm run catalogo:condensar
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const DIR_CATALOGO = path.resolve(__dirname, '../../docs/bian-catalogs');
const DIR_OAS = path.join(DIR_CATALOGO, 'oas3');
const DIR_CARDS = path.join(DIR_CATALOGO, 'cards');

// Commit do repositório bian-official/public de onde os YAMLs de oas3/ foram baixados (R7).
const COMMIT_BIAN = 'b58bf4c2c300dd018afc084e9bb24b7adaaa3500';

// R2: o control record é o nível 0; schemas até este nível são expandidos. Baixar para 2 reduz
// os cards grandes em ~15% (medido); ver a tabela de tamanhos no doc.
const PROFUNDIDADE_MAXIMA = 3;

// Os schemas de enum do BIAN trazem na descrição um parágrafo por valor (Paymentpurposevalues tem
// quase 10 KB). Desligado, o enum mantém só os valores literais (R3): os cards grandes caem de
// ~115 KB para ~45 KB. O R4 continua valendo para as descrições de campos e de schemas.
const INCLUIR_DESCRICAO_DE_ENUM = false;

// Os 4 pilotos do MVP e o StandingOrder, usado só no exemplo few-shot (B5).
const CONTROL_RECORDS: Record<string, string> = {
  PaymentOrderInitiation: 'PaymentOrderInitiationTransaction',
  PaymentRail: 'PaymentRailOperatingSession',
  PartyReferenceDataDirectory: 'PartyReferenceDataDirectoryEntry',
  CurrentAccount: 'CurrentAccountFacility',
  StandingOrder: 'StandingOrderFacility',
};

// R5: schemas de erro nunca entram, mesmo que alguma referência chegue até eles.
const DESCARTADOS = new Set(['HTTPError']);

interface SchemaOas {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  $ref?: string;
  properties?: Record<string, SchemaOas>;
}

// Formato do card (R6, YAML achatado): cada schema pelo identificador canônico; cada campo numa
// linha "Campo: tipo — descrição", em que o tipo é um primitivo com o formato entre parênteses ou
// o nome de outro schema do mesmo card.
interface SchemaCard {
  descricao?: string;
  tipo?: string;
  enum?: string[];
  campos?: Record<string, string>;
}

const PREFIXO_REF = '#/components/schemas/';

function nomeDoRef(ref: string): string {
  if (!ref.startsWith(PREFIXO_REF)) throw new Error(`$ref fora de components/schemas: ${ref}`);
  return ref.slice(PREFIXO_REF.length);
}

// R4: descrições preservadas, só com os espaços normalizados; vazias são omitidas.
function descricao(texto: string | undefined): string | undefined {
  const limpo = texto?.replace(/\s+/g, ' ').trim();
  return limpo ? limpo : undefined;
}

function primitivo(schema: SchemaOas): string {
  return `${schema.type ?? 'object'}${schema.format ? `(${schema.format})` : ''}`;
}

function condensar(serviceDomain: string) {
  const arquivo = `${serviceDomain}.yaml`;
  const oas = YAML.parse(fs.readFileSync(path.join(DIR_OAS, arquivo), 'utf8'));
  const schemas: Record<string, SchemaOas> = oas.components.schemas;
  const controlRecord = CONTROL_RECORDS[serviceDomain];
  if (!schemas[controlRecord]) {
    throw new Error(`${arquivo}: control record ${controlRecord} não existe em components/schemas`);
  }
  const id = (nome: string) => `${serviceDomain}${PREFIXO_REF}${nome}`;

  // R1: busca em largura a partir do control record, guardando a menor profundidade de cada schema.
  const profundidade = new Map<string, number>([[controlRecord, 0]]);
  const fila = [controlRecord];
  while (fila.length > 0) {
    const nome = fila.shift()!;
    const nivel = profundidade.get(nome)!;
    for (const prop of Object.values(schemas[nome].properties ?? {})) {
      if (!prop.$ref) continue;
      const alvo = nomeDoRef(prop.$ref);
      if (DESCARTADOS.has(alvo) || profundidade.has(alvo)) continue;
      if (!schemas[alvo]) throw new Error(`${arquivo}: $ref para schema inexistente ${alvo}`);
      profundidade.set(alvo, nivel + 1);
      // Além do limite só os enums seguem (R3); objetos ficam só pelo nome (R2).
      if (nivel + 1 <= PROFUNDIDADE_MAXIMA || schemas[alvo].enum) fila.push(alvo);
    }
  }

  const expandidos: Record<string, SchemaCard> = {};
  const naoExpandidos: string[] = [];
  for (const [nome, nivel] of profundidade) {
    const schema = schemas[nome];
    if (nivel > PROFUNDIDADE_MAXIMA && !schema.enum) {
      naoExpandidos.push(id(nome));
      continue;
    }
    const card: SchemaCard = {
      descricao:
        schema.enum && !INCLUIR_DESCRICAO_DE_ENUM ? undefined : descricao(schema.description),
    };
    if (schema.enum) {
      card.enum = schema.enum;
    } else if (schema.properties) {
      card.campos = {};
      for (const [campo, prop] of Object.entries(schema.properties)) {
        const tipo = prop.$ref ? nomeDoRef(prop.$ref) : primitivo(prop);
        const texto = descricao(prop.description);
        card.campos[campo] = texto ? `${tipo} — ${texto}` : tipo;
      }
    } else {
      card.tipo = primitivo(schema);
    }
    expandidos[id(nome)] = card;
  }

  // Behaviour qualifiers vêm das tags "BQ - X" das operações; ficam só pelo nome.
  const behaviourQualifiers = new Set<string>();
  for (const operacoes of Object.values<Record<string, { tags?: string[] }>>(oas.paths)) {
    for (const operacao of Object.values(operacoes)) {
      for (const tag of operacao.tags ?? []) {
        if (tag.startsWith('BQ - ')) behaviourQualifiers.add(tag.slice('BQ - '.length));
      }
    }
  }

  return {
    service_domain: serviceDomain,
    control_record: controlRecord,
    descricao: descricao(oas.info.description),
    arquivo_origem: arquivo,
    versao_bian: String(oas.info.version),
    commit_bian: COMMIT_BIAN,
    behaviour_qualifiers: [...behaviourQualifiers].sort(),
    schemas: expandidos,
    tipos_nao_expandidos: naoExpandidos.sort(),
  };
}

function serializar(card: ReturnType<typeof condensar>): string {
  const documento = new YAML.Document(card);
  // Listas (enums, behaviour qualifiers) em uma linha só: [A, B, C].
  YAML.visit(documento, {
    Seq(_, no) {
      no.flow = true;
    },
  });
  return (
    `# Domain card gerado por backend/scripts/condensar-catalogo.ts a partir de oas3/${card.arquivo_origem}.\n` +
    '# Não edite à mão: rode "npm run catalogo:condensar" no backend.\n' +
    documento.toString({ lineWidth: 0 })
  );
}

function main() {
  fs.mkdirSync(DIR_CARDS, { recursive: true });
  const manifesto: Record<string, { schemas: number; naoExpandidos: number; bytes: number }> = {};

  for (const serviceDomain of Object.keys(CONTROL_RECORDS)) {
    const card = condensar(serviceDomain);
    const texto = serializar(card);
    fs.writeFileSync(path.join(DIR_CARDS, `${serviceDomain}.yaml`), texto);
    const bytes = Buffer.byteLength(texto);
    manifesto[serviceDomain] = {
      schemas: Object.keys(card.schemas).length,
      naoExpandidos: card.tipos_nao_expandidos.length,
      bytes,
    };
    console.log(
      `${serviceDomain}: ${manifesto[serviceDomain].schemas} schemas, ` +
        `${card.tipos_nao_expandidos.length} não expandidos, ${(bytes / 1024).toFixed(1)} KB`,
    );
  }

  fs.writeFileSync(
    path.join(DIR_CARDS, 'manifesto.json'),
    JSON.stringify(
      {
        versaoBian: '14.0.0',
        commitBian: COMMIT_BIAN,
        profundidadeMaxima: PROFUNDIDADE_MAXIMA,
        cards: manifesto,
      },
      null,
      2,
    ) + '\n',
  );
}

main();
