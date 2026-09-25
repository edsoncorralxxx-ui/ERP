import { data, dataHora, hora, numero } from './format';

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
