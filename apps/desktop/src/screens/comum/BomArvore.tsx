import { useMemo, type KeyboardEvent } from 'react';
import type { BomTreeNode } from '../../api/types';
import { reais } from '../../format';
import { quantidade } from './Bom';

/**
 * Árvore da estrutura da BOM (Sprint 10, ajuste da Review de 02/10/2026): a lista em árvore à esquerda da janela e o
 * diagrama da aba Diagrama. Cada nó é identificado pelo caminho ("0", "0.1", "0.1.0"), porque a mesma submontagem pode
 * aparecer em mais de um lugar.
 */
export type NoVisivel = { caminho: string; no: BomTreeNode; nivel: number };

export const noDoCaminho = (raiz: BomTreeNode, caminho: string): BomTreeNode | null => {
  let no: BomTreeNode | undefined = raiz;
  for (const i of caminho.split('.').slice(1)) no = no?.children[Number(i)];
  return no ?? null;
};

/** Caminhos de todos os nós com filhos: a árvore abre inteira na primeira vez. */
export const caminhosComFilhos = (raiz: BomTreeNode, caminho = '0', saida: string[] = []): string[] => {
  if (raiz.children.length > 0) saida.push(caminho);
  raiz.children.forEach((c, i) => caminhosComFilhos(c, `${caminho}.${i}`, saida));
  return saida;
};

const visiveis = (no: BomTreeNode, caminho: string, nivel: number, abertos: Set<string>, saida: NoVisivel[]) => {
  saida.push({ caminho, no, nivel });
  if (abertos.has(caminho)) no.children.forEach((c, i) => visiveis(c, `${caminho}.${i}`, nivel + 1, abertos, saida));
  return saida;
};

const itens = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;
const submontagens = (n: number) => `${n} ${n === 1 ? 'submontagem' : 'submontagens'}`;
/** "127 itens", "2 submontagens", "26 itens · 1 submontagem". */
const conteudo = (no: BomTreeNode) =>
  [no.itemLines > 0 || no.children.length === 0 ? itens(no.itemLines) : null, no.children.length ? submontagens(no.children.length) : null]
    .filter(Boolean).join(' · ');
const pendencias = (n: number) => `${n} ${n === 1 ? 'pendência' : 'pendências'}`;

