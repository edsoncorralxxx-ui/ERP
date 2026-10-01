import { describe, expect, it } from 'vitest';
import {
  ANEXOS_SIMPLES, descontoSimples, diasEntre, impostoDentroFora, jurosSimples, margemDoPreco, payback, pontoEquilibrio, precoPorMarkup,
  resolverTvm, retencoesNaFonte, simplesNacional, tabelaAmortizacao, tabelaDepreciacao, taxaEfetiva, taxaEquivalente, taxaReal, tir, vpl,
} from './financeiro';

const perto = (v: number | null | undefined, esperado: number, casas = 2) => expect(v ?? NaN).toBeCloseTo(esperado, casas);

describe('juros e séries (HP 12C)', () => {
  it('resolve FV, PV, PMT, n e i', () => {
    perto(resolverTvm({ n: 12, i: 0.01, pv: -1000, pmt: 0 }, 'fv'), 1126.83);
    perto(resolverTvm({ n: 12, i: 0.02, pv: 10000, fv: 0 }, 'pmt'), -945.6);
    perto(resolverTvm({ n: 12, i: 0.02, pmt: -945.6, fv: 0 }, 'pv'), 10000, 0);
    perto(resolverTvm({ i: 0.02, pv: 10000, pmt: -945.6, fv: 0 }, 'n'), 12, 3);
    perto(resolverTvm({ n: 12, pv: 10000, pmt: -945.6, fv: 0 }, 'i'), 0.02, 5);
  });

  it('pagamento antecipado e taxa zero', () => {
    perto(resolverTvm({ n: 12, i: 0.02, pv: 10000, fv: 0 }, 'pmt', 'inicio'), -927.05);
    perto(resolverTvm({ n: 10, i: 0, pv: 1000, fv: 0 }, 'pmt'), -100);
    expect(resolverTvm({ n: 12, pv: 1000, pmt: 100, fv: 0 }, 'i')).toBeNull();
  });

  it('juros simples', () => {
    expect(jurosSimples(1000, 0.02, 6)).toEqual({ juros: 120, montante: 1120 });
  });
});

describe('financiamento', () => {
  it('Price: prestação constante, juros sobre o saldo, saldo zera', () => {
    const t = tabelaAmortizacao(10000, 0.02, 12, 'PRICE');
    perto(t[0].prestacao, 945.6);
    perto(t[0].juros, 200);
    perto(t[0].amortizacao, 745.6);
    expect(t[11].saldo).toBe(0);
    perto(t.reduce((s, l) => s + l.amortizacao, 0), 10000);
  });

  it('SAC: amortização constante e prestação decrescente', () => {
    const t = tabelaAmortizacao(10000, 0.02, 12, 'SAC');
    perto(t[0].amortizacao, 833.33);
    perto(t[0].prestacao, 1033.33);
    perto(t[11].prestacao, 850);
    expect(tabelaAmortizacao(10000, 0.02, 0, 'SAC')).toEqual([]);
  });
});

describe('taxas', () => {
  it('equivalente, efetiva, real e desconto', () => {
    perto(taxaEquivalente(0.01, 'mes', 'ano'), 0.126825, 5);
    perto(taxaEquivalente(0.126825, 'ano', 'mes'), 0.01, 5);
    perto(taxaEquivalente(0.01, 'mes', 'dia'), 0.000332, 5);
    perto(taxaEfetiva(0.12, 12), 0.126825, 5);
    perto(taxaReal(0.1, 0.04), 0.057692, 5);
    expect(descontoSimples(1000, 0.02, 3, 'comercial')).toMatchObject({ desconto: 60, liquido: 940 });
    perto(descontoSimples(1000, 0.02, 3, 'racional')?.liquido, 943.4);
    expect(descontoSimples(1000, 0.5, 3, 'comercial')).toBeNull();
  });
});

