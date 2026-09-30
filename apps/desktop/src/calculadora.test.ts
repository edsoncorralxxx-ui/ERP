import { describe, expect, it } from 'vitest';
import { avaliarData, avaliarExpressao, diaUtil, ehContaDeData, resultadoDaExpressao } from './calculadora';

describe('calculadora dos campos de dinheiro', () => {
  it('faz as quatro operações com precedência e parênteses', () => {
    expect(avaliarExpressao('=2+2')).toBe(4);
    expect(avaliarExpressao('=2+3*4')).toBe(14);
    expect(avaliarExpressao('=(2+3)*4')).toBe(20);
    expect(avaliarExpressao('=10-4/2')).toBe(8);
    expect(avaliarExpressao('=-5+2')).toBe(-3);
    expect(avaliarExpressao('=3x2')).toBe(6);
    expect(avaliarExpressao('=9÷3')).toBe(3);
  });

  it('lê números no padrão brasileiro', () => {
    expect(avaliarExpressao('=1.500,50*2')).toBe(3001);
    expect(avaliarExpressao('=1.500+1')).toBe(1501);
    expect(avaliarExpressao('=2,5+2.5')).toBe(5);
    expect(avaliarExpressao('=R$ 10,00 + R$ 5,00')).toBe(15);
    expect(avaliarExpressao('=0,1+0,2')).toBe(0.3);
  });

  it('recusa o que não é conta', () => {
    for (const t of ['=', '=2+', '=(2+3', '=2/0', '=abc', '=1,2,3', '=2++']) expect(avaliarExpressao(t)).toBeNull();
  });

  it('formata o resultado com as casas do campo', () => {
    expect(resultadoDaExpressao('=2+2')).toBe('4,00');
    expect(resultadoDaExpressao('=1000*1,5')).toBe('1.500,00');
    expect(resultadoDaExpressao('=10/3')).toBe('3,33');
    expect(resultadoDaExpressao('=10/3', 6)).toBe('3,333333');
    expect(resultadoDaExpressao('=1-1')).toBe('0,00');
  });
});

describe('calculadora dos campos de data', () => {
  const hoje = '2026-09-30';

  it('soma dias corridos, semanas, meses e anos', () => {
    expect(avaliarData('=19/05/2026+90dc', null, hoje)).toBe('2026-08-17');
    expect(avaliarData('=19/05/2026+90', null, hoje)).toBe('2026-08-17');
    expect(avaliarData('=19/05/2026-19d', null, hoje)).toBe('2026-04-30');
    expect(avaliarData('=19/05/2026+2s', null, hoje)).toBe('2026-06-02');
    expect(avaliarData('=31/01/2026+1m', null, hoje)).toBe('2026-02-28');
    expect(avaliarData('=29/02/2028+1a', null, hoje)).toBe('2029-02-28');
  });

  it('dias úteis pulam fins de semana e feriados nacionais', () => {
    // 19/05/2026 é terça; 04/06/2026 é Corpus Christi.
    expect(avaliarData('=19/05/2026+1du', null, hoje)).toBe('2026-05-20');
    expect(avaliarData('=29/05/2026+1du', null, hoje)).toBe('2026-06-01');
    expect(avaliarData('=03/06/2026+1du', null, hoje)).toBe('2026-06-05');
    expect(avaliarData('=19/05/2026+90du', null, hoje)).toBe('2026-09-24');
    expect(avaliarData('=05/06/2026-1du', null, hoje)).toBe('2026-06-03');
    // Carnaval de 2026: 16 e 17/02; Sexta-feira Santa: 03/04.
    expect(diaUtil('2026-02-16')).toBe(false);
    expect(diaUtil('2026-02-17')).toBe(false);
    expect(diaUtil('2026-04-03')).toBe(false);
    expect(diaUtil('2026-11-20')).toBe(false);
    expect(diaUtil('2026-11-19')).toBe(true);
  });

  it('parte de hoje ou da data que estava no campo, e aceita termos em sequência', () => {
    expect(avaliarData('=hoje+1dc', null, hoje)).toBe('2026-10-01');
    expect(avaliarData('=+1m', '2026-01-15', hoje)).toBe('2026-02-15');
    expect(avaliarData('=+1m', null, hoje)).toBe('2026-10-30');
    expect(avaliarData('19/05/2026+1m+5du', null, hoje)).toBe('2026-06-26');
    expect(avaliarData('=19/05/26 + 10 DU', null, hoje)).toBe('2026-06-02');
  });

  it('recusa o que não é conta de data', () => {
    for (const t of ['=', '=19/05/2026+', '=19/05/2026+5xx', '=31/02/2026+1', '=abc', '=1+1*2']) expect(avaliarData(t, null, hoje)).toBeNull();
  });

  it('distingue conta de data simples', () => {
    expect(ehContaDeData('19/05/2026+90du')).toBe(true);
    expect(ehContaDeData('=hoje')).toBe(true);
    expect(ehContaDeData('20-09-2026')).toBe(false);
    expect(ehContaDeData('20/09/2026')).toBe(false);
    expect(ehContaDeData('200926')).toBe(false);
  });
});
