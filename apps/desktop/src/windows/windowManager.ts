/**
 * Estado das janelas internas (MDI), separado dos dados de negócio (documento de interface §3).
 * Funções puras para facilitar teste; o React só despacha ações.
 */

export type WindowKind = 'company-profile' | 'server-status';
export type WindowMode = 'normal' | 'minimized' | 'maximized';

export type Rect = { x: number; y: number; w: number; h: number };

export type AppWindow = Rect & {
  id: string;
  kind: WindowKind;
  recordKey: string;
  title: string;
  z: number;
  mode: WindowMode;
  restore?: Rect;
  /** Modo anterior à minimização, para restaurar corretamente uma janela maximizada. */
  prevMode?: Exclude<WindowMode, 'minimized'>;
  dirty: boolean;
};

export type WindowState = { windows: AppWindow[]; activeId: string | null; nextZ: number; seq: number };

export type Bounds = { width: number; height: number };

export const MIN_W = 420;
export const MIN_H = 260;
const CASCADE_STEP = 28;

export const initialWindowState: WindowState = { windows: [], activeId: null, nextZ: 1, seq: 1 };

export type WindowAction =
  | { type: 'open'; kind: WindowKind; recordKey: string; title: string; size: { w: number; h: number }; bounds: Bounds }
  | { type: 'focus'; id: string }
  | { type: 'move'; id: string; x: number; y: number; bounds: Bounds }
  | { type: 'resize'; id: string; w: number; h: number; bounds: Bounds }
  | { type: 'minimize'; id: string }
  | { type: 'toggleMaximize'; id: string }
  | { type: 'close'; id: string }
  | { type: 'setDirty'; id: string; dirty: boolean }
  | { type: 'cascade'; bounds: Bounds }
  | { type: 'tile'; bounds: Bounds }
  | { type: 'fit'; bounds: Bounds };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, Math.max(min, max)));

function clampRect(r: Rect, b: Bounds): Rect {
  const w = clamp(r.w, MIN_W, b.width);
  const h = clamp(r.h, MIN_H, b.height);
  // Mantém a barra de título sempre alcançável.
  return { w, h, x: clamp(r.x, 0, b.width - Math.min(w, 120)), y: clamp(r.y, 0, b.height - 32) };
}

function activate(state: WindowState, id: string): WindowState {
  const windows = state.windows.map((w) =>
    w.id === id ? { ...w, z: state.nextZ, mode: w.mode === 'minimized' ? (w.prevMode ?? 'normal') : w.mode, prevMode: undefined } : w,
  );
  return { ...state, windows, activeId: id, nextZ: state.nextZ + 1 };
}

function topVisible(windows: AppWindow[]): string | null {
  const visible = windows.filter((w) => w.mode !== 'minimized').sort((a, b) => b.z - a.z);
  return visible[0]?.id ?? null;
}

export function windowReducer(state: WindowState, action: WindowAction): WindowState {
  switch (action.type) {
    case 'open': {
      const existing = state.windows.find((w) => w.kind === action.kind && w.recordKey === action.recordKey);
      if (existing) return activate(state, existing.id);
      const offset = (state.windows.length % 8) * CASCADE_STEP;
      const rect = clampRect({ x: 24 + offset, y: 16 + offset, ...action.size }, action.bounds);
      const win: AppWindow = {
        ...rect,
        id: `w${state.seq}`,
        kind: action.kind,
        recordKey: action.recordKey,
        title: action.title,
        z: state.nextZ,
        mode: 'normal',
        dirty: false,
      };
      return { windows: [...state.windows, win], activeId: win.id, nextZ: state.nextZ + 1, seq: state.seq + 1 };
    }
    case 'focus':
      return state.windows.some((w) => w.id === action.id) ? activate(state, action.id) : state;
    case 'move':
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id && w.mode === 'normal' ? { ...w, ...clampRect({ ...w, x: action.x, y: action.y }, action.bounds) } : w,
        ),
      };
    case 'resize':
      return {
        ...state,
        windows: state.windows.map((w) =>
          w.id === action.id && w.mode === 'normal' ? { ...w, ...clampRect({ ...w, w: action.w, h: action.h }, action.bounds) } : w,
        ),
      };
    case 'minimize': {
      const windows = state.windows.map((w) => (w.id === action.id && w.mode !== 'minimized' ? { ...w, prevMode: w.mode, mode: 'minimized' as const } : w));
      return { ...state, windows, activeId: state.activeId === action.id ? topVisible(windows) : state.activeId };
    }
    case 'toggleMaximize': {
      const windows = state.windows.map((w) => {
        if (w.id !== action.id) return w;
        if (w.mode === 'maximized') {
          const r = w.restore ?? w;
          return { ...w, ...r, mode: 'normal' as const, restore: undefined };
        }
        return { ...w, mode: 'maximized' as const, restore: { x: w.x, y: w.y, w: w.w, h: w.h } };
      });
      return activate({ ...state, windows }, action.id);
    }
    case 'close': {
      const windows = state.windows.filter((w) => w.id !== action.id);
      return { ...state, windows, activeId: state.activeId === action.id ? topVisible(windows) : state.activeId };
    }
    case 'setDirty':
      return { ...state, windows: state.windows.map((w) => (w.id === action.id ? { ...w, dirty: action.dirty } : w)) };
    case 'cascade': {
      let z = state.nextZ;
      const windows = [...state.windows]
        .sort((a, b) => a.z - b.z)
        .map((w, i) => ({
          ...w,
          ...clampRect({ x: 24 + i * CASCADE_STEP, y: 16 + i * CASCADE_STEP, w: w.restore?.w ?? w.w, h: w.restore?.h ?? w.h }, action.bounds),
          mode: 'normal' as const,
          restore: undefined,
          z: z++,
        }));
      return { ...state, windows, nextZ: z, activeId: topVisible(windows) };
    }
    case 'tile': {
      const visible = state.windows.filter((w) => w.mode !== 'minimized');
      if (visible.length === 0) return state;
      const cols = Math.ceil(Math.sqrt(visible.length));
      const rows = Math.ceil(visible.length / cols);
      const cw = Math.floor(action.bounds.width / cols);
      const ch = Math.floor(action.bounds.height / rows);
      const placed = new Map<string, Rect>();
      visible.forEach((w, i) => placed.set(w.id, { x: (i % cols) * cw, y: Math.floor(i / cols) * ch, w: cw, h: ch }));
      const windows = state.windows.map((w) => {
        const r = placed.get(w.id);
        return r ? { ...w, ...clampRect(r, action.bounds), mode: 'normal' as const, restore: undefined } : w;
      });
      return { ...state, windows };
    }
    case 'fit':
      return { ...state, windows: state.windows.map((w) => ({ ...w, ...clampRect(w, action.bounds) })) };
  }
}
