import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

// O histórico fica só na memória do navegador: recarregar a página começa uma conversa nova.
const transporte = new DefaultChatTransport({ api: '/api/chat' });

function Mensagem({ mensagem }: { mensagem: UIMessage }) {
  const raciocinio = mensagem.parts
    .flatMap((parte) => (parte.type === 'reasoning' ? [parte.text] : []))
    .join('')
    .trim();
  const texto = mensagem.parts
    .flatMap((parte) => (parte.type === 'text' ? [parte.text] : []))
    .join('');

  return (
    <div className={`mensagem mensagem-${mensagem.role}`}>
      {raciocinio && (
        <details className="raciocinio">
          <summary>Raciocínio da IA</summary>
          <p>{raciocinio}</p>
        </details>
      )}
      {texto && <p className="texto">{texto}</p>}
    </div>
  );
}

export function Chat() {
  const { messages, sendMessage, status, stop, error, clearError, setMessages } = useChat({
    transport: transporte,
  });
  const [entrada, setEntrada] = useState('');
  const fimDaLista = useRef<HTMLDivElement>(null);
  const ocupado = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    const texto = entrada.trim();
    if (!texto || ocupado) return;
    clearError();
    sendMessage({ text: texto });
    setEntrada('');
  }

  // Enter envia; Shift+Enter quebra a linha.
  function aoTeclar(evento: KeyboardEvent<HTMLTextAreaElement>) {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      enviar();
    }
  }

  return (
    <section className="chat">
      <div className="mensagens">
        {messages.length === 0 && (
          <p className="vazio">Pergunte algo sobre a arquitetura BIAN para começar.</p>
        )}
        {messages.map((mensagem) => (
          <Mensagem key={mensagem.id} mensagem={mensagem} />
        ))}
        {status === 'submitted' && <p className="pensando">A IA está pensando…</p>}
        {error && <p className="erro">{error.message}</p>}
        <div ref={fimDaLista} />
      </div>

      <form className="entrada" onSubmit={enviar}>
        <textarea
          value={entrada}
          onChange={(evento) => setEntrada(evento.target.value)}
          onKeyDown={aoTeclar}
          placeholder="Digite sua mensagem (Enter envia, Shift+Enter quebra linha)"
          rows={3}
        />
        <div className="acoes">
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={ocupado || messages.length === 0}
          >
            Nova conversa
          </button>
          {ocupado ? (
            <button type="button" onClick={stop}>
              Parar
            </button>
          ) : (
            <button type="submit" disabled={!entrada.trim()}>
              Enviar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
