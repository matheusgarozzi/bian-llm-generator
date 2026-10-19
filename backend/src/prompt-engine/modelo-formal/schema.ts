// Contrato de saída do modelo formal (bloco B4 de docs/prompt/estrutura-modelo-formal.md).
// O mesmo schema vai no texto do prompt e, na geração, no Output.object do AI SDK.
import { z } from 'zod';

const origem = z
  .enum(['catalogo', 'derivado'])
  .describe('catalogo: extraído de <domain_cards>; derivado: decisão de modelagem');

const fonte = z
  .string()
  .nullable()
  .describe(
    'Identificador de schema presente em <domain_cards>, ex.: PaymentOrderInitiation#/components/schemas/Amount. ' +
      'Obrigatório quando origem = catalogo; null quando origem = derivado.',
  );

interface Rastreio {
  origem: 'catalogo' | 'derivado';
  fonte: string | null;
}

// CONF-02: com origem = catalogo, "fonte" é obrigatória; com origem = derivado, é null.
function exigirFonte(item: Rastreio, ctx: z.RefinementCtx) {
  if (item.origem === 'catalogo' && !item.fonte?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['fonte'],
      message: 'obrigatória quando origem = catalogo',
    });
  }
  if (item.origem === 'derivado' && item.fonte !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['fonte'],
      message: 'deve ser null quando origem = derivado',
    });
  }
}

function rastreavel<SHAPE extends z.ZodRawShape>(shape: SHAPE) {
  // O TypeScript não consegue provar que o objeto genérico tem origem e fonte; o shape garante.
  return z
    .object({ ...shape, fonte, origem })
    .superRefine((item, ctx) => exigirFonte(item as unknown as Rastreio, ctx));
}

export const schemaModeloFormal = z.object({
  analise: z.string().describe('Raciocínio sobre a seleção, escrito antes dos demais campos'),
  entidades: z
    .array(
      rastreavel({
        nome: z.string().describe('Nome do control record; outros schemas não viram entidade'),
        control_record: z.string(),
        atributos: z.array(
          rastreavel({
            nome: z.string(),
            tipo: z.string().describe('Primitivo, como string(Text), ou nome de schema do card'),
            // O catálogo BIAN não declara campos obrigatórios (nenhum schema tem "required").
            obrigatorio: z
              .boolean()
              .nullable()
              .describe('null quando o card não declara a obrigatoriedade do campo'),
            // CONF-04: valores literais do enum, para o validador conferir contra o card.
            valores: z
              .array(z.string())
              .nullable()
              .describe('Valores do enum copiados do card quando o tipo é um enum; senão null'),
          }),
        ),
      }),
    )
    .describe('Uma entidade por control record selecionado'),
  relacionamentos: z.array(
    rastreavel({
      de: z.string(),
      para: z
        .string()
        .describe('Nome de uma entidade ou, se externo = true, id de um Service Domain'),
      papel: z.string(),
      cardinalidade: z.string().describe('Ex.: 1..1, 0..n'),
      externo: z
        .boolean()
        .describe('true quando "para" é um Service Domain não selecionado (referência externa)'),
    }),
  ),
  maquinas_estado: z.array(
    rastreavel({
      entidade: z.string(),
      campo: z.string(),
      estados: z.array(z.string()),
      transicoes: z.array(z.object({ de: z.string(), para: z.string() })),
    }),
  ),
  invariantes: z.array(
    z.object({
      id: z.string(),
      expressao: z.string(),
      entidades_afetadas: z.array(z.string()),
      justificativa: z.string(),
      // CONF-06: o catálogo BIAN não declara invariantes.
      origem: z.literal('derivado'),
    }),
  ),
  eventos_dominio: z.array(
    rastreavel({
      nome: z.string(),
      gatilho: z.string(),
      payload: z.array(z.string()),
    }),
  ),
  pontos_extensao: z.array(z.object({ nome: z.string(), alvo: z.string(), motivo: z.string() })),
  lacunas: z.array(z.object({ item: z.string(), motivo: z.string() })),
});

export type ModeloFormal = z.infer<typeof schemaModeloFormal>;

type NoJsonSchema = { [chave: string]: unknown };

// O refinamento do Zod não aparece no JSON Schema; repete a regra de "fonte" como if/then.
function adicionarIfThen(no: unknown): void {
  if (Array.isArray(no)) return no.forEach(adicionarIfThen);
  if (!no || typeof no !== 'object') return;
  const objeto = no as NoJsonSchema;
  const propriedades = objeto.properties as NoJsonSchema | undefined;
  if (propriedades?.origem && propriedades.fonte) {
    objeto.if = { properties: { origem: { const: 'catalogo' } } };
    objeto.then = { properties: { fonte: { type: 'string', minLength: 1 } } };
    objeto.else = { properties: { fonte: { type: 'null' } } };
  }
  Object.values(objeto).forEach(adicionarIfThen);
}

export function jsonSchemaModeloFormal(): NoJsonSchema {
  const jsonSchema = z.toJSONSchema(schemaModeloFormal) as NoJsonSchema;
  adicionarIfThen(jsonSchema);
  return jsonSchema;
}
