import { brutoDaLinha, centavos, centavosParaApi, data, dataDaApi, dataHora, dataParaApi, decimalDaApi, decimalParaApi, dividirEmParcelas, hora, normalizarData, numero, reais, somarMeses } from './format';

describe('formatos do design system', () => {
  const d = new Date(2026, 8, 5, 9, 7, 3);

  it('data em DD/MM/AAAA e data e hora sem vírgula entre elas', () => {
    expect(data(d)).toBe('05/09/2026');
    expect(hora(d)).toBe('09:07');
    expect(hora(d, true)).toBe('09:07:03');
    expect(dataHora(d)).toBe('05/09/2026 09:07');
  });

  it('valor vazio ou inválido vira texto vazio', () => {
    expect(data(null)).toBe('');
    expect(dataHora('não é data')).toBe('');
  });

  it('números com ponto de milhar e vírgula decimal', () => {
    expect(numero(23579.23, 2)).toBe('23.579,23');
    expect(numero(1284)).toBe('1.284');
  });
});

describe('decimais da API', () => {
  it('converte o que se digita no padrão brasileiro para o texto com ponto', () => {
    expect(decimalParaApi('1.234,5')).toBe('1234.5');
    expect(decimalParaApi('16,033333')).toBe('16.033333');
    expect(decimalParaApi('6')).toBe('6');
    expect(decimalParaApi('1.234')).toBe('1234');
    expect(decimalParaApi('184.5')).toBe('184.5');
    expect(decimalParaApi('  ')).toBeNull();
    expect(decimalParaApi('abc')).toBe('abc');
  });

  it('mostra o decimal da API com vírgula, milhar e casas mínimas', () => {
    expect(decimalDaApi('184.500000')).toBe('184,50');
    expect(decimalDaApi('23579.230000')).toBe('23.579,23');
    expect(decimalDaApi('6.000000', 0)).toBe('6');
    expect(decimalDaApi('0.333333', 0)).toBe('0,333333');
    expect(decimalDaApi(null)).toBe('');
  });
});

describe('dinheiro e datas de negócio (Sprint 4)', () => {
  it('centavos da API em reais no padrão brasileiro', () => {
    expect(reais('30207146')).toBe('R$ 302.071,46');
    expect(reais('5')).toBe('R$ 0,05');
    expect(reais(0)).toBe('R$ 0,00');
    expect(reais('-1250')).toBe('-R$ 12,50');
    expect(centavos('100000000')).toBe('1.000.000,00');
  });

  it('valor digitado vira centavos sem ponto flutuante', () => {
    expect(centavosParaApi('1.234,5')).toBe('123450');
    expect(centavosParaApi('R$ 10,00')).toBe('1000');
    expect(centavosParaApi('0,1')).toBe('10');
    expect(centavosParaApi('1,234')).toBe('1,234');
    expect(centavosParaApi('')).toBeNull();
  });

  it('datas de negócio sem fuso e digitação livre normalizada', () => {
    expect(dataDaApi('2026-10-01')).toBe('01/10/2026');
    expect(dataParaApi('01/10/2026')).toBe('2026-10-01');
    expect(dataParaApi('1/10/26')).toBe('2026-10-01');
    expect(dataParaApi('011026')).toBe('2026-10-01');
    expect(dataParaApi('01-10-2026')).toBe('2026-10-01');
    expect(dataParaApi('31/02/2026')).toBe('31/02/2026');
    expect(normalizarData('200926')).toBe('20/09/2026');
  });

  it('linha arredondada meio-par como no servidor e parcelas com resíduo na primeira', () => {
    expect(brutoDaLinha('10.5', '16.33')).toBe(17146n); // 171,465 → 171,46
    expect(brutoDaLinha('1', '0.125')).toBe(12n); // 0,125 → 0,12
    expect(brutoDaLinha('1', '0.135')).toBe(14n); // 0,135 → 0,14
    expect(brutoDaLinha('2', '150000')).toBe(30000000n);
    expect(brutoDaLinha('abc', '1')).toBeNull();
    expect(dividirEmParcelas(10000n, 3)).toEqual([3334n, 3333n, 3333n]);
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
  });
});
