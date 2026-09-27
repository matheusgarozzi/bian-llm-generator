# bian-llm-generator

Gerador de Aplicações Guiado por Arquitetura de Referência utilizando LLM.

TCC — Gerador de código guiado pela arquitetura de referência BIAN, usando LLM para propor o desenho de solução e um validador determinístico (gatekeeper) para garantir conformidade com o modelo formal.

## Estrutura do monorepo

```
bian-llm-generator/
├── backend/          Node.js + TypeScript — API e motor de geração
│   └── src/
│       ├── controllers/     Camada HTTP (entrada/saída das requisições)
│       ├── services/        Regras de negócio e orquestração
│       ├── repositories/    Acesso a dados
│       ├── prompt-engine/   Motor de Prompt (monta e envia prompts ao LLM)
│       ├── formal-model/    Gerador do Modelo Formal (ex.: C4) a partir da saída do LLM
│       └── gatekeeper/      Validador determinístico de conformidade com a arquitetura BIAN
├── frontend/         React + TypeScript (CSR, via Vite) — interface do gerador
└── docs/
    ├── bian-catalogs/       Recortes (JSON) do catálogo BIAN release 14.0 (Payments)
    └── c4-models/           Modelos C4 gerados/documentados
```

## Tecnologias

- **Backend**: Node.js, TypeScript, Express, [Vercel AI SDK (`ai`)](https://sdk.vercel.ai/) como camada de abstração para o LLM, ESLint + Prettier.
- **Frontend**: React + TypeScript, Vite (CSR), oxlint + Prettier.

## Como rodar localmente

### Backend

```bash
cd backend
npm install
cp .env.example .env   # preencher LLM_API_KEY
npm run dev             # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

## Scripts úteis

| Pacote   | Comando         | Descrição                     |
|----------|-----------------|--------------------------------|
| backend  | `npm run dev`   | Servidor de dev com hot-reload |
| backend  | `npm run build` | Compila TypeScript para `dist` |
| backend  | `npm run lint`  | Lint com ESLint                |
| frontend | `npm run dev`   | Servidor de dev (Vite)         |
| frontend | `npm run build` | Build de produção              |
| frontend | `npm run lint`  | Lint com oxlint                |
