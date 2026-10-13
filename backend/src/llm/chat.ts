// Chat livre com o LLM: recebe o histórico da conversa e devolve a resposta em streaming.
import { convertToModelMessages, streamText, type LanguageModel, type UIMessage } from 'ai';
import { carregarConfigLLM, type LLMConfig } from './config';
import { criarModelo } from './provider';

export interface ConversarParams {
  mensagens: UIMessage[];
  system?: string;
  config?: LLMConfig;
  modelo?: LanguageModel;
  abortSignal?: AbortSignal;
}

export async function conversar({
  mensagens,
  system,
  config = carregarConfigLLM(),
  modelo = criarModelo(config),
  abortSignal,
}: ConversarParams) {
  return streamText({
    model: modelo,
    system,
    messages: await convertToModelMessages(mensagens),
    temperature: config.chatTemperature,
    topP: config.topP,
    maxRetries: config.maxRetries,
    // Sem limite total: respostas longas de um modelo local podem passar de minutos.
    // O limite vale para o primeiro trecho (inclui carregar o modelo) e para pausas no meio.
    timeout: { firstChunkMs: config.timeoutMs, chunkMs: config.timeoutMs },
    abortSignal,
  });
}
