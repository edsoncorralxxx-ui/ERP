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
