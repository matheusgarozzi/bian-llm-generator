// Integração com o LLM (Vercel AI SDK + endpoint compatível com OpenAI, ex.: LM Studio).
export { carregarConfigLLM, type LLMConfig } from './config';
export { criarModelo } from './provider';
export { gerarObjeto, traduzirErro, type GerarObjetoParams } from './client';
export { ErroLLM, type TipoErroLLM } from './errors';
export { conversar, type ConversarParams } from './chat';
