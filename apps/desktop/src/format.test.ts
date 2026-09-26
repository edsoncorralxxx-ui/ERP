import { data, dataHora, decimalDaApi, decimalParaApi, hora, numero } from './format';

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
