import dotenv from 'dotenv';

dotenv.config();

// Importado depois do dotenv para a configuração do LLM já enxergar o .env.
import { criarApp } from './app';

const port = process.env.PORT ?? 3000;

criarApp().listen(port, () => {
  console.log(`Backend rodando na porta ${port}`);
});