/** Lista em árvore (pastas do design system): setas sobem e descem, ← fecha, → abre, Enter mostra as linhas. */
export function ArvoreBom({ raiz, selecionado, abertos, onSelecionar, onAlternar, rotulo }: {
  raiz: BomTreeNode;
  selecionado: string;
  abertos: Set<string>;
  onSelecionar: (caminho: string) => void;
  onAlternar: (caminho: string) => void;
  rotulo: string;
}) {
  const lista = useMemo(() => visiveis(raiz, '0', 0, abertos, []), [raiz, abertos]);
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const i = lista.findIndex((v) => v.caminho === selecionado);
    const atual = lista[i];
    if (!atual) return;
    const tem = atual.no.children.length > 0;
    const aberto = abertos.has(atual.caminho);
    const mover = (j: number) => lista[j] && onSelecionar(lista[j].caminho);
    const acoes: Record<string, () => void> = {
      ArrowDown: () => mover(i + 1),
      ArrowUp: () => mover(i - 1),
      ArrowRight: () => (tem && !aberto ? onAlternar(atual.caminho) : tem && mover(i + 1)),
      ArrowLeft: () =>
        tem && aberto ? onAlternar(atual.caminho) : atual.caminho.includes('.') && onSelecionar(atual.caminho.slice(0, atual.caminho.lastIndexOf('.'))),
      Home: () => mover(0),
      End: () => mover(lista.length - 1),
    };
    const f = acoes[e.key];
    if (f) {
      e.preventDefault();
      e.stopPropagation();
      f();
    }
  };
  return (
    <ul className="rp-bom__arvore rp-rolagem" role="tree" aria-label={rotulo} tabIndex={0} onKeyDown={onKeyDown}
      aria-activedescendant={`no-${selecionado}`}>
      {lista.map(({ caminho, no, nivel }) => {
        const tem = no.children.length > 0;
        const aberto = abertos.has(caminho);
        return (
          <li key={caminho} id={`no-${caminho}`} role="treeitem" aria-level={nivel + 1} aria-selected={caminho === selecionado}
            aria-expanded={tem ? aberto : undefined} className="rp-bom__no" style={{ paddingLeft: `calc(var(--space-5) * ${nivel} + var(--space-2))` }}
            onClick={() => onSelecionar(caminho)}>
            <i className={`rp-ico ${tem ? (aberto ? 'rp-ico-pasta-aberta' : 'rp-ico-pasta') : 'rp-ico-formulario'}`} aria-hidden="true"
              onClick={(e) => {
                if (!tem) return;
                e.stopPropagation();
                onAlternar(caminho);
              }} />
            <span className="rp-bom__no-nome" title={`${no.code} — ${no.name}`}>
              {nivel > 0 && no.quantity && no.quantity !== '1' ? `${quantidade(no.quantity)} × ` : ''}
              {no.name}
            </span>
            {no.pending > 0 && <i className="rp-ico rp-ico-status-aviso" role="img" aria-label={pendencias(no.pending)} title={pendencias(no.pending)} />}
            <span className="rp-bom__no-total">{reais(no.totalCents)}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Medidas do diagrama em px: caixa, espaço entre colunas (níveis) e entre linhas.
const W = 270;
const H = 78;
const COL = 64;
const LIN = 18;
const MARGEM = 12;

type Caixa = { caminho: string; no: BomTreeNode; x: number; y: number; nivel: number };

/** Posições: folhas uma embaixo da outra, cada nó com filhos no meio deles; os níveis vão da esquerda para a direita. */
const posicionar = (raiz: BomTreeNode) => {
  const caixas: Caixa[] = [];
  const ligacoes: { de: Caixa; para: Caixa }[] = [];
  let folha = 0;
  const visita = (no: BomTreeNode, caminho: string, nivel: number): Caixa => {
    const x = MARGEM + nivel * (W + COL);
    if (no.children.length === 0) {
      const c = { caminho, no, x, y: MARGEM + folha++ * (H + LIN), nivel };
      caixas.push(c);
      return c;
    }
    const filhos = no.children.map((f, i) => visita(f, `${caminho}.${i}`, nivel + 1));
    const c = { caminho, no, x, y: (filhos[0].y + filhos[filhos.length - 1].y) / 2, nivel };
    caixas.push(c);
    filhos.forEach((f) => ligacoes.push({ de: c, para: f }));
    return c;
  };
  visita(raiz, '0', 0);
  const largura = Math.max(...caixas.map((c) => c.x)) + W + MARGEM;
  const altura = Math.max(...caixas.map((c) => c.y)) + H + MARGEM;
  return { caixas: caixas.sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR', { numeric: true })), ligacoes, largura, altura };
};

/**
 * Diagrama em árvore da estrutura: uma caixa por BOM (nome, código, quantidade, total de uma unidade, itens e pendências)
 * ligada às submontagens dela. Clicar na caixa seleciona a BOM; duas vezes, mostra as linhas dela.
 */
export function DiagramaBom({ raiz, selecionado, onSelecionar, onAbrir }: {
  raiz: BomTreeNode;
  selecionado: string;
  onSelecionar: (caminho: string) => void;
  onAbrir: (caminho: string) => void;
}) {
  const { caixas, ligacoes, largura, altura } = useMemo(() => posicionar(raiz), [raiz]);
  return (
    <div className="rp-bom-diagrama rp-rolagem">
      <div className="rp-bom-diagrama__tela" style={{ width: largura, height: altura }}>
        <svg className="rp-bom-diagrama__ligacoes" width={largura} height={altura} aria-hidden="true">
          {ligacoes.map(({ de, para }) => {
            const x1 = de.x + W;
            const y1 = de.y + H / 2;
            const x2 = para.x;
            const y2 = para.y + H / 2;
            const meio = x1 + COL / 2;
            return <path key={para.caminho} d={`M ${x1} ${y1} H ${meio} V ${y2} H ${x2}`} />;
          })}
        </svg>
        <ul className="rp-bom-diagrama__caixas" role="tree" aria-label="Diagrama da estrutura">
          {caixas.map(({ caminho, no, x, y, nivel }) => {
            const classes = ['rp-bom-diagrama__no'];
            if (nivel === 0) classes.push('rp-bom-diagrama__no--raiz');
            if (caminho === selecionado) classes.push('rp-bom-diagrama__no--sel');
            if (no.pending > 0) classes.push('rp-bom-diagrama__no--pendente');
            return (
              <li key={caminho} role="treeitem" aria-level={nivel + 1} aria-selected={caminho === selecionado} tabIndex={0}
                aria-label={`${no.name}, ${reais(no.totalCents)}${no.pending ? `, ${pendencias(no.pending)}` : ''}`}
                className={classes.join(' ')} style={{ left: x, top: y, width: W, height: H }}
                onClick={() => onSelecionar(caminho)} onDoubleClick={() => onAbrir(caminho)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onAbrir(caminho))}>
                <span className="rp-bom-diagrama__nome" title={no.name}>
                  <i className={`rp-ico ${no.children.length ? 'rp-ico-pasta-aberta' : 'rp-ico-formulario'}`} aria-hidden="true" /> {no.name}
                </span>
                <span className="rp-bom-diagrama__meta">
                  {no.code}
                  {nivel > 0 && ` · Qtd. ${quantidade(no.quantity) || '—'}`} · {conteudo(no)}
                </span>
                <span className="rp-bom-diagrama__total">
                  {reais(no.totalCents)}
                  {no.pending > 0 && (
                    <span className="rp-bom-diagrama__pendente">
                      <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> {pendencias(no.pending)}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
