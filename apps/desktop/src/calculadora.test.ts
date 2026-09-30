import { describe, expect, it } from 'vitest';
import { avaliarExpressao, resultadoDaExpressao } from './calculadora';

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
