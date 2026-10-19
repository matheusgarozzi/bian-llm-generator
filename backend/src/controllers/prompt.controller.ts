// POST /api/prompt/preview: monta o prompt do modelo formal para a seleção, sem chamar o LLM.
// A tela de seleção usa para mostrar o prompt enquanto o usuário escolhe.
import type { Request, Response } from 'express';
import { ErroEntrada, estruturarEntrada, type Catalogo } from '../orchestrator/entrada';
import { montarPromptModeloFormal } from '../prompt-engine/modelo-formal';

export function criarPromptPreviewController(catalogo?: Catalogo) {
  return (req: Request, res: Response): void => {
    try {
      const entrada = estruturarEntrada(req.body, catalogo);
      res.json({ entrada, prompt: montarPromptModeloFormal(entrada) });
    } catch (erro) {
      if (erro instanceof ErroEntrada) {
        res.status(400).json({ erro: 'Entrada inválida', problemas: erro.problemas });
        return;
      }
      throw erro;
    }
  };
}
