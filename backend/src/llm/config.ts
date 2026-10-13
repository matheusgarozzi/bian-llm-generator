// Configuração do LLM lida das variáveis de ambiente.
// Os valores padrão apontam para o LM Studio rodando localmente com o Qwen.

export interface LLMConfig {
  baseURL: string;
  modelo: string;
  apiKey?: string;
  temperature: number;
  // Temperatura do chat livre; a geração do modelo formal usa `temperature`.
  chatTemperature: number;
  topP: number;
  timeoutMs: number;
  maxRetries: number;
}

function numeroDoAmbiente(nome: string, padrao: number): number {
  const valor = process.env[nome];
  if (valor === undefined || valor.trim() === '') return padrao;
  const numero = Number(valor);
  if (Number.isNaN(numero)) {
    throw new Error(`Variável de ambiente ${nome} inválida: "${valor}" não é um número`);
  }
  return numero;
}

export function carregarConfigLLM(): LLMConfig {
  return {
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
    modelo: process.env.LLM_MODEL || 'qwen/qwen3.5-9b',
    apiKey: process.env.LLM_API_KEY || undefined,
    temperature: numeroDoAmbiente('LLM_TEMPERATURE', 0),
    chatTemperature: numeroDoAmbiente('LLM_CHAT_TEMPERATURE', 0.7),
    topP: numeroDoAmbiente('LLM_TOP_P', 1),
    timeoutMs: numeroDoAmbiente('LLM_TIMEOUT_MS', 120_000),
    maxRetries: numeroDoAmbiente('LLM_MAX_RETRIES', 1),
  };
}
