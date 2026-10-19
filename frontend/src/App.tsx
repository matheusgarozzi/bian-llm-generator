import { useState } from 'react';
import { Chat } from './Chat';
import { Gerador } from './Gerador';

type Aba = 'gerador' | 'chat';

function App() {
  const [aba, setAba] = useState<Aba>('gerador');

  return (
    // A tela de geração usa duas colunas (seleção e prompt) e precisa de mais largura.
    <main className={aba === 'gerador' ? 'largo' : undefined}>
      <h1>Gerador BIAN-LLM - MVP</h1>
      <p>Gerador de Aplicações Guiado por Arquitetura de Referência utilizando LLM.</p>
      <nav className="abas">
        <button type="button" aria-pressed={aba === 'gerador'} onClick={() => setAba('gerador')}>
          Gerar aplicação
        </button>
        <button type="button" aria-pressed={aba === 'chat'} onClick={() => setAba('chat')}>
          Chat sobre o BIAN
        </button>
      </nav>
      {/* O chat fica montado escondido para não perder a conversa ao trocar de aba. */}
      <div hidden={aba !== 'gerador'}>
        <Gerador />
      </div>
      <div hidden={aba !== 'chat'}>
        <Chat />
      </div>
    </main>
  );
}

export default App;
