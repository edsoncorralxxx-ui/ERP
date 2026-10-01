/**
 * Cálculos da Calculadora financeira: matemática financeira (juros, séries, taxas, fluxo de caixa), contábil
 * (depreciação, formação de preço, ponto de equilíbrio) e fiscal (Simples Nacional, imposto por dentro e por fora,
 * retenções na nota de serviço). Taxas entram como fração (0,015 = 1,5%). Só para conferência: quem vale é o
 * lançamento no sistema e a legislação vigente.
 */
import { diaUtil } from './calculadora';

const ok = (v: number): number | null => (Number.isFinite(v) ? v : null);

// ───────────── Juros e séries (convenção da HP 12C) ─────────────

/** Pagamento no fim do período (postecipado) ou no início (antecipado). */
export type Momento = 'fim' | 'inicio';
export type Tvm = { n: number; i: number; pv: number; pmt: number; fv: number };
export type IncognitaTvm = keyof Tvm;

/**
 * Saldo da equação PV + PMT·(1+i·tipo)·[1−(1+i)^−n]/i + FV·(1+i)^−n = 0. Entradas e saídas com sinais opostos, como na
 * HP 12C: quem recebe o empréstimo tem PV positivo e PMT negativo.
 */
const saldoTvm = ({ n, i, pv, pmt, fv }: Tvm, momento: Momento): number => {
  if (i === 0) return pv + pmt * n + fv;
  const v = (1 + i) ** -n;
  return pv + pmt * (1 + i * (momento === 'inicio' ? 1 : 0)) * ((1 - v) / i) + fv * v;
};

/** Resolve a incógnita da série (n, i, PV, PMT ou FV) a partir das outras quatro; nulo se não houver solução. */
export const resolverTvm = (dados: Omit<Tvm, IncognitaTvm> & Partial<Tvm>, incognita: IncognitaTvm, momento: Momento = 'fim'): number | null => {
  const t = { n: 0, i: 0, pv: 0, pmt: 0, fv: 0, ...dados };
  const { n, i, pv, pmt, fv } = t;
  const k = 1 + i * (momento === 'inicio' ? 1 : 0);
  switch (incognita) {
    case 'fv':
      return ok(i === 0 ? -(pv + pmt * n) : -(pv * (1 + i) ** n + pmt * k * (((1 + i) ** n - 1) / i)));
    case 'pv':
      return ok(i === 0 ? -(fv + pmt * n) : -(fv * (1 + i) ** -n + pmt * k * ((1 - (1 + i) ** -n) / i)));
    case 'pmt': {
      if (n <= 0) return null;
      if (i === 0) return ok(-(pv + fv) / n);
      return ok(-(pv + fv * (1 + i) ** -n) / (k * ((1 - (1 + i) ** -n) / i)));
    }
    case 'n': {
      if (i === 0) return pmt === 0 ? null : ok(-(pv + fv) / pmt);
      const a = (pmt * k) / i;
      const razao = (a - fv) / (a + pv);
      return razao > 0 ? ok(Math.log(razao) / Math.log(1 + i)) : null;
    }
    case 'i':
      return raiz((x) => saldoTvm({ ...t, i: x }, momento));
  }
};

