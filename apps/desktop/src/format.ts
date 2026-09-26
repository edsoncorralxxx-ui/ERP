/**
 * Formatos do design system: datas `DD/MM/AAAA`, hora `HH:MM` e números no padrão brasileiro (`23.579,23`).
 * O `toLocaleString('pt-BR')` põe vírgula entre data e hora ("25/09/2026, 14:03"); aqui a data e a hora vêm só
 * separadas por espaço, como no restante do sistema.
 */
type Data = Date | string | null | undefined;

const comoData = (v: Data): Date | null => {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? null : d;
};

/** `25/09/2026` */
export const data = (v: Data): string => comoData(v)?.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) ?? '';

/** `14:03` ou, com segundos, `14:03:22` */
export const hora = (v: Data, segundos = false): string =>
  comoData(v)?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...(segundos ? { second: '2-digit' } : {}) }) ?? '';

/** `25/09/2026 14:03` */
export const dataHora = (v: Data, segundos = false): string => {
  const d = comoData(v);
  return d ? `${data(d)} ${hora(d, segundos)}` : '';
};

/** `1.234` ou, com casas, `1.234,50` */
export const numero = (n: number, casas = 0): string => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/**
 * Decimal digitado no padrão brasileiro ("1.234,5") para o texto com ponto que a API espera ("1234.5"). Vazio vira
 * nulo; texto que não é número volta como veio, para o servidor apontar o erro no campo.
 */
export const decimalParaApi = (texto: string): string | null => {
  const t = texto.trim();
  if (t === '') return null;
  // "1.234" sem vírgula é milhar (padrão brasileiro), não 1,234.
  const soMilhar = !t.includes(',') && /^-?\d{1,3}(\.\d{3})+$/.test(t);
  const semMilhar = t.includes(',') || soMilhar ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^-?\d+(\.\d+)?$/.test(semMilhar) ? semMilhar : t;
};

/** Decimal da API ("184.500000") no padrão brasileiro, com `minimo` casas e sem zeros sobrando ("184,50", "0,333333"). */
export const decimalDaApi = (valor: string | null | undefined, minimo = 2): string => {
  if (valor === null || valor === undefined || valor === '') return '';
  const [inteiro, fracao = ''] = valor.replace(/^-/, '').split('.');
  let casas = fracao.replace(/0+$/, '');
  if (casas.length < minimo) casas = casas.padEnd(minimo, '0');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor.startsWith('-') ? '-' : ''}${milhar}${casas ? `,${casas}` : ''}`;
};
