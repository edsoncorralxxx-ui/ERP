import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { AppWindow } from './windowManager';

type Props = {
  win: AppWindow;
  active: boolean;
  children: ReactNode;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onClose: () => void;
};

function WinButton({ label, text, onClick }: { label: string; text: string; onClick: () => void }) {
  const key = (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick());
  return (
    <span role="button" tabIndex={0} aria-label={label} title={label} onClick={onClick} onKeyDown={key}>
      {text}
    </span>
  );
}

/** Janela do design system (barra de título azul, corpo claro), móvel e redimensionável dentro da área de trabalho. */
export function WindowFrame({ win, active, children, onFocus, onMove, onResize, onMinimize, onToggleMaximize, onClose }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const size = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  if (win.mode === 'minimized') return null;
  const maximized = win.mode === 'maximized';

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (maximized || (e.target as HTMLElement).closest('[role=button]')) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    size.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const style = maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <section
      className={`rp-window rp-janela-mdi${active ? '' : ' rp-window--inactive'}${maximized ? ' rp-janela-mdi--max' : ''}`}
      style={style}
      role="dialog"
      aria-label={win.title}
      aria-modal={false}
      onPointerDown={onFocus}
      data-window-id={win.id}
    >
      <div
        className="rp-titlebar"
        onPointerDown={startDrag}
        onPointerMove={(e) => drag.current && onMove(e.clientX - drag.current.dx, e.clientY - drag.current.dy)}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={onToggleMaximize}
      >
        <span className="rp-janela-mdi__titulo">{win.title}</span>
        {/* Botões do design system (Janela): minimizar, maximizar e fechar, à direita. */}
        <span className="rp-winbtns">
          <WinButton label="Minimizar" text="–" onClick={onMinimize} />
          <WinButton label={maximized ? 'Restaurar' : 'Maximizar'} text={maximized ? '❐' : '□'} onClick={onToggleMaximize} />
          <WinButton label="Fechar janela" text="×" onClick={onClose} />
        </span>
      </div>
      {children}
      {!maximized && (
        <div
          className="rp-janela-mdi__alca"
          aria-hidden="true"
          onPointerDown={startResize}
          onPointerMove={(e) => size.current && onResize(size.current.w + e.clientX - size.current.x, size.current.h + e.clientY - size.current.y)}
          onPointerUp={() => (size.current = null)}
        />
      )}
    </section>
  );
}
