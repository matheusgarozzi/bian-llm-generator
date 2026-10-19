import { useId, type ReactNode } from 'react';

// Tooltip que abre no hover e no foco do teclado; o texto também fica ligado ao elemento via
// aria-describedby, para leitores de tela.
export function Tooltip({ texto, children }: { texto: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="com-tooltip" tabIndex={0} aria-describedby={id}>
      {children}
      <span role="tooltip" id={id} className="tooltip">
        {texto}
      </span>
    </div>
  );
}
