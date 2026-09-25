import { useEffect, useRef, type ReactNode } from 'react';

export type DialogButton = { label: string; onClick: () => void; primary?: boolean };

type Props = { title: string; children: ReactNode; buttons: DialogButton[]; onEscape: () => void };

/** Diálogo modal da janela de origem: prende o foco enquanto aberto e fecha com Esc. */
export function Dialog({ title, children, buttons, onEscape }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLButtonElement>('button[data-primary="true"], button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="rp-dialog__backdrop">
      <div
        ref={ref}
        className="rp-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onEscape();
          }
          if (e.key === 'Tab') {
            const focusable = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
            const i = focusable.indexOf(document.activeElement as HTMLButtonElement);
            const next = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i + 1) % focusable.length;
            focusable[next]?.focus();
            e.preventDefault();
          }
        }}
      >
        <div className="rp-dialog__title">{title}</div>
        <div className="rp-dialog__body">{children}</div>
        <div className="rp-dialog__actions">
          {buttons.map((b) => (
            <button key={b.label} type="button" className={b.primary ? 'rp-button rp-button--primary' : 'rp-button'} data-primary={b.primary ? 'true' : undefined} onClick={b.onClick}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
