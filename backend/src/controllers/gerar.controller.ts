// POST /api/gerar: gera o modelo formal com o LLM e o valida no gatekeeper (UC03 e UC04).
// Recebe a mesma entrada de /api/generate e devolve o status, o modelo aprovado e o relatório de
// cada tentativa.
import type { Request, Response } from 'express';
import { ErroEntrada, estruturarEntrada, type Catalogo } from '../orchestrator/entrada';
import { gerarModeloFormal, type ChamarLLM } from '../orchestrator/gerar-modelo';

export function criarGerarController(catalogo?: Catalogo, chamar?: ChamarLLM) {
  return async (req: Request, res: Response): Promise<void> => {
    let entrada;
    try {
      entrada = estruturarEntrada(req.body, catalogo);
    } catch (erro) {
      if (erro instanceof ErroEntrada) {
        res.status(400).json({ erro: 'Entrada inválida', problemas: erro.problemas });
        return;
      }
      throw erro;
    }
    const resultado = await gerarModeloFormal(entrada, chamar);
    res.status(resultado.status === 'FALHA_INFRA' ? 502 : 200).json({ entrada, ...resultado });
  };
}
