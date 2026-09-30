import { dataParaApi, somarMeses } from './format';

/**
 * Calculadora dos campos de dinheiro: o texto depois do "=" ("=1.500,00*3-10%") com as quatro operações, parênteses e
 * números no padrão brasileiro. Sem `eval`: um analisador de precedência que só conhece esses símbolos.
 */

type Token = { tipo: 'num'; valor: number } | { tipo: 'op'; valor: string };

/** "1.234,56" → 1234.56; "2.5" → 2.5; "1.234" (sem vírgula) → 1234, milhar no padrão brasileiro. Nulo se não for número. */
const numeroDigitado = (t: string): number | null => {
  let n: string;
  if (t.includes(',')) {
    if (t.indexOf(',') !== t.lastIndexOf(',') || !/^\d{1,3}(\.\d{3})*,\d*$|^\d*,\d*$/.test(t)) return null;
    n = t.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    n = t.replace(/\./g, '');
  } else {
    if (!/^\d*\.?\d*$/.test(t)) return null;
    n = t;
  }
  if (n === '.' || n === '') return null;
  return Number(n);
};

const tokens = (texto: string): Token[] | null => {
  const t = texto.replace(/R\$/g, '').replace(/\s+/g, '');
  const lista: Token[] = [];
  const re = /[\d.,]+|[-+*/()x×÷]/giy;
  let m: RegExpExecArray | null;
  while (re.lastIndex < t.length) {
    m = re.exec(t);
    if (!m) return null;
    const s = m[0];
    if (/^[\d.,]/.test(s)) {
      const n = numeroDigitado(s);
      if (n === null) return null;
      lista.push({ tipo: 'num', valor: n });
    } else {
      lista.push({ tipo: 'op', valor: s === 'x' || s === 'X' || s === '×' ? '*' : s === '÷' ? '/' : s });
    }
  }
  return lista;
};

/**
 * Valor da expressão (com ou sem o "=" na frente), ou nulo quando ela não é uma conta válida ou divide por zero.
 * Aceita + - * / (também x, × e ÷), parênteses e sinal na frente de número ou parêntese.
 */
export const avaliarExpressao = (texto: string): number | null => {
  const lista = tokens(texto.trim().replace(/^=/, ''));
  if (!lista || lista.length === 0) return null;
  let i = 0;
  const ver = () => lista[i];
  const ehOp = (v: string) => ver()?.tipo === 'op' && ver()!.valor === v;

  // expressão := termo (("+" | "-") termo)*; termo := fator (("*" | "/") fator)*; fator := ("-" | "+") fator | número | "(" expressão ")"
  const fator = (): number | null => {
    if (ehOp('-') || ehOp('+')) {
      const sinal = ver()!.valor === '-' ? -1 : 1;
      i++;
      const v = fator();
      return v === null ? null : sinal * v;
    }
    if (ehOp('(')) {
      i++;
      const v = expressao();
      if (v === null || !ehOp(')')) return null;
      i++;
      return v;
    }
    const tk = ver();
    if (tk?.tipo !== 'num') return null;
    i++;
    return tk.valor;
  };
  const termo = (): number | null => {
    let v = fator();
    while (v !== null && (ehOp('*') || ehOp('/'))) {
      const op = ver()!.valor;
      i++;
      const d = fator();
      if (d === null || (op === '/' && d === 0)) return null;
      v = op === '*' ? v * d : v / d;
    }
    return v;
  };
  const expressao = (): number | null => {
    let v = termo();
    while (v !== null && (ehOp('+') || ehOp('-'))) {
      const op = ver()!.valor;
      i++;
      const d = termo();
      if (d === null) return null;
      v = op === '+' ? v + d : v - d;
    }
    return v;
  };

  const v = expressao();
  if (v === null || i !== lista.length || !Number.isFinite(v)) return null;
  // Tira o resíduo do ponto flutuante (0,1 + 0,2) antes de arredondar para as casas do campo.
  return Number(v.toPrecision(12));
};

/** Resultado da expressão no padrão brasileiro, com 2 a `casas` casas ("=2+2" → "4,00"); nulo se a conta não vale. */
export const resultadoDaExpressao = (texto: string, casas = 2): string | null => {
  const v = avaliarExpressao(texto);
  if (v === null) return null;
  const r = v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, casas) });
  return /^-0(,0+)?$/.test(r) ? r.slice(1) : r;
};

