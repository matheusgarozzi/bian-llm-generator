// Monta o app Express sem abrir porta, para os testes poderem subir o servidor à parte.
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { criarCatalogoController } from './controllers/catalogo.controller';
import { criarChatController } from './controllers/chat.controller';
import { criarGenerateController } from './controllers/generate.controller';
import { criarPromptPreviewController } from './controllers/prompt.controller';
import type { LLMConfig } from './llm';

export function criarApp(config?: LLMConfig) {
  const app = express();

  app.use(cors());
  // O histórico inteiro da conversa vai em cada requisição; 100 kB (padrão) acaba rápido.
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/chat', criarChatController(config));
  app.post('/api/generate', criarGenerateController());
  app.get('/api/catalogo/service-domains', criarCatalogoController());
  app.post('/api/prompt/preview', criarPromptPreviewController());

  // Corpo que não é JSON: responde no mesmo formato de erro das rotas, em vez da página HTML do Express.
  app.use((erro: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (erro instanceof SyntaxError && 'body' in erro) {
      res.status(400).json({ erro: 'Corpo da requisição não é um JSON válido' });
      return;
    }
    next(erro);
  });

  return app;
}
