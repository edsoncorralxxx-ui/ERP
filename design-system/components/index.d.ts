/** Renda+ ERP — window.RendaERP (bundle.js, sem dependências). */
interface Serie { nome: string; valores: number[] }
interface Fatia { nome: string; valor: number }
interface OpcoesBarras3D { categorias: string[]; series: Serie[]; largura?: number; altura?: number; profundidade?: number; unidade?: string; cores?: string[] }
interface OpcoesPizza3D { fatias: Fatia[]; largura?: number; altura?: number; profundidade?: number; cores?: string[] }
interface OpcoesArea3D { categorias: string[]; series: Serie[]; largura?: number; altura?: number; cores?: string[] }
interface OpcoesRosca3D { fatias: Fatia[]; largura?: number; altura?: number; profundidade?: number; furo?: number; centro?: string | { valor: string; titulo?: string }; cores?: string[] }
interface OpcoesEmpilhadas3D { categorias: string[]; series: Serie[]; largura?: number; altura?: number; profundidade?: number; unidade?: string; cores?: string[] }
interface OpcoesLinha { categorias: string[]; series: Serie[]; largura?: number; altura?: number; unidade?: string; cores?: string[] }
interface ControleMenuLateral { abrir(vista: string): void; fechar(): void }
declare namespace RendaERP {
  /** Barras agrupadas com profundidade; desenha SVG dentro de `el`. */
  function Barras3D(el: HTMLElement, opcoes: OpcoesBarras3D): SVGSVGElement;
  /** Pizza inclinada com espessura (até 5 fatias). */
  function Pizza3D(el: HTMLElement, opcoes: OpcoesPizza3D): SVGSVGElement;
  /** Áreas em faixas, uma atrás da outra (até 3 séries). */
  function Area3D(el: HTMLElement, opcoes: OpcoesArea3D): SVGSVGElement;
  /** Rosca com profundidade e total no centro. */
  function Rosca3D(el: HTMLElement, opcoes: OpcoesRosca3D): SVGSVGElement;
  /** Colunas empilhadas com profundidade: total e composição na mesma coluna. */
  function Empilhadas3D(el: HTMLElement, opcoes: OpcoesEmpilhadas3D): SVGSVGElement;
  /** Linhas com marcadores, em duas dimensões, para séries longas. */
  function Linha(el: HTMLElement, opcoes: OpcoesLinha): SVGSVGElement;
  /** Liga o trilho, a gaveta e o acordeão de um `.rp-shell` (ou só o acordeão de um `.rp-nav`). */
  function MenuLateral(el: HTMLElement): ControleMenuLateral;
  /** Formata número no padrão pt-BR. */
  function formatar(n: number, casas?: number): string;
}
