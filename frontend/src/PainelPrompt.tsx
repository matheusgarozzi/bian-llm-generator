import { useState } from 'react';

// Mesmo formato de backend/src/prompt-engine/modelo-formal/montar.ts.
export interface BlocoPrompt {
  id: string;
  titulo: string;
  papel: 'system' | 'user';
  conteudo: string;
}

// Acima disso (em caracteres) o bloco abre recolhido.
const LIMITE_ABERTO = 4000;

export interface PromptModeloFormal {
  system: string;
  prompt: string;
  blocos: BlocoPrompt[];
  tokensEstimados: number;
}

export type Previa =
  | { estado: 'vazio' }
  | { estado: 'carregando'; anterior?: PromptModeloFormal }
  | { estado: 'ok'; prompt: PromptModeloFormal }
  | { estado: 'erro'; problemas: string[] };

// Mostra o prompt do modelo formal montado pelo backend para a seleção atual.
export function PainelPrompt({ previa }: { previa: Previa }) {
  const [copiado, setCopiado] = useState(false);
  const prompt =
    previa.estado === 'ok'
      ? previa.prompt
      : previa.estado === 'carregando'
        ? previa.anterior
        : undefined;

  async function copiar() {
    if (!prompt) return;
    await navigator.clipboard.writeText(`[system]\n${prompt.system}\n\n[user]\n${prompt.prompt}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  return (
    <section className="painel-prompt" aria-live="polite">
      <header>
        <h2>Prompt gerado</h2>
        {prompt && (
          <>
            <span className="legenda">
              ~{prompt.tokensEstimados.toLocaleString('pt-BR')} tokens
              {previa.estado === 'carregando' && ' · atualizando…'}
            </span>
            <button type="button" onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
          </>
        )}
      </header>

      {previa.estado === 'vazio' && (
        <p className="vazio">Selecione um Service Domain para ver o prompt.</p>
      )}
      {previa.estado === 'carregando' && !prompt && <p className="vazio">Montando o prompt…</p>}
      {previa.estado === 'erro' && (
        <div className="erro">
          <p>Não foi possível montar o prompt:</p>
          <ul>
            {previa.problemas.map((problema) => (
              <li key={problema}>{problema}</li>
            ))}
          </ul>
        </div>
      )}

      {prompt?.blocos.map((bloco) => (
        <article key={bloco.id} className="bloco">
          <h3>
            <span className="bloco-id">{bloco.id}</span> {bloco.titulo}
            <span className="papel">{bloco.papel}</span>
          </h3>
          {/* Blocos longos (catálogo com os domain cards, contrato de saída) abrem recolhidos. */}
          {bloco.conteudo.length > LIMITE_ABERTO ? (
            <details>
              <summary>
                Mostrar conteúdo (~{Math.ceil(bloco.conteudo.length / 4).toLocaleString('pt-BR')}{' '}
                tokens)
              </summary>
              <pre>{bloco.conteudo}</pre>
            </details>
          ) : (
            <pre>{bloco.conteudo}</pre>
          )}
        </article>
      ))}
    </section>
  );
}
