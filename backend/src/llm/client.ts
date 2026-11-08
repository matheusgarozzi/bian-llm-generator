// Cliente do LLM: gera um objeto estruturado validado por um schema Zod.
import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  generateText,
  type LanguageModel,
} from 'ai';
import type { z } from 'zod';
import { carregarConfigLLM, type LLMConfig } from './config';
import { ErroLLM } from './errors';
import { criarModelo } from './provider';

export interface GerarObjetoParams<SCHEMA extends z.ZodType> {
  schema: SCHEMA;
  prompt: string;
  system?: string;
  nomeSchema?: string;
  config?: LLMConfig;
  modelo?: LanguageModel;
}

export async function gerarObjeto<SCHEMA extends z.ZodType>({
  schema,
  prompt,
  system,
  nomeSchema,
  config = carregarConfigLLM(),
  modelo = criarModelo(config),
}: GerarObjetoParams<SCHEMA>): Promise<z.infer<SCHEMA>> {
  try {
    const { output } = await generateText({
      model: modelo,
      system,
      prompt,
      output: Output.object({ schema, name: nomeSchema }),
      temperature: config.temperature,
      topP: config.topP,
      maxRetries: config.maxRetries,
      timeout: config.timeoutMs,
      ...(config.reasoningEffort
        ? { providerOptions: { lmstudio: { reasoningEffort: config.reasoningEffort } } }
        : {}),
    });
    return output as z.infer<SCHEMA>;
  } catch (erro) {
    throw traduzirErro(erro, config);
  }
}

export function traduzirErro(erro: unknown, config: LLMConfig): ErroLLM {
  if (erro instanceof ErroLLM) return erro;

  const causa = RetryError.isInstance(erro) ? erro.lastError : erro;

  if (ehTimeout(causa)) {
    return new ErroLLM(
      'timeout',
      `O LLM não respondeu em ${config.timeoutMs} ms (modelo ${config.modelo})`,
      erro,
    );
  }
  if (NoObjectGeneratedError.isInstance(causa) || NoOutputGeneratedError.isInstance(causa)) {
    return new ErroLLM('resposta_invalida', 'O LLM respondeu fora do schema esperado', erro);
  }
  if (APICallError.isInstance(causa) || ehFalhaDeConexao(causa)) {
    return new ErroLLM(
      'indisponivel',
      `Não foi possível falar com o LLM em ${config.baseURL} (${mensagem(causa).replace(/:\s*$/, '')}). ` +
        'Verifique se o servidor local do LM Studio está ligado e com o modelo carregado.',
      erro,
    );
  }
  return new ErroLLM('desconhecido', `Erro inesperado ao chamar o LLM: ${mensagem(causa)}`, erro);
}

function ehTimeout(erro: unknown): boolean {
  return (
    erro instanceof Error &&
    (erro.name === 'TimeoutError' || erro.name === 'AbortError' || /timeout/i.test(erro.message))
  );
}

function ehFalhaDeConexao(erro: unknown): boolean {
  return erro instanceof Error && /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(erro.message);
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
