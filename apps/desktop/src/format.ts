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

// ───────────── Dinheiro em centavos e datas de negócio (Sprint 4) ─────────────

/** Centavos da API ("30207146") no padrão brasileiro, sem o símbolo: `302.071,46`. */
export const centavos = (valor: string | number | null | undefined): string => {
  if (valor === null || valor === undefined || valor === '') return '';
  const texto = String(valor);
  if (!/^-?\d+$/.test(texto)) return texto;
  const negativo = texto.startsWith('-');
  const digitos = texto.replace('-', '').padStart(3, '0');
  const inteiro = digitos.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}${inteiro},${digitos.slice(-2)}`;
};

/** Centavos da API como valor em reais: `R$ 302.071,46`. */
export const reais = (valor: string | number | null | undefined): string => {
  const t = centavos(valor);
  return t === '' ? '' : t.startsWith('-') ? `-R$ ${t.slice(1)}` : `R$ ${t}`;
};

/**
 * Valor em reais digitado no padrão brasileiro ("1.234,5", "1234", "R$ 10,00") para centavos em texto ("123450"), sem
 * ponto flutuante. Vazio vira nulo; texto que não é valor volta como veio, para o servidor apontar o erro no campo.
 */
export const centavosParaApi = (texto: string): string | null => {
  const t = texto.replace(/R\$\s?/, '').trim();
  if (t === '') return null;
  const decimal = decimalParaApi(t);
  if (decimal === null || !/^\d+(\.\d+)?$/.test(decimal)) return t;
  const [inteiro, fracao = ''] = decimal.split('.');
  if (fracao.length > 2) return t;
  const c = `${inteiro}${fracao.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  return c;
};

/** Data de negócio da API (`2026-10-10`) em `10/10/2026`, sem passar por fuso horário. */
export const dataDaApi = (iso: string | null | undefined): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/**
 * Data digitada para o formato da API. Aceita `20/09/2026`, `20/09/26`, `200926`, `20092026` e `20-09-2026` (componente
 * Campo de data). Vazio vira nulo; o que não é data volta como veio, para o servidor apontar o erro.
 */
export const dataParaApi = (texto: string): string | null => {
  const t = texto.trim();
  if (t === '') return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) m = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(t);
  if (!m) return t;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? t : iso;
};

/** Normaliza a data digitada para `DD/MM/AAAA` ao sair do campo; o que não é data fica como está. */
export const normalizarData = (texto: string): string => {
  const iso = dataParaApi(texto);
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? dataDaApi(iso) : texto;
};

/** Dia de negócio informado pelo servidor (fuso da empresa), com o dia do computador em que foi lido. */
let doServidor: { data: string; lidoEm: string } | null = null;

const hojeDoComputador = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Guarda o dia de negócio devolvido por `/api/v1/status` (ou esquece, com nulo). */
export const definirHojeDoServidor = (iso: string | null | undefined): void => {
  doServidor = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { data: iso, lidoEm: hojeDoComputador() } : null;
};

/**
 * Data de hoje no formato da API: o dia de negócio do servidor (fuso de São Paulo, o mesmo que confere "não futura")
 * enquanto o computador estiver no mesmo dia em que o leu; sem ele, o dia do computador.
 */
export const hojeIso = (): string => {
  const local = hojeDoComputador();
  return doServidor && doServidor.lidoEm === local ? doServidor.data : local;
};

/** Competência `AAAA-MM` da data da API, mostrada como `MM/AAAA`. */
export const competenciaDaApi = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

/** Competência digitada (`MM/AAAA` ou `M/AAAA`) no formato da API; o que não é competência volta como está. */
export const competenciaParaApi = (texto: string): string => {
  const t = texto.trim();
  const m = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return t;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12 ? `${m[2]}-${String(mes).padStart(2, '0')}` : t;
};

const ESCALA = 1_000_000n;

/** Decimal com ponto ("10.5") em inteiro com 6 casas; nulo se não for decimal não negativo com até 6 casas. */
const escalado = (v: string | null): bigint | null => {
  if (v === null || !/^\d+(\.\d{1,6})?$/.test(v)) return null;
  const [i, f = ''] = v.split('.');
  return BigInt(i) * ESCALA + BigInt(f.padEnd(6, '0'));
};

/**
 * Valor bruto da linha em centavos, como o servidor calcula (INV-SO-2): quantidade × preço arredondado uma vez, meio-par
 * (premissa PD-002). Nulo quando quantidade ou preço não são válidos. Só para mostrar; quem vale é o servidor.
 */
export const brutoDaLinha = (quantidade: string | null, preco: string | null): bigint | null => {
  const q = escalado(quantidade);
  const p = escalado(preco);
  if (q === null || p === null) return null;
  // q × p tem 12 casas; centavos têm 2: divide por 10^10 arredondando meio-par.
  const produto = q * p;
  const divisor = 10_000_000_000n;
  const inteiro = produto / divisor;
  const resto = produto % divisor;
  const metade = divisor / 2n;
  if (resto > metade || (resto === metade && inteiro % 2n === 1n)) return inteiro + 1n;
  return inteiro;
};

/** Divide o total em `n` parcelas com o resíduo de centavos a partir da primeira (premissa PD-002); a soma é exata. */
export const dividirEmParcelas = (total: bigint, n: number): bigint[] => {
  if (n <= 0 || total < 0n) return [];
  const base = total / BigInt(n);
  const resto = Number(total % BigInt(n));
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1n : 0n));
};

/** Mesmo dia `meses` meses depois (dia 31 cai no último dia do mês), em formato da API. */
export const somarMeses = (iso: string, meses: number): string => {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
};
