// Monta o app Express sem abrir porta, para os testes poderem subir o servidor à parte.
import express from 'express';
import cors from 'cors';
import { criarChatController } from './controllers/chat.controller';
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

  return app;
}