describe('fluxo de caixa', () => {
  const fluxo = [-1000, 500, 500, 500];
  it('VPL, TIR e payback', () => {
    perto(vpl(0.1, fluxo), 243.43);
    perto(tir(fluxo), 0.233752, 5);
    perto(vpl(tir(fluxo)!, fluxo), 0, 6);
    expect(payback(fluxo)).toBe(2);
    perto(payback([-1000, 400, 400, 400]), 2.5);
    perto(payback(fluxo, 0.1), 2.352, 3);
    expect(tir([100, 200])).toBeNull();
    expect(payback([-1000, 100, 100])).toBeNull();
  });
});

describe('contábil', () => {
  it('depreciação linear, soma dos dígitos e saldo decrescente', () => {
    expect(tabelaDepreciacao(10000, 1000, 5, 'linear').map((l) => l.depreciacao)).toEqual([1800, 1800, 1800, 1800, 1800]);
    expect(tabelaDepreciacao(10000, 1000, 5, 'digitos').map((l) => l.depreciacao)).toEqual([3000, 2400, 1800, 1200, 600]);
    const d = tabelaDepreciacao(10000, 1000, 5, 'decrescente');
    expect(d.map((l) => Math.round(l.depreciacao))).toEqual([4000, 2400, 1440, 864, 296]);
    expect(d[4].contabil).toBeCloseTo(1000, 6);
  });

  it('markup, margem e ponto de equilíbrio', () => {
    perto(precoPorMarkup(100, 0.1, 0.1, 0.2)?.preco, 166.67);
    perto(precoPorMarkup(100, 0.1, 0.1, 0.2)?.multiplicador, 1.6667, 4);
    expect(precoPorMarkup(100, 0.5, 0.3, 0.2)).toBeNull();
    perto(margemDoPreco(166.67, 100, 0.1, 0.1), 0.2, 3);
    expect(pontoEquilibrio(10000, 50, 30)).toMatchObject({ margemContribuicao: 20, quantidade: 500, receita: 25000, indice: 0.4 });
    expect(pontoEquilibrio(10000, 30, 30)).toBeNull();
  });
});

describe('fiscal', () => {
  it('Simples Nacional: alíquota efetiva e imposto do mês', () => {
    const s = simplesNacional(500000, 40000, ANEXOS_SIMPLES.III.faixas)!;
    expect(s.faixa).toBe(3);
    perto(s.aliquotaEfetiva, 0.09972, 5);
    perto(s.imposto, 3988.8);
    expect(simplesNacional(0, 10000, ANEXOS_SIMPLES.I.faixas)?.aliquotaEfetiva).toBe(0.04);
    expect(simplesNacional(5000000, 10000, ANEXOS_SIMPLES.I.faixas)).toBeNull();
  });

  it('imposto por dentro e por fora', () => {
    expect(impostoDentroFora(1000, 0.2, 'dentro')).toEqual({ base: 1000, imposto: 250, total: 1250 });
    perto(impostoDentroFora(1000, 0.2, 'fora')?.total, 1200);
  });

  it('retenções na fonte com dispensa de até R$ 10,00', () => {
    const r = retencoesNaFonte(1000, { irrf: 0.015, pis: 0.0065, cofins: 0.03, csll: 0.01, inss: 0.11, iss: 0.05 })!;
    perto(r.totalRetido, 221.5);
    perto(r.liquido, 778.5);
    const pequeno = retencoesNaFonte(500, { irrf: 0.015, pis: 0.0065, cofins: 0.03, csll: 0.01 })!;
    expect(pequeno.linhas.find((l) => l.tributo === 'IRRF')?.dispensada).toBe(true);
    perto(pequeno.totalRetido, 23.25);
    const csrfPequena = retencoesNaFonte(200, { pis: 0.0065, cofins: 0.03, csll: 0.01 })!;
    expect(csrfPequena.totalRetido).toBe(0);
  });
});

describe('datas', () => {
  it('dias corridos e úteis com feriado nacional', () => {
    // 29/05/2026 sexta → 05/06/2026 sexta; 04/06 é Corpus Christi.
    expect(diasEntre('2026-05-29', '2026-06-05')).toEqual({ corridos: 7, uteis: 4 });
    expect(diasEntre('2026-06-05', '2026-05-29')).toEqual({ corridos: -7, uteis: -4 });
  });
});
