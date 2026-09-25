type Props = {
  canSave: boolean;
  hasActive: boolean;
  hasWindows: boolean;
  onSave: () => void;
  onClose: () => void;
  onCascade: () => void;
  onTile: () => void;
};

/** Barra de ferramentas: ações aplicadas à janela ativa, habilitadas conforme o estado. */
export function Toolbar(p: Props) {
  return (
    <div className="rp-toolbar" role="toolbar" aria-label="Ferramentas">
      <button type="button" disabled={!p.canSave} onClick={p.onSave} title="Salvar (⌘S)">
        <span aria-hidden="true">💾</span> Salvar
      </button>
      <button type="button" disabled={!p.hasActive} onClick={p.onClose} title="Fechar janela ativa">
        <span aria-hidden="true">✕</span> Fechar
      </button>
      <span className="rp-toolbar__sep" />
      <button type="button" disabled={!p.hasWindows} onClick={p.onCascade} title="Organizar em cascata">
        <span aria-hidden="true">⧉</span> Cascata
      </button>
      <button type="button" disabled={!p.hasWindows} onClick={p.onTile} title="Organizar lado a lado">
        <span aria-hidden="true">▦</span> Lado a lado
      </button>
    </div>
  );
}
