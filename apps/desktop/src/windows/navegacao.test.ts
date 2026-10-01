import { setTransport } from '../api/client';
import { destino, navegavel, SEQUENCIA_PADRAO } from './navegacao';

describe('navegação entre registros', () => {
  const seq = ['a', 'b', 'c'];

  it('anda pela sequência e para nas pontas', () => {
    expect(destino(seq, 'b', 'anterior')).toBe('a');
    expect(destino(seq, 'b', 'proximo')).toBe('c');
    expect(destino(seq, 'b', 'primeiro')).toBe('a');
    expect(destino(seq, 'b', 'ultimo')).toBe('c');
    expect(destino(seq, 'a', 'anterior')).toBeNull();
    expect(destino(seq, 'a', 'primeiro')).toBeNull();
    expect(destino(seq, 'c', 'proximo')).toBeNull();
    expect(destino(seq, 'c', 'ultimo')).toBeNull();
    expect(destino([], 'a', 'proximo')).toBeNull();
  });

  it('de um registro fora da sequência (novo), Anterior vai ao último e Próximo ao primeiro', () => {
    expect(destino(seq, 'novo-1', 'anterior')).toBe('c');
    expect(destino(seq, 'novo-1', 'proximo')).toBe('a');
  });

  it('as fichas andam e as listas não; a competência anda pelos meses do ano', async () => {
    expect(navegavel('customer')).toBe(true);
    expect(navegavel('tax-period')).toBe(true);
    expect(navegavel('customers')).toBe(false);
    expect(navegavel('company-profile')).toBe(false);
    expect(await SEQUENCIA_PADRAO['tax-period']!('2026-09')).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
  });

  it('a sequência padrão de uma ficha é a lista completa do tipo, com os inativos', async () => {
    const paths: string[] = [];
    setTransport(async (req) => {
      paths.push(req.path);
      return { status: 200, headers: {}, body: JSON.stringify([{ id: 'c-1' }, { id: 'c-2' }]) };
    });
    expect(await SEQUENCIA_PADRAO.customer!('c-2')).toEqual(['c-1', 'c-2']);
    expect(paths).toEqual(['/api/v1/customers?status=TODOS']);
  });
});

describe('Sequência padrão de projetos e equipamentos', () => {
  it('inclui encerrados e cancelados com os parâmetros que essas listas aceitam', async () => {
    const caminhos: string[] = [];
    setTransport(async (req) => {
      caminhos.push(req.path);
      return { status: 200, headers: {}, body: JSON.stringify([{ id: 'a' }, { id: 'b' }]) };
    });
    expect(await SEQUENCIA_PADRAO.project!('a')).toEqual(['a', 'b']);
    expect(await SEQUENCIA_PADRAO.equipment!('a')).toEqual(['a', 'b']);
    expect(caminhos).toEqual(['/api/v1/projects?includeClosed=true', '/api/v1/equipment?includeCancelled=true']);
  });
});
