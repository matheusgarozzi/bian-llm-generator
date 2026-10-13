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

## Como rodar localmente (com a IA local)

O sistema usa um LLM que roda na sua própria máquina, servido pelo **LM Studio**. Não precisa
de conta nem de chave de API. O backend fala com o LM Studio por um endpoint compatível com a
API da OpenAI, via Vercel AI SDK (`@ai-sdk/openai-compatible`).

```
Navegador (React, :5173) ──/api──▶ Backend (Express, :3000) ──▶ LM Studio (:1234) ──▶ qwen/qwen3.5-9b
```

### Pré-requisitos

- **Node.js** 22.12 ou superior (ou 20.19+), com npm. O Vite 8 do frontend exige essa versão.
- **LM Studio**: https://lmstudio.ai (Windows, macOS ou Linux).
- Cerca de **7 GB livres em disco** para o modelo e **16 GB de RAM**. Uma placa de vídeo com
  8 GB ou mais deixa as respostas bem mais rápidas, mas não é obrigatória.

### Passo 1: instalar o LM Studio e baixar a IA

1. Baixe e instale o LM Studio em https://lmstudio.ai.
2. Abra o LM Studio, vá em **Discover** (ícone de lupa), busque por `qwen3.5-9b` e baixe o
   modelo **`qwen/qwen3.5-9b`** (cerca de 6,5 GB).
3. No seletor de modelos no topo da janela, **carregue** o `qwen/qwen3.5-9b`.

### Passo 2: ligar o servidor local do LM Studio

1. Vá na aba **Developer** (ícone `>_`).
2. Ligue o **servidor local** (chave *Status: Running*). Ele sobe em `http://localhost:1234`.
3. Confira se o servidor responde. A lista deve mostrar `qwen/qwen3.5-9b`:

   ```bash
   curl http://localhost:1234/v1/models
   ```

> O servidor **desliga quando o LM Studio é fechado**. Ligue-o de novo sempre que for usar o
> sistema, ou ative a opção de iniciar o servidor automaticamente nas configurações da aba
> Developer.

<details>
<summary>Alternativa pelo terminal (CLI <code>lms</code>, instalada junto com o LM Studio)</summary>

```bash
lms get qwen/qwen3.5-9b   # baixa o modelo
lms load qwen/qwen3.5-9b  # carrega na memória
lms server start          # liga o servidor na porta 1234
lms status                # confere: "Server: ON"
```

No Windows, se o comando `lms` não for encontrado, ele fica em
`%USERPROFILE%\.lmstudio\bin\lms.exe`.
</details>

### Passo 3: configurar o `.env` do backend

Crie o arquivo `backend/.env` a partir do exemplo:

```bash
cd backend
cp .env.example .env            # PowerShell: Copy-Item .env.example .env
```

Com o LM Studio no padrão (porta 1234, modelo `qwen/qwen3.5-9b`), **não precisa alterar nada**.
O que cada variável faz:

| Variável | Valor padrão | O que é |
|----------|--------------|---------|
| `PORT` | `3000` | Porta do backend. Se mudar, ajuste o proxy em `frontend/vite.config.ts`. |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | Endereço do servidor do LM Studio (sempre terminando em `/v1`). Mude só se trocou a porta no LM Studio ou se ele roda em outra máquina. |
| `LLM_MODEL` | `qwen/qwen3.5-9b` | Identificador do modelo, **igual ao que aparece** em `curl http://localhost:1234/v1/models` (ou na aba Developer). |
| `LLM_API_KEY` | *(vazio)* | O LM Studio não pede chave. Preencha só se usar um servidor que exija. |
| `LLM_TEMPERATURE` | `0` | Criatividade na geração do modelo formal. `0` deixa as respostas determinísticas. |
| `LLM_CHAT_TEMPERATURE` | `0.7` | Criatividade no chat livre (respostas menos repetitivas). |
| `LLM_TOP_P` | `1` | Amostragem *nucleus*; normalmente fica em `1`. |
| `LLM_TIMEOUT_MS` | `120000` | Quanto tempo (ms) esperar o modelo começar a responder antes de desistir. Aumente se a máquina for lenta. |
| `LLM_MAX_RETRIES` | `1` | Quantas vezes repetir a chamada se o LM Studio falhar. |

### Passo 4: rodar o backend

```bash
cd backend
npm install
npm run dev                     # http://localhost:3000
```

Para testar a integração com a IA sem o frontend:

```bash
npm run llm:testar              # pede um objeto estruturado ao modelo e imprime o resultado
```

### Passo 5: rodar o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

Abra http://localhost:5173 e use o chat. O Vite repassa as chamadas `/api` para o backend na
porta 3000.

### Problemas comuns

| Sintoma | Causa e solução |
|---------|-----------------|
| *"Não foi possível falar com o LLM em http://localhost:1234/v1 (Cannot connect to API)"* | O servidor do LM Studio está desligado. Ligue-o na aba Developer ou rode `lms server start`. |
| Erro dizendo que o modelo não existe ou não está carregado | O modelo não está carregado ou `LLM_MODEL` está com outro nome. Carregue o modelo e confira o nome em `/v1/models`. |
| *"O LLM não respondeu em 120000 ms"* | A máquina está lenta ou o modelo ainda estava carregando. Aumente `LLM_TIMEOUT_MS` no `.env`. |
| Respostas muito lentas | Modelos locais dependem do hardware. No LM Studio, ative a GPU (*GPU offload*) nas opções do modelo. |
| Resposta cortada no meio de conversas longas | O contexto do modelo encheu. Aumente o *Context Length* nas opções de carregamento do modelo ou comece uma conversa nova. |

### Como a integração funciona no código

- `backend/src/llm/`: `criarModelo` cria o modelo a partir da configuração do `.env` (para trocar
  de modelo, por exemplo a IA avaliadora, basta passar outra configuração). `gerarObjeto` gera uma
  saída validada por um schema Zod e `conversar` responde o chat em streaming, ambos com timeout e
  erros tipados (`ErroLLM`).
- `POST /api/chat` (`backend/src/controllers/chat.controller.ts`) recebe o histórico da conversa e
  devolve a resposta em streaming, com o prompt de sistema de `backend/src/prompt-engine/chat.ts`.
- O histórico do chat fica só na memória do navegador: recarregar a página começa uma conversa nova.
- O raciocínio do Qwen (`<think>`) aparece separado da resposta, num bloco recolhível.

## Scripts úteis

| Pacote   | Comando         | Descrição                     |
|----------|-----------------|--------------------------------|
| backend  | `npm run dev`   | Servidor de dev com hot-reload |
| backend  | `npm run build` | Compila TypeScript para `dist` |
| backend  | `npm run lint`  | Lint com ESLint                |
| backend  | `npm test`      | Testes (LLM e chat contra servidor falso) |
| backend  | `npm run llm:testar` | Teste real contra o LM Studio |
| frontend | `npm run dev`   | Servidor de dev (Vite)         |
| frontend | `npm run build` | Build de produção              |
| frontend | `npm run lint`  | Lint com oxlint                |
