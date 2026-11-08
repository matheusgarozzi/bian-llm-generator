// Ponto único de criação do modelo de linguagem. Para trocar de modelo (ex.: a IA
// avaliadora), basta chamar criarModelo com outra configuração.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';
import { Agent, fetch as fetchUndici } from 'undici';
import { carregarConfigLLM, type LLMConfig } from './config';

// O fetch do Node desiste após 5 min sem cabeçalhos (headersTimeout). Na CPU, o LLM local leva
// mais que isso para responder sem streaming; o limite passa a ser o LLM_TIMEOUT_MS.
function fetchComTimeout(timeoutMs: number): typeof globalThis.fetch {
  const agente = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  return ((url: string, init?: RequestInit) =>
    fetchUndici(url, { ...(init as object), dispatcher: agente })) as unknown as typeof globalThis.fetch;
}

export function criarModelo(config: LLMConfig = carregarConfigLLM()): LanguageModel {
  const provedor = createOpenAICompatible({
    name: 'lmstudio',
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    // O LM Studio aceita response_format com json_schema, o que restringe a saída ao schema.
    supportsStructuredOutputs: true,
    fetch: fetchComTimeout(config.timeoutMs),
  });
  // O Qwen pode escrever o raciocínio entre <think></think> no meio do texto; o middleware
  // separa esse trecho como "reasoning", fora da resposta (o chat o exibe à parte).
  return wrapLanguageModel({
    model: provedor(config.modelo),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}
