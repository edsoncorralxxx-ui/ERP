import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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

/** Moldura de janela interna: barra de título arrastável, controles e alça de redimensionamento. */
export function WindowFrame({ win, active, children, onFocus, onMove, onResize, onMinimize, onToggleMaximize, onClose }: Props) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const size = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  if (win.mode === 'minimized') return null;
  const maximized = win.mode === 'maximized';

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (maximized || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current) onMove(e.clientX - drag.current.dx, e.clientY - drag.current.dy);
  };
  const endDrag = () => (drag.current = null);

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    size.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (size.current) onResize(size.current.w + e.clientX - size.current.x, size.current.h + e.clientY - size.current.y);
  };

  const style = maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };

  return (
    <section
      className={`rp-window${active ? ' rp-window--active' : ''}${maximized ? ' rp-window--max' : ''}`}
      style={style}
      role="dialog"
      aria-label={win.title}
      aria-modal={false}
      onPointerDown={onFocus}
      data-window-id={win.id}
    >
      <div className="rp-window__title" onPointerDown={startDrag} onPointerMove={onDrag} onPointerUp={endDrag} onDoubleClick={onToggleMaximize}>
        <span className="rp-window__text">
          {win.title}
          {win.dirty ? ' •' : ''}
        </span>
        <span className="rp-window__controls">
          <button type="button" aria-label="Minimizar" title="Minimizar" onClick={onMinimize}>_</button>
          <button type="button" aria-label={maximized ? 'Restaurar' : 'Maximizar'} title={maximized ? 'Restaurar' : 'Maximizar'} onClick={onToggleMaximize}>
            {maximized ? '❐' : '□'}
          </button>
          <button type="button" aria-label="Fechar janela" title="Fechar" onClick={onClose}>×</button>
        </span>
      </div>
      <div className="rp-window__body">{children}</div>
      {!maximized && (
        <div
          className="rp-window__resize"
          aria-hidden="true"
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={() => (size.current = null)}
        />
      )}
    </section>
  );
}