// ───────────── Calculadora dos campos de data ─────────────

const isoDe = (d: Date): string => d.toISOString().slice(0, 10);
const diaUtc = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const somarDias = (iso: string, n: number): string => {
  const d = diaUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDe(d);
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
const pascoa = (ano: number): string => {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

const feriadosPorAno = new Map<number, Set<string>>();

/**
 * Feriados nacionais do ano, como no calendário bancário: os fixos (Consciência Negra a partir de 2024), a segunda e a
 * terça de Carnaval, a Sexta-feira Santa e Corpus Christi. Feriados estaduais e municipais não entram.
 */
export const feriadosNacionais = (ano: number): Set<string> => {
  let s = feriadosPorAno.get(ano);
  if (!s) {
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25', ...(ano >= 2024 ? ['11-20'] : [])];
    const p = pascoa(ano);
    s = new Set([...fixos.map((md) => `${ano}-${md}`), somarDias(p, -48), somarDias(p, -47), somarDias(p, -2), somarDias(p, 60)]);
    feriadosPorAno.set(ano, s);
  }
  return s;
};

/** Dia útil: de segunda a sexta e fora dos feriados nacionais. */
export const diaUtil = (iso: string): boolean => {
  const semana = diaUtc(iso).getUTCDay();
  return semana !== 0 && semana !== 6 && !feriadosNacionais(Number(iso.slice(0, 4))).has(iso);
};

const somarDiasUteis = (iso: string, n: number): string => {
  const passo = n < 0 ? -1 : 1;
  let d = iso;
  for (let falta = Math.abs(n); falta > 0; ) {
    d = somarDias(d, passo);
    if (diaUtil(d)) falta--;
  }
  return d;
};

const UNIDADES: Record<string, 'dc' | 'du' | 's' | 'm' | 'a'> = {
  '': 'dc', d: 'dc', dc: 'dc', du: 'du', s: 's', sem: 's', m: 'm', mes: 'm', meses: 'm', a: 'a', ano: 'a', anos: 'a',
};

/**
 * Expressão de data ("=19/05/2026+90du", "=hoje+30dc", "=+1m", "01/10/2026-5du+2s") no formato da API, ou nulo quando
 * não é uma conta válida. Unidades: `dc` (ou `d`, ou nada) dias corridos, `du` dias úteis, `s` semanas, `m` meses e
 * `a` anos; os termos se aplicam da esquerda para a direita. Sem data no começo, a conta parte de `base` (a data que
 * estava no campo) ou de hoje.
 */
export const avaliarData = (texto: string, base: string | null, hoje: string): string | null => {
  const t = texto.trim().replace(/^=/, '').replace(/\s+/g, '').toLowerCase();
  const m = /^(hoje|h|\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{8}|\d{6})?((?:[+-]\d+[a-z]*)*)$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  let d: string;
  if (!m[1]) d = base ?? hoje;
  else if (m[1] === 'hoje' || m[1] === 'h') d = hoje;
  else {
    const iso = dataParaApi(m[1]);
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    d = iso;
  }
  for (const [, sinal, qtd, un] of m[2].matchAll(/([+-])(\d+)([a-z]*)/g)) {
    const unidade = UNIDADES[un];
    if (!unidade || Number(qtd) > 36_500) return null;
    const n = (sinal === '-' ? -1 : 1) * Number(qtd);
    d = unidade === 'dc' ? somarDias(d, n) : unidade === 'du' ? somarDiasUteis(d, n) : unidade === 's' ? somarDias(d, 7 * n)
      : somarMeses(d, unidade === 'm' ? n : 12 * n);
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= '1900-01-01' && d <= '9999-12-31' ? d : null;
};

/** Diz se o texto do campo de data é uma conta (começa com "=" ou tem termo como "+90du") e não uma data simples. */
export const ehContaDeData = (texto: string): boolean => {
  const t = texto.trim();
  return t.startsWith('=') || (/\d\s*[+-]\s*\d+\s*[a-z]*\s*$/i.test(t) && !/^\d{1,2}-\d{1,2}-(\d{4}|\d{2})$/.test(t));
};
