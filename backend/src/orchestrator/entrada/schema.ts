// Contrato da entrada do usuário (RF001, RF017): seleção de Service Domains, nunca texto livre.
import { z } from 'zod';

export const MAX_RESTRICOES = 10;
export const MAX_DESCRICAO_RESTRICAO = 500;

export const schemaRestricao = z.strictObject({
  serviceDomain: z.string().trim().min(1),
  descricao: z.string().trim().min(1).max(MAX_DESCRICAO_RESTRICAO),
});

// strictObject: campos fora do contrato (ex.: "requisitos" em texto livre) são rejeitados.
export const schemaEntrada = z.strictObject({
  arquitetura: z.literal('BIAN'),
  versao: z.string().trim().min(1),
  serviceDomains: z.array(z.string().trim().min(1)).min(1, 'Selecione ao menos um Service Domain'),
  gerarFrontend: z.boolean(),
  restricoes: z.array(schemaRestricao).max(MAX_RESTRICOES).default([]),
});

export type Entrada = z.infer<typeof schemaEntrada>;
export type Restricao = z.infer<typeof schemaRestricao>;
