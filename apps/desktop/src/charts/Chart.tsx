import { useEffect, useRef } from 'react';

/** Assinaturas de `window.RendaERP` (design-system/components/index.d.ts). */
type Serie = { nome: string; valores: number[] };
type Fatia = { nome: string; valor: number };
export type ChartSpec =
  | { tipo: 'Linha'; categorias: string[]; series: Serie[]; unidade?: string }
  | { tipo: 'Barras3D'; categorias: string[]; series: Serie[]; unidade?: string }
  | { tipo: 'Empilhadas3D'; categorias: string[]; series: Serie[]; unidade?: string }
  | { tipo: 'Area3D'; categorias: string[]; series: Serie[] }
  | { tipo: 'Pizza3D'; fatias: Fatia[] }
  | { tipo: 'Rosca3D'; fatias: Fatia[]; furo?: number; centro?: string | { valor: string; titulo?: string } };

type Desenho = (el: HTMLElement, opcoes: Record<string, unknown>) => SVGSVGElement;

declare global {
  interface Window {
    RendaERP?: Record<string, Desenho | unknown> & { formatar?: (n: number, casas?: number) => string };
  }
}

type Props = { spec: ChartSpec; altura: number; label: string };

/**
 * Corpo de gráfico do design system: o desenho sai de `window.RendaERP` (bundle.js), em SVG, com a dica que segue o
 * ponteiro. Ocupa a largura do cartão e redesenha quando ela muda ou quando os dados mudam.
 */
export function Chart({ spec, altura, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chave = JSON.stringify(spec);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const desenhar = () => {
      const fn = window.RendaERP?.[spec.tipo] as Desenho | undefined;
      if (!fn || el.clientWidth === 0) return;
      const { tipo: _tipo, ...opcoes } = spec;
      el.replaceChildren();
      try {
        fn(el, { ...opcoes, largura: Math.max(240, el.clientWidth - 24), altura: altura - 16 });
      } catch {
        // dados fora do formato do desenho: o cartão fica vazio em vez de derrubar a janela
      }
    };
    desenhar();
    if (typeof ResizeObserver === 'undefined') return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let largura = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === largura) return;
      largura = el.clientWidth;
      clearTimeout(t);
      t = setTimeout(desenhar, 120);
    });
    ro.observe(el);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
    // `chave` resume o spec: redesenha só quando os dados mudam.
  }, [chave, altura]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={ref} className="rp-chart-body rp-grafico" style={{ height: altura }} role="img" aria-label={label} />;
}
