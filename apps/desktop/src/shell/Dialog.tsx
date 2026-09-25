import { useEffect, useRef, type ReactNode } from 'react';

export type DialogButton = { label: string; onClick: () => void; primary?: boolean };

type Props = {
  icon: 'aviso' | 'erro' | 'info' | 'sucesso';
  label: string;
  children: ReactNode;
  buttons: DialogButton[];
  onEscape: () => void;
};

/**
 * Caixa de mensagem do design system: título com o nome do produto, ícone de 32px, fato e depois a pergunta,
 * botões à direita com o padrão primeiro. Modal: prende o foco e fecha com Esc.
 */
export function Dialog({ icon, label, children, buttons, onEscape }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  const ordered = [...buttons.filter((b) => b.primary), ...buttons.filter((b) => !b.primary)];
  return (
    <div className="rp-modal">
      <div
        ref={ref}
        className="rp-window rp-msgbox"
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onEscape();
          }
          if (e.key === 'Tab') {
            const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('input, button, [role=button]') ?? []);
            const i = focusable.indexOf(document.activeElement as HTMLElement);
            focusable[e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i + 1) % focusable.length]?.focus();
            e.preventDefault();
          }
        }}
      >
        <div className="rp-titlebar">
          <span>Renda+ ERP</span>
          <span className="rp-winbtns">
            <span role="button" tabIndex={0} aria-label="Fechar" onClick={onEscape} onKeyDown={(e) => e.key === 'Enter' && onEscape()}>
              ×
            </span>
          </span>
        </div>
        <div className="rp-window-body">
          <i className={`rp-ico rp-ico-status-${icon}`} />
          <div>{children}</div>
        </div>
        <div className="rp-window-foot">
          <div className="rp-btn-row">
            {ordered.map((b) => (
              <button key={b.label} type="button" className={b.primary ? 'rp-btn rp-btn--default' : 'rp-btn'} onClick={b.onClick}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
