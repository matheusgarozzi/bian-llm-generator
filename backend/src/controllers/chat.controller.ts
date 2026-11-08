// POST /api/chat: recebe o histórico (UIMessage[] do AI SDK) e devolve a resposta em streaming.
import { safeValidateUIMessages } from 'ai';
import type { Request, Response } from 'express';
import { carregarConfigLLM, conversar, traduzirErro, type LLMConfig } from '../llm';
import { montarPromptSistemaChat } from '../prompt-engine/chat';

export function criarChatController(config: LLMConfig = carregarConfigLLM()) {
  return async (req: Request, res: Response): Promise<void> => {
    const validacao = await safeValidateUIMessages({ messages: req.body?.messages });
    if (!validacao.success) {
      res.status(400).json({ erro: `Mensagens inválidas: ${validacao.error.message}` });
      return;
    }

    // Se o usuário clicar em "parar" ou fechar a aba, para de gerar no LLM também.
    const cancelamento = new AbortController();
    res.on('close', () => cancelamento.abort());

    try {
      const resultado = await conversar({
        mensagens: validacao.data,
        system: montarPromptSistemaChat(),
        config,
        abortSignal: cancelamento.signal,
      });
      resultado.pipeUIMessageStreamToResponse(res, {
        sendReasoning: true,
        // O texto devolvido aqui é o que o usuário vê no chat quando algo falha.
        onError: (erro) => traduzirErro(erro, config).message,
      });
    } catch (erro) {
      res.status(500).json({ erro: traduzirErro(erro, config).message });
    }
  };
}