/** Raiz de f entre −99,99% e 1.000% por período: procura uma troca de sinal e refina por bisseção. */
const raiz = (f: (x: number) => number): number | null => {
  const pontos = [-0.9999, -0.5, -0.1, 0, 1e-6, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  for (let k = 0; k < pontos.length - 1; k++) {
    let a = pontos[k];
    let b = pontos[k + 1];
    let fa = f(a);
    const fb = f(b);
    if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
    if (fa === 0) return a;
    if (fa * fb > 0) continue;
    for (let it = 0; it < 200 && b - a > 1e-12; it++) {
      const m = (a + b) / 2;
      const fm = f(m);
      if (fa * fm <= 0) b = m;
      else (a = m), (fa = fm);
    }
    return (a + b) / 2;
  }
  return null;
};

export type JurosSimples = { juros: number; montante: number };
export const jurosSimples = (capital: number, taxa: number, prazo: number): JurosSimples => {
  const juros = capital * taxa * prazo;
  return { juros, montante: capital + juros };
};

// ───────────── Financiamento: tabela Price e SAC ─────────────

export type LinhaAmortizacao = { periodo: number; prestacao: number; juros: number; amortizacao: number; saldo: number };
export type Sistema = 'PRICE' | 'SAC';

/** Tabela de amortização de `valor` em `n` parcelas à taxa `i` por período; vazia se os dados não fecham. */
export const tabelaAmortizacao = (valor: number, i: number, n: number, sistema: Sistema): LinhaAmortizacao[] => {
  if (!(valor > 0) || !(n >= 1) || !Number.isInteger(n) || n > 1200 || !(i >= 0)) return [];
  const linhas: LinhaAmortizacao[] = [];
  let saldo = valor;
  const prestacaoPrice = i === 0 ? valor / n : (valor * i) / (1 - (1 + i) ** -n);
  for (let p = 1; p <= n; p++) {
    const juros = saldo * i;
    const amortizacao = sistema === 'SAC' ? valor / n : prestacaoPrice - juros;
    const prestacao = sistema === 'SAC' ? amortizacao + juros : prestacaoPrice;
    saldo = p === n ? 0 : saldo - amortizacao;
    linhas.push({ periodo: p, prestacao, juros, amortizacao, saldo });
  }
  return linhas;
};

// ───────────── Taxas ─────────────

/** Períodos em meses (ano comercial de 360 dias: dia = 1/30 de mês). */
export const PERIODOS = { dia: 1 / 30, mes: 1, bimestre: 2, trimestre: 3, semestre: 6, ano: 12 } as const;
export type Periodo = keyof typeof PERIODOS;

/** Taxa composta equivalente: (1 + i)^(destino/origem) − 1. */
export const taxaEquivalente = (i: number, origem: Periodo, destino: Periodo): number | null =>
  i <= -1 ? null : ok((1 + i) ** (PERIODOS[destino] / PERIODOS[origem]) - 1);

/** Taxa nominal ao ano capitalizada `vezes` por ano em taxa efetiva ao ano. */
export const taxaEfetiva = (nominal: number, vezes: number): number | null => (vezes >= 1 ? ok((1 + nominal / vezes) ** vezes - 1) : null);

/** Taxa real descontada a inflação (equação de Fisher). */
export const taxaReal = (nominal: number, inflacao: number): number | null => (inflacao <= -1 ? null : ok((1 + nominal) / (1 + inflacao) - 1));

export type Desconto = { desconto: number; liquido: number; taxaEfetiva: number };
/** Desconto simples de um título: comercial (por fora, sobre o nominal) ou racional (por dentro, sobre o atual). */
export const descontoSimples = (nominal: number, taxa: number, prazo: number, tipo: 'comercial' | 'racional'): Desconto | null => {
  if (!(nominal > 0) || !(prazo > 0) || !(taxa >= 0)) return null;
  const liquido = tipo === 'comercial' ? nominal * (1 - taxa * prazo) : nominal / (1 + taxa * prazo);
  if (!(liquido > 0)) return null;
  const desconto = nominal - liquido;
  return { desconto, liquido, taxaEfetiva: desconto / liquido / prazo };
};

// ───────────── Fluxo de caixa ─────────────

/** Valor presente líquido do fluxo (posição 0 = hoje) à taxa por período. */
export const vpl = (taxa: number, fluxos: number[]): number | null =>
  taxa <= -1 ? null : ok(fluxos.reduce((s, f, t) => s + f / (1 + taxa) ** t, 0));

/** Taxa interna de retorno por período; nula se o fluxo não troca de sinal ou não converge. */
export const tir = (fluxos: number[]): number | null => {
  if (!fluxos.some((f) => f > 0) || !fluxos.some((f) => f < 0)) return null;
  return raiz((x) => fluxos.reduce((s, f, t) => s + f / (1 + x) ** t, 0));
};

/** Períodos até recuperar o investimento (fração por interpolação); com `taxa`, payback descontado. Nulo se não recupera. */
export const payback = (fluxos: number[], taxa = 0): number | null => {
  let acumulado = 0;
  for (let t = 0; t < fluxos.length; t++) {
    const f = fluxos[t] / (1 + taxa) ** t;
    const antes = acumulado;
    acumulado += f;
    if (t > 0 && antes < 0 && acumulado >= 0) return t - 1 + -antes / f;
  }
  return null;
};

// ───────────── Contábil ─────────────

export type MetodoDepreciacao = 'linear' | 'digitos' | 'decrescente';
export type LinhaDepreciacao = { ano: number; depreciacao: number; acumulada: number; contabil: number };

/**
 * Depreciação anual: linear (quotas iguais), soma dos dígitos dos anos (decrescente) ou saldo decrescente com taxa
 * dupla (2 / vida útil), sem passar do valor residual e completando no último ano.
 */
export const tabelaDepreciacao = (custo: number, residual: number, vida: number, metodo: MetodoDepreciacao): LinhaDepreciacao[] => {
  if (!(custo > 0) || !(residual >= 0) || residual >= custo || !Number.isInteger(vida) || vida < 1 || vida > 100) return [];
  const base = custo - residual;
  const soma = (vida * (vida + 1)) / 2;
  const linhas: LinhaDepreciacao[] = [];
  let contabil = custo;
  for (let ano = 1; ano <= vida; ano++) {
    let d = metodo === 'linear' ? base / vida : metodo === 'digitos' ? (base * (vida - ano + 1)) / soma : contabil * (2 / vida);
    if (metodo === 'decrescente' && ano === vida) d = contabil - residual;
    d = Math.min(d, contabil - residual);
    contabil -= d;
    linhas.push({ ano, depreciacao: d, acumulada: custo - contabil, contabil });
  }
  return linhas;
};

export type Markup = { preco: number; multiplicador: number; divisor: number; lucro: number };
/** Preço de venda pelo markup divisor: custo ÷ [1 − (despesas + impostos + margem)], todos sobre o preço. */
export const precoPorMarkup = (custo: number, despesas: number, impostos: number, margem: number): Markup | null => {
  const divisor = 1 - (despesas + impostos + margem);
  if (!(custo > 0) || divisor <= 0) return null;
  const preco = custo / divisor;
  return { preco, multiplicador: 1 / divisor, divisor, lucro: preco * margem };
};

/** Margem líquida sobre o preço de venda praticado, descontados custo, despesas e impostos sobre o preço. */
export const margemDoPreco = (preco: number, custo: number, despesas: number, impostos: number): number | null =>
  preco > 0 ? ok((preco - custo - preco * (despesas + impostos)) / preco) : null;

export type PontoEquilibrio = { margemContribuicao: number; indice: number; quantidade: number; receita: number };
/** Ponto de equilíbrio contábil: custos fixos ÷ margem de contribuição unitária. */
export const pontoEquilibrio = (custosFixos: number, preco: number, custoVariavel: number): PontoEquilibrio | null => {
  const mc = preco - custoVariavel;
  if (!(preco > 0) || !(mc > 0) || !(custosFixos >= 0)) return null;
  const quantidade = custosFixos / mc;
  return { margemContribuicao: mc, indice: mc / preco, quantidade, receita: quantidade * preco };
};

// ───────────── Fiscal ─────────────

export type FaixaSimples = { ate: number; aliquota: number; deducao: number };

/** Anexos do Simples Nacional (LC 123/2006, redação da LC 155/2016): limite da faixa, alíquota nominal e parcela a deduzir. */
export const ANEXOS_SIMPLES: Record<string, { nome: string; faixas: FaixaSimples[] }> = {
  I: { nome: 'Anexo I — Comércio', faixas: faixas([4, 7.3, 9.5, 10.7, 14.3, 19], [0, 5940, 13860, 22500, 87300, 378000]) },
  II: { nome: 'Anexo II — Indústria', faixas: faixas([4.5, 7.8, 10, 11.2, 14.7, 30], [0, 5940, 13860, 22500, 85500, 720000]) },
  III: { nome: 'Anexo III — Serviços', faixas: faixas([6, 11.2, 13.5, 16, 21, 33], [0, 9360, 17640, 35640, 125640, 648000]) },
  IV: { nome: 'Anexo IV — Serviços', faixas: faixas([4.5, 9, 10.2, 14, 22, 33], [0, 8100, 12420, 39780, 183780, 828000]) },
  V: { nome: 'Anexo V — Serviços', faixas: faixas([15.5, 18, 19.5, 20.5, 23, 30.5], [0, 4500, 9900, 17100, 62100, 540000]) },
};
function faixas(aliquotas: number[], deducoes: number[]): FaixaSimples[] {
  const limites = [180000, 360000, 720000, 1800000, 3600000, 4800000];
  return limites.map((ate, k) => ({ ate, aliquota: aliquotas[k] / 100, deducao: deducoes[k] }));
}

export type Simples = { faixa: number; aliquotaNominal: number; deducao: number; aliquotaEfetiva: number; imposto: number };
/**
 * Alíquota efetiva do Simples: (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, e o imposto da receita do mês.
 * Sem RBT12 (início de atividade) vale a alíquota nominal da 1ª faixa. Nulo acima do teto da última faixa.
 */
export const simplesNacional = (rbt12: number, receitaMes: number, tabela: FaixaSimples[]): Simples | null => {
  if (!(rbt12 >= 0) || !(receitaMes >= 0) || tabela.length === 0) return null;
  const k = tabela.findIndex((f) => rbt12 <= f.ate);
  if (k < 0) return null;
  const f = tabela[k];
  const efetiva = rbt12 === 0 ? f.aliquota : (rbt12 * f.aliquota - f.deducao) / rbt12;
  return { faixa: k + 1, aliquotaNominal: f.aliquota, deducao: f.deducao, aliquotaEfetiva: efetiva, imposto: receitaMes * efetiva };
};

export type ImpostoDentroFora = { base: number; imposto: number; total: number };
/**
 * Imposto por dentro (o imposto faz parte do preço: gross-up do líquido desejado, total = líquido ÷ (1 − alíquota)) ou
 * por fora (somado ao valor: total = valor × (1 + alíquota)).
 */
export const impostoDentroFora = (valor: number, aliquota: number, modo: 'dentro' | 'fora'): ImpostoDentroFora | null => {
  if (!(valor >= 0) || !(aliquota >= 0) || (modo === 'dentro' && aliquota >= 1)) return null;
  if (modo === 'fora') return { base: valor, imposto: valor * aliquota, total: valor * (1 + aliquota) };
  const total = valor / (1 - aliquota);
  return { base: valor, imposto: total - valor, total };
};

export type Retencao = { tributo: string; aliquota: number; valor: number; dispensada: boolean };
export type Retencoes = { linhas: Retencao[]; totalRetido: number; liquido: number };
/** Alíquotas usuais de retenção na nota de serviço entre pessoas jurídicas (IRRF, PIS/COFINS/CSLL, INSS, ISS). */
export const RETENCOES_PADRAO = { irrf: 0.015, pis: 0.0065, cofins: 0.03, csll: 0.01, inss: 0.11, iss: 0.05 };
/** Abaixo disso a retenção é dispensada: IRRF de até R$ 10,00 e o conjunto PIS/COFINS/CSLL de até R$ 10,00. */
export const DISPENSA_RETENCAO = 10;

/**
 * Retenções na fonte sobre o valor da nota: cada tributo marcado com a sua alíquota. IRRF e o conjunto
 * PIS/COFINS/CSLL de até R$ 10,00 ficam dispensados.
 */
export const retencoesNaFonte = (valor: number, aliquotas: Partial<Record<keyof typeof RETENCOES_PADRAO, number>>): Retencoes | null => {
  if (!(valor > 0)) return null;
  const nomes: Record<keyof typeof RETENCOES_PADRAO, string> = { irrf: 'IRRF', pis: 'PIS', cofins: 'COFINS', csll: 'CSLL', inss: 'INSS', iss: 'ISS' };
  const linhas: Retencao[] = (Object.keys(nomes) as (keyof typeof nomes)[])
    .filter((k) => aliquotas[k] !== undefined)
    .map((k) => ({ tributo: nomes[k], aliquota: aliquotas[k]!, valor: valor * aliquotas[k]!, dispensada: false }));
  const csrf = linhas.filter((l) => ['PIS', 'COFINS', 'CSLL'].includes(l.tributo));
  const somaCsrf = csrf.reduce((s, l) => s + l.valor, 0);
  for (const l of linhas) {
    if (l.tributo === 'IRRF' && l.valor <= DISPENSA_RETENCAO) l.dispensada = true;
    if (csrf.includes(l) && somaCsrf <= DISPENSA_RETENCAO) l.dispensada = true;
  }
  const totalRetido = linhas.filter((l) => !l.dispensada).reduce((s, l) => s + l.valor, 0);
  return { linhas, totalRetido, liquido: valor - totalRetido };
};

// ───────────── Datas ─────────────

const diaUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Dias corridos e dias úteis (fora fins de semana e feriados nacionais) de `de` (exclusive) até `ate` (inclusive). */
export const diasEntre = (de: string, ate: string): { corridos: number; uteis: number } => {
  const corridos = Math.round((diaUtc(ate) - diaUtc(de)) / 86400000);
  const passo = corridos < 0 ? -1 : 1;
  let uteis = 0;
  for (let k = 1; k <= Math.abs(corridos); k++) {
    const d = new Date(diaUtc(de) + passo * k * 86400000).toISOString().slice(0, 10);
    if (diaUtil(d)) uteis++;
  }
  return { corridos, uteis: passo * uteis };
};
