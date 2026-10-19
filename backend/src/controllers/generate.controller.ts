// POST /api/generate: por enquanto só lê, valida e devolve a entrada estruturada (task #63).
// A montagem do prompt e a chamada ao LLM entram nas próximas tasks do orquestrador.
import type { Request, Response } from 'express';
import { ErroEntrada, estruturarEntrada, type Catalogo } from '../orchestrator/entrada';

export function criarGenerateController(catalogo?: Catalogo) {
  return (req: Request, res: Response): void => {
    try {
      res.json(estruturarEntrada(req.body, catalogo));
    } catch (erro) {
      if (erro instanceof ErroEntrada) {
        res.status(400).json({ erro: 'Entrada inválida', problemas: erro.problemas });
        return;
      }
      throw erro;
    }
  };
}
