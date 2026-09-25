import { initialWindowState, windowReducer, type WindowAction, type WindowState } from './windowManager';

const bounds = { width: 1200, height: 700 };
const open = (recordKey = 'singleton', kind: 'company-profile' | 'server-status' = 'company-profile'): WindowAction => ({
  type: 'open', kind, recordKey, title: kind, size: { w: 600, h: 400 }, bounds,
});
const run = (...actions: WindowAction[]): WindowState => actions.reduce(windowReducer, initialWindowState);

describe('gerenciador de janelas', () => {
  it('abrir o mesmo registro ativa a janela existente em vez de duplicar', () => {
    const s = run(open(), open('x', 'server-status'), open());
    expect(s.windows).toHaveLength(2);
    expect(s.activeId).toBe('w1');
    expect(s.windows.find((w) => w.id === 'w1')!.z).toBeGreaterThan(s.windows.find((w) => w.id === 'w2')!.z);
  });

  it('registros diferentes abrem janelas diferentes', () => {
    expect(run(open('a'), open('b')).windows).toHaveLength(2);
  });

  it('minimizar tira da área e passa o foco; reabrir restaura', () => {
    let s = run(open('a'), open('b'), { type: 'minimize', id: 'w2' });
    expect(s.windows.find((w) => w.id === 'w2')!.mode).toBe('minimized');
    expect(s.activeId).toBe('w1');
    s = windowReducer(s, { type: 'focus', id: 'w2' });
    expect(s.windows.find((w) => w.id === 'w2')!.mode).toBe('normal');
    expect(s.activeId).toBe('w2');
  });

  it('maximizar e restaurar devolve as dimensões anteriores', () => {
    let s = run(open(), { type: 'move', id: 'w1', x: 100, y: 80, bounds }, { type: 'toggleMaximize', id: 'w1' });
    expect(s.windows[0].mode).toBe('maximized');
    s = windowReducer(s, { type: 'toggleMaximize', id: 'w1' });
    expect(s.windows[0]).toMatchObject({ mode: 'normal', x: 100, y: 80, w: 600, h: 400 });
  });

  it('janela maximizada minimizada volta maximizada', () => {
    const s = run(open(), { type: 'toggleMaximize', id: 'w1' }, { type: 'minimize', id: 'w1' }, { type: 'focus', id: 'w1' });
    expect(s.windows[0].mode).toBe('maximized');
  });

  it('mover e redimensionar respeitam limites e tamanho mínimo', () => {
    const s = run(open(), { type: 'move', id: 'w1', x: -500, y: 5000, bounds }, { type: 'resize', id: 'w1', w: 10, h: 10, bounds });
    const w = s.windows[0];
    expect(w.x).toBe(0);
    expect(w.y).toBeLessThanOrEqual(bounds.height - 32);
    expect(w.w).toBe(420);
    expect(w.h).toBe(260);
  });

  it('fechar ativa a janela visível mais ao topo', () => {
    const s = run(open('a'), open('b'), open('c'), { type: 'close', id: 'w3' });
    expect(s.activeId).toBe('w2');
  });

  it('cascata e lado a lado reposicionam todas as janelas visíveis', () => {
    let s = run(open('a'), open('b'), open('c'), { type: 'toggleMaximize', id: 'w1' }, { type: 'cascade', bounds });
    expect(s.windows.every((w) => w.mode === 'normal')).toBe(true);
    s = windowReducer(s, { type: 'tile', bounds });
    const xs = new Set(s.windows.map((w) => `${w.x},${w.y}`));
    expect(xs.size).toBe(3);
  });

  it('marca alterações pendentes por janela', () => {
    const s = run(open('a'), open('b'), { type: 'setDirty', id: 'w1', dirty: true });
    expect(s.windows.map((w) => w.dirty)).toEqual([true, false]);
  });
});
