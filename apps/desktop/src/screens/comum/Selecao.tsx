import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type Opcao = { valor: string; rotulo: string; desabilitada?: boolean };

type Props = {
  valor: string;
  opcoes: Opcao[];
  onChange: (valor: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-invalid'?: boolean;
  /** Largura da seleção (o campo ocupa toda ela), como os campos do mock: "120px", "100%". */
  largura?: string;
};

/**
 * Seleção do design system: o campo com o triângulo (`.rp-select` + `.rp-field`) e a lista suspensa desenhada como o
 * menu do sistema (`.rp-menu`, itens `.rp-menu-item`, destaque em `field-active`, rolagem clássica) — no lugar da lista
 * nativa do sistema operacional. Teclado: setas, Home/End, Enter ou espaço escolhem, Esc fecha, letras saltam.
 * A lista abre por cima das janelas (portal na página), para não ser cortada por grades e painéis que rolam.
 */
export function Selecao({ valor, opcoes, onChange, id, className, disabled, title, largura, ...aria }: Props) {
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const campo = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const listaId = useId();
  const atual = opcoes.find((o) => o.valor === valor);

  const posicionar = () => {
    const r = campo.current?.getBoundingClientRect();
    if (!r) return;
    const abaixo = window.innerHeight - r.bottom - 8;
    const acima = r.top - 8;
    const alto = Math.min(opcoes.length * 22 + 8, 260);
    const emBaixo = abaixo >= Math.min(alto, 120) || abaixo >= acima;
    const maxHeight = Math.max(60, Math.min(260, emBaixo ? abaixo : acima));
    setPos({ left: r.left, width: r.width, top: emBaixo ? r.bottom + 1 : r.top - Math.min(alto, maxHeight) - 1, maxHeight });
  };

  const abrir = () => {
    if (disabled) return;
    posicionar();
    setAtiva(Math.max(0, opcoes.findIndex((o) => o.valor === valor)));
    setAberta(true);
  };
  const fechar = (foco = true) => {
    setAberta(false);
    if (foco) campo.current?.focus();
  };
  const escolher = (i: number) => {
    const o = opcoes[i];
    if (!o || o.desabilitada) return;
    if (o.valor !== valor) onChange(o.valor);
    fechar();
  };

  // Clique fora, rolagem ou redimensionamento fecham a lista (como a lista nativa).
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!campo.current?.contains(alvo) && !lista.current?.contains(alvo)) fechar(false);
    };
    // Rolagem de quem contém o campo (ex.: a caixa de mensagem que rola até o campo focado): a lista acompanha o campo e
    // só fecha se ele sair da tela.
    const rolou = (e: Event) => {
      if (lista.current?.contains(e.target as Node)) return;
      const r = campo.current?.getBoundingClientRect();
      if (e.type === 'scroll' && r && r.bottom > 0 && r.top < window.innerHeight) posicionar();
      else fechar(false);
    };
    document.addEventListener('mousedown', fora);
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', rolou);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', rolou);
    };
  }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém a opção em destaque visível.
  // Rola só a própria lista: scrollIntoView também rolaria a janela por trás, e essa rolagem fecharia a lista.
  useLayoutEffect(() => {
    const l = lista.current;
    const el = aberta ? l?.querySelector<HTMLElement>(`[data-i="${ativa}"]`) : null;
    if (!l || !el) return;
    if (el.offsetTop < l.scrollTop) l.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > l.scrollTop + l.clientHeight) l.scrollTop = el.offsetTop + el.offsetHeight - l.clientHeight;
  }, [aberta, ativa]);

  const proxima = (de: number, passo: number) => {
    for (let i = de + passo; i >= 0 && i < opcoes.length; i += passo) if (!opcoes[i].desabilitada) return i;
    return de;
  };

  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const k = e.key;
    if (!aberta) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || (k === 'ArrowDown' && e.altKey)) {
        e.preventDefault();
        abrir();
      }
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (k === 'Tab') {
      fechar(false);
    } else if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      setAtiva((a) => proxima(a, k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End') {
      e.preventDefault();
      setAtiva(k === 'Home' ? proxima(-1, 1) : proxima(opcoes.length, -1));
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      e.stopPropagation();
      escolher(ativa);
    } else if (k.length === 1 && /\S/.test(k)) {
      const letra = k.toLocaleLowerCase('pt-BR');
      const ordem = [...opcoes.keys()].slice(ativa + 1).concat([...opcoes.keys()].slice(0, ativa + 1));
      const i = ordem.find((j) => !opcoes[j].desabilitada && opcoes[j].rotulo.toLocaleLowerCase('pt-BR').startsWith(letra));
      if (i !== undefined) setAtiva(i);
    }
  };

  return (
    <div className="rp-select" style={largura ? { width: largura } : undefined}>
      <button
        ref={campo}
        type="button"
        id={id}
        role="combobox"
        className={`${className ?? 'rp-field'} rp-selecao__campo`}
        aria-haspopup="listbox"
        aria-expanded={aberta}
        aria-controls={aberta ? listaId : undefined}
        aria-activedescendant={aberta && ativa >= 0 ? `${listaId}-${ativa}` : undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        title={title}
        style={largura ? { width: '100%' } : undefined}
        data-valor={valor}
        onClick={() => (aberta ? fechar() : abrir())}
        onKeyDown={teclas}
      >
        {atual?.rotulo ?? ''}
      </button>
      {aberta &&
        pos &&
        createPortal(
          <div
            ref={lista}
            id={listaId}
            role="listbox"
            aria-label={aria['aria-label']}
            className="rp rp-menu rp-rolagem rp-selecao__lista"
            style={{ left: pos.left, top: pos.top, minWidth: pos.width, maxHeight: pos.maxHeight }}
          >
            {opcoes.map((o, i) => (
              <div
                key={`${o.valor}-${i}`}
                id={`${listaId}-${i}`}
                data-i={i}
                role="option"
                className={`rp-menu-item${o.valor === valor ? ' rp-selecao__atual' : ''}`}
                aria-selected={i === ativa}
                aria-disabled={o.desabilitada || undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(i)}
              >
                {o.rotulo}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
