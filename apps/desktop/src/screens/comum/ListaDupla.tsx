import { useState } from 'react';

export type OpcaoLista = { id: string; nome: string; inativa?: boolean };

type Props = {
  disponiveis: OpcaoLista[];
  escolhidas: string[];
  onChange: (ids: string[]) => void;
  rotulos: [string, string];
  somenteLeitura?: boolean;
};

/**
 * Lista de seleção em duas colunas (componente Lista de seleção): à esquerda o que se pode escolher, à direita o que
 * está escolhido, com os botões ‹ › » « e duplo clique para mover. Opções inativas não aparecem para escolha, mas
 * continuam na direita se já estavam escolhidas.
 */
export function ListaDupla({ disponiveis, escolhidas, onChange, rotulos, somenteLeitura }: Props) {
  const [marcaEsq, setMarcaEsq] = useState<string | null>(null);
  const [marcaDir, setMarcaDir] = useState<string | null>(null);
  const porId = new Map(disponiveis.map((o) => [o.id, o]));
  const esquerda = disponiveis.filter((o) => !o.inativa && !escolhidas.includes(o.id));
  const direita = escolhidas.map((id) => porId.get(id) ?? { id, nome: id });
  const adicionar = (id: string | null) => id && !escolhidas.includes(id) && (onChange([...escolhidas, id]), setMarcaEsq(null));
  const remover = (id: string | null) => id && (onChange(escolhidas.filter((x) => x !== id)), setMarcaDir(null));
  const lista = (itens: OpcaoLista[], marca: string | null, marcar: (id: string) => void, mover: (id: string) => void, rotulo: string) => (
    <div>
      <div className="rp-lista-dupla__rotulo">{rotulo}</div>
      <div className="rp-lista rp-rolagem rp-lista-dupla__lista" role="listbox" aria-label={rotulo}>
        {itens.map((o) => (
          <div
            key={o.id}
            role="option"
            tabIndex={somenteLeitura ? -1 : 0}
            aria-selected={marca === o.id}
            onClick={() => !somenteLeitura && marcar(o.id)}
            onDoubleClick={() => !somenteLeitura && mover(o.id)}
            onKeyDown={(e) => !somenteLeitura && e.key === 'Enter' && mover(o.id)}
          >
            {o.nome}
            {o.inativa ? ' (inativa)' : ''}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="rp-lista-dupla">
      {lista(esquerda, marcaEsq, setMarcaEsq, adicionar, rotulos[0])}
      <div className="rp-lista-mover">
        <button type="button" className="rp-btn" title="Incluir" aria-label="Incluir" disabled={somenteLeitura || !marcaEsq} onClick={() => adicionar(marcaEsq)}>
          &rsaquo;
        </button>
        <button type="button" className="rp-btn" title="Incluir todas" aria-label="Incluir todas" disabled={somenteLeitura || esquerda.length === 0} onClick={() => onChange([...escolhidas, ...esquerda.map((o) => o.id)])}>
          &raquo;
        </button>
        <button type="button" className="rp-btn" title="Retirar" aria-label="Retirar" disabled={somenteLeitura || !marcaDir} onClick={() => remover(marcaDir)}>
          &lsaquo;
        </button>
        <button type="button" className="rp-btn" title="Retirar todas" aria-label="Retirar todas" disabled={somenteLeitura || escolhidas.length === 0} onClick={() => onChange([])}>
          &laquo;
        </button>
      </div>
      {lista(direita, marcaDir, setMarcaDir, remover, rotulos[1])}
    </div>
  );
}
