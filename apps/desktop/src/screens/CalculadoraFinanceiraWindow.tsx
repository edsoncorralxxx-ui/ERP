import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { TaxParameters } from '../api/types';
import {
  ANEXOS_SIMPLES, descontoSimples, diasEntre, impostoDentroFora, jurosSimples, margemDoPreco, payback, pontoEquilibrio, precoPorMarkup,
  resolverTvm, RETENCOES_PADRAO, retencoesNaFonte, simplesNacional, tabelaAmortizacao, tabelaDepreciacao, taxaEfetiva, taxaEquivalente, taxaReal, tir, vpl,
  type FaixaSimples, type IncognitaTvm, type MetodoDepreciacao, type Momento, type Periodo, type Sistema, type Tvm,
} from '../financeiro';
import { dataDaApi, dataParaApi, decimalParaApi, hojeIso, normalizarData, numero, percentual } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CampoData } from './comum/CampoData';
import { CampoDinheiro } from './comum/CampoDinheiro';
import { Selecao } from './comum/Selecao';

// ───────────── Entrada e saída no padrão brasileiro ─────────────

/** Número digitado ("1.234,56", "1,5%", "-200") ou NaN. */
const num = (texto: string): number => {
  const d = decimalParaApi(texto.replace('%', '').replace(/R\$\s?/, ''));
  return d !== null && /^-?\d+(\.\d+)?$/.test(d) ? Number(d) : NaN;
};
/** Percentual digitado ("1,5") como fração (0,015). */
const pct = (texto: string): number => num(texto) / 100;
const valido = (...v: number[]) => v.every((x) => Number.isFinite(x));

const reais = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : `${v < 0 ? '-' : ''}R$ ${numero(Math.abs(v), 2)}`;
const taxa = (v: number | null | undefined, casas = 4): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '' : `${numero(v * 100, casas)}%`;
const qtd = (v: number | null | undefined, casas = 2): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : numero(v, casas));

type Aba = 'juros' | 'financiamento' | 'taxas' | 'fluxo' | 'contabil' | 'fiscal' | 'datas';
const ABAS: [Aba, ReactNode][] = [
  ['juros', <><u>J</u>uros</>],
  ['financiamento', <>Fi<u>n</u>anciamento</>],
  ['taxas', <><u>T</u>axas</>],
  ['fluxo', <>Fluxo de <u>c</u>aixa</>],
  ['contabil', <>C<u>o</u>ntábil</>],
  ['fiscal', <>F<u>i</u>scal</>],
  ['datas', <><u>D</u>atas</>],
];

/**
 * Calculadora financeira: matemática financeira, contábil e fiscal numa janela de abas. Os resultados se refazem a
 * cada digitação; campos de dinheiro aceitam conta com "=" e campos de data, conta de datas. Só para conferência.
 */
export function CalculadoraFinanceiraWindow() {
  const win = useWindow();
  const [aba, setAba] = useState<Aba>('juros');
  const fid = (k: string) => `${win.windowId}-${k}`;
  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo">
        <div className="rp-tabs" role="tablist" aria-label="Cálculos">
          {ABAS.map(([a, rotulo]) => (
            <div key={a} className="rp-tab" role="tab" tabIndex={aba === a ? 0 : -1} aria-selected={aba === a}
              onClick={() => setAba(a)} onKeyDown={(e) => e.key === 'Enter' && setAba(a)}>
              {rotulo}
            </div>
          ))}
        </div>
        <div className="rp-tabpanel rp-calc-fin" role="tabpanel">
          {aba === 'juros' && <AbaJuros fid={fid} />}
          {aba === 'financiamento' && <AbaFinanciamento fid={fid} />}
          {aba === 'taxas' && <AbaTaxas fid={fid} />}
          {aba === 'fluxo' && <AbaFluxo fid={fid} />}
          {aba === 'contabil' && <AbaContabil fid={fid} />}
          {aba === 'fiscal' && <AbaFiscal fid={fid} />}
          {aba === 'datas' && <AbaDatas fid={fid} />}
        </div>
        <p className="rp-tip rp-janela-mdi__nota" role="note">
          Valores para conferência. Campos de valor aceitam conta com "=" (=1.500*3); taxas em % por período.
        </p>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={win.requestClose}>Fechar</button>
        </div>
      </div>
    </>
  );
}

type PropsAba = { fid: (k: string) => string };

// ───────────── Peças de formulário ─────────────

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="rp-grupo rp-calc-fin__grupo">
      <legend>{titulo}</legend>
      <div className="rp-form rp-calc-fin__form">{children}</div>
    </fieldset>
  );
}

function Valor({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <>
      <label className="rp-label" htmlFor={id}>{rotulo}</label>
      <CampoDinheiro id={id} className="rp-field rp-field--num" value={valor} maxLength={20} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}

function Numero({ id, rotulo, valor, onChange, sufixo }: { id: string; rotulo: string; valor: string; onChange: (v: string) => void; sufixo?: string }) {
  return (
    <>
      <label className="rp-label" htmlFor={id}>{rotulo}{sufixo ? ` (${sufixo})` : ''}</label>
      <input id={id} className="rp-field rp-field--num" inputMode="decimal" maxLength={20} value={valor} onChange={(e) => onChange(e.target.value)} />
    </>
  );
}

function Resultado({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <>
      <span className="rp-label">{destaque ? <b>{rotulo}</b> : rotulo}</span>
      <input className={`rp-field rp-field--readonly rp-field--num${destaque ? ' rp-calc-fin__destaque' : ''}`} readOnly aria-label={rotulo} value={valor} />
    </>
  );
}

function Escolha<T extends string>({ id, rotulo, valor, opcoes, onChange }: { id: string; rotulo: string; valor: T; opcoes: [T, string][]; onChange: (v: T) => void }) {
  return (
    <>
      <label className="rp-label" htmlFor={id}>{rotulo}</label>
      <Selecao id={id} valor={valor} opcoes={opcoes.map(([v, r]) => ({ valor: v, rotulo: r }))} onChange={(v) => onChange(v as T)} />
    </>
  );
}

const OPCOES_PERIODO: [Periodo, string][] = [['dia', 'Dia'], ['mes', 'Mês'], ['bimestre', 'Bimestre'], ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['ano', 'Ano']];

// ───────────── Juros ─────────────

const CAMPOS_TVM: [IncognitaTvm, string, string][] = [
  ['n', 'n — Nº de períodos', ''],
  ['i', 'i — Taxa por período', '%'],
  ['pv', 'PV — Valor presente', 'R$'],
  ['pmt', 'PMT — Prestação', 'R$'],
  ['fv', 'FV — Valor futuro', 'R$'],
];

function AbaJuros({ fid }: PropsAba) {
  const [t, setT] = useState<Record<IncognitaTvm, string>>({ n: '12', i: '1,5', pv: '-10.000,00', pmt: '', fv: '0,00' });
  const [incognita, setIncognita] = useState<IncognitaTvm>('pmt');
  const [momento, setMomento] = useState<Momento>('fim');
  const [js, setJs] = useState({ capital: '1.000,00', taxa: '2', prazo: '6' });

  const dados: Partial<Tvm> = {};
  for (const [k] of CAMPOS_TVM) if (k !== incognita) dados[k] = k === 'i' ? pct(t[k]) : num(t[k]);
  const completos = Object.values(dados).every((v) => Number.isFinite(v));
  const r = completos ? resolverTvm(dados as Tvm, incognita, momento) : null;
  const mostrar = (k: IncognitaTvm, v: number | null) => (v === null ? '' : k === 'i' ? taxa(v) : k === 'n' ? qtd(v, 4) : reais(v));
  const simples = valido(num(js.capital), pct(js.taxa), num(js.prazo)) ? jurosSimples(num(js.capital), pct(js.taxa), num(js.prazo)) : null;

  return (
    <div className="rp-calc-fin__colunas">
      <Grupo titulo="Juros compostos e séries (HP 12C)">
        <Escolha id={fid('tvm-inc')} rotulo="Calcular" valor={incognita} onChange={setIncognita}
          opcoes={CAMPOS_TVM.map(([k, rot]) => [k, rot.split(' — ')[1]])} />
        {CAMPOS_TVM.map(([k, rot, suf]) =>
          k === incognita ? (
            <Resultado key={k} rotulo={rot} valor={completos ? (r === null ? 'Sem solução' : mostrar(k, r)) : ''} destaque />
          ) : (
            <Numero key={k} id={fid(`tvm-${k}`)} rotulo={rot} sufixo={suf || undefined} valor={t[k]} onChange={(v) => setT({ ...t, [k]: v })} />
          ),
        )}
        <Escolha id={fid('tvm-mom')} rotulo="Pagamento" valor={momento} onChange={setMomento} opcoes={[['fim', 'No fim do período (END)'], ['inicio', 'No início (BEGIN)']]} />
      </Grupo>
      <div>
        <Grupo titulo="Juros simples">
          <Valor id={fid('js-c')} rotulo="Capital" valor={js.capital} onChange={(v) => setJs({ ...js, capital: v })} />
          <Numero id={fid('js-t')} rotulo="Taxa por período" sufixo="%" valor={js.taxa} onChange={(v) => setJs({ ...js, taxa: v })} />
          <Numero id={fid('js-p')} rotulo="Prazo (períodos)" valor={js.prazo} onChange={(v) => setJs({ ...js, prazo: v })} />
          <Resultado rotulo="Juros" valor={reais(simples?.juros)} />
          <Resultado rotulo="Montante" valor={reais(simples?.montante)} destaque />
        </Grupo>
        <p className="rp-calc-fin__ajuda">
          Sinais como na HP 12C: o que entra no caixa é positivo e o que sai, negativo (empréstimo recebido: PV positivo e PMT negativo).
        </p>
      </div>
    </div>
  );
}

// ───────────── Financiamento ─────────────

function AbaFinanciamento({ fid }: PropsAba) {
  const [f, setF] = useState({ valor: '10.000,00', taxa: '2', n: '12' });
  const [sistema, setSistema] = useState<Sistema>('PRICE');
  const linhas = tabelaAmortizacao(num(f.valor), pct(f.taxa), num(f.n), sistema);
  const soma = (k: 'prestacao' | 'juros' | 'amortizacao') => linhas.reduce((s, l) => s + l[k], 0);
  return (
    <>
      <div className="rp-calc-fin__colunas">
        <Grupo titulo="Dados do financiamento">
          <Valor id={fid('fi-v')} rotulo="Valor financiado" valor={f.valor} onChange={(v) => setF({ ...f, valor: v })} />
          <Numero id={fid('fi-t')} rotulo="Taxa por período" sufixo="%" valor={f.taxa} onChange={(v) => setF({ ...f, taxa: v })} />
          <Numero id={fid('fi-n')} rotulo="Nº de parcelas" valor={f.n} onChange={(v) => setF({ ...f, n: v })} />
          <Escolha id={fid('fi-s')} rotulo="Sistema" valor={sistema} onChange={setSistema} opcoes={[['PRICE', 'Price (prestação fixa)'], ['SAC', 'SAC (amortização constante)']]} />
        </Grupo>
        <Grupo titulo="Totais">
          <Resultado rotulo="1ª prestação" valor={reais(linhas[0]?.prestacao)} destaque />
          <Resultado rotulo="Última prestação" valor={reais(linhas.at(-1)?.prestacao)} />
          <Resultado rotulo="Total pago" valor={linhas.length ? reais(soma('prestacao')) : ''} />
          <Resultado rotulo="Total de juros" valor={linhas.length ? reais(soma('juros')) : ''} />
        </Grupo>
      </div>
      <Tabela titulo="Tabela de amortização" colunas={['Parcela', 'Prestação', 'Juros', 'Amortização', 'Saldo devedor']}
        linhas={linhas.map((l) => [String(l.periodo), reais(l.prestacao), reais(l.juros), reais(l.amortizacao), reais(l.saldo)])}
        rodape={linhas.length ? ['Total', reais(soma('prestacao')), reais(soma('juros')), reais(soma('amortizacao')), ''] : undefined} />
    </>
  );
}

function Tabela({ titulo, colunas, linhas, rodape }: { titulo: string; colunas: string[]; linhas: string[][]; rodape?: string[] }) {
  return (
    <div className="rp-tabela rp-calc-fin__tabela">
      <div className="rp-tabela-acoes"><span className="rp-tabela-tit">{titulo}</span></div>
      <div className="rp-grid-rolagem rp-rolagem">
        <table className="rp-grid" aria-label={titulo}>
          <thead><tr>{colunas.map((c, i) => <th key={c} className={i ? 'num' : undefined}>{c}</th>)}</tr></thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr><td colSpan={colunas.length} className="rp-calc-fin__vazio">Preencha os dados para montar a tabela</td></tr>
            ) : linhas.map((l, k) => <tr key={k}>{l.map((c, i) => <td key={i} className={i ? 'num' : 'rownum'}>{c}</td>)}</tr>)}
          </tbody>
          {rodape && <tfoot><tr>{rodape.map((c, i) => <td key={i} className={i ? 'num' : undefined}>{c}</td>)}</tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

// ───────────── Taxas ─────────────

function AbaTaxas({ fid }: PropsAba) {
  const [eq, setEq] = useState<{ taxa: string; de: Periodo; para: Periodo }>({ taxa: '1', de: 'mes', para: 'ano' });
  const [ef, setEf] = useState({ nominal: '12', vezes: '12' });
  const [re, setRe] = useState({ nominal: '12', inflacao: '4,5' });
  const [de, setDe] = useState<{ nominal: string; taxa: string; prazo: string; tipo: 'comercial' | 'racional' }>({ nominal: '1.000,00', taxa: '2', prazo: '3', tipo: 'comercial' });
  const d = valido(num(de.nominal), pct(de.taxa), num(de.prazo)) ? descontoSimples(num(de.nominal), pct(de.taxa), num(de.prazo), de.tipo) : null;
  return (
    <div className="rp-calc-fin__colunas">
      <div>
        <Grupo titulo="Taxa equivalente (juros compostos)">
          <Numero id={fid('eq-t')} rotulo="Taxa" sufixo="%" valor={eq.taxa} onChange={(v) => setEq({ ...eq, taxa: v })} />
          <Escolha id={fid('eq-de')} rotulo="Ao" valor={eq.de} onChange={(v) => setEq({ ...eq, de: v })} opcoes={OPCOES_PERIODO} />
          <Escolha id={fid('eq-para')} rotulo="Equivalente ao" valor={eq.para} onChange={(v) => setEq({ ...eq, para: v })} opcoes={OPCOES_PERIODO} />
          <Resultado rotulo="Taxa equivalente" valor={valido(pct(eq.taxa)) ? taxa(taxaEquivalente(pct(eq.taxa), eq.de, eq.para)) : ''} destaque />
        </Grupo>
        <Grupo titulo="Taxa nominal para efetiva">
          <Numero id={fid('ef-n')} rotulo="Taxa nominal ao ano" sufixo="%" valor={ef.nominal} onChange={(v) => setEf({ ...ef, nominal: v })} />
          <Numero id={fid('ef-k')} rotulo="Capitalizações por ano" valor={ef.vezes} onChange={(v) => setEf({ ...ef, vezes: v })} />
          <Resultado rotulo="Taxa por capitalização" valor={valido(pct(ef.nominal), num(ef.vezes)) && num(ef.vezes) > 0 ? taxa(pct(ef.nominal) / num(ef.vezes)) : ''} />
          <Resultado rotulo="Taxa efetiva ao ano" valor={valido(pct(ef.nominal), num(ef.vezes)) ? taxa(taxaEfetiva(pct(ef.nominal), num(ef.vezes))) : ''} destaque />
        </Grupo>
      </div>
      <div>
        <Grupo titulo="Taxa real (descontada a inflação)">
          <Numero id={fid('re-n')} rotulo="Taxa nominal" sufixo="%" valor={re.nominal} onChange={(v) => setRe({ ...re, nominal: v })} />
          <Numero id={fid('re-i')} rotulo="Inflação do período" sufixo="%" valor={re.inflacao} onChange={(v) => setRe({ ...re, inflacao: v })} />
          <Resultado rotulo="Taxa real" valor={valido(pct(re.nominal), pct(re.inflacao)) ? taxa(taxaReal(pct(re.nominal), pct(re.inflacao))) : ''} destaque />
        </Grupo>
        <Grupo titulo="Desconto simples de título">
          <Valor id={fid('de-v')} rotulo="Valor nominal" valor={de.nominal} onChange={(v) => setDe({ ...de, nominal: v })} />
          <Numero id={fid('de-t')} rotulo="Taxa de desconto por período" sufixo="%" valor={de.taxa} onChange={(v) => setDe({ ...de, taxa: v })} />
          <Numero id={fid('de-p')} rotulo="Prazo (períodos)" valor={de.prazo} onChange={(v) => setDe({ ...de, prazo: v })} />
          <Escolha id={fid('de-k')} rotulo="Desconto" valor={de.tipo} onChange={(v) => setDe({ ...de, tipo: v })} opcoes={[['comercial', 'Comercial (por fora)'], ['racional', 'Racional (por dentro)']]} />
          <Resultado rotulo="Desconto" valor={reais(d?.desconto)} />
          <Resultado rotulo="Valor líquido" valor={reais(d?.liquido)} destaque />
          <Resultado rotulo="Taxa efetiva por período" valor={taxa(d?.taxaEfetiva)} />
        </Grupo>
      </div>
    </div>
  );
}

// ───────────── Fluxo de caixa ─────────────

function AbaFluxo({ fid }: PropsAba) {
  const [taxaDesc, setTaxaDesc] = useState('10');
  const [fluxos, setFluxos] = useState<string[]>(['-10.000,00', '3.000,00', '4.000,00', '5.000,00', '']);
  // Do período 0 até o último preenchido; um período em branco no meio vale zero.
  const numeros = fluxos.map(num);
  let ultimo = -1;
  numeros.forEach((v, k) => Number.isFinite(v) && (ultimo = k));
  const usados = numeros.slice(0, ultimo + 1).map((v) => (Number.isFinite(v) ? v : 0));
  const i = pct(taxaDesc);
  const pronto = usados.length >= 2 && Number.isFinite(i);
  const set = (k: number, v: string) => {
    const novo = fluxos.map((f, j) => (j === k ? v : f));
    if (k === novo.length - 1 && v.trim() && novo.length < 120) novo.push('');
    setFluxos(novo);
  };
  return (
    <div className="rp-calc-fin__colunas">
      <div className="rp-tabela rp-calc-fin__tabela">
        <div className="rp-tabela-acoes"><span className="rp-tabela-tit">Fluxos por período</span></div>
        <div className="rp-grid-rolagem rp-rolagem">
          <table className="rp-grid rp-grid--edicao" aria-label="Fluxos por período">
            <thead><tr><th className="rp-calc-fin__col-periodo">Período</th><th className="num">Valor (entrada +, saída −)</th></tr></thead>
            <tbody>
              {fluxos.map((f, k) => (
                <tr key={k}>
                  <td className="rownum">{k}</td>
                  <td><CampoDinheiro className="rp-field rp-field--num" aria-label={`Fluxo do período ${k}`} value={f} maxLength={20} onChange={(e) => set(k, e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Grupo titulo="Análise do investimento">
        <Numero id={fid('fc-t')} rotulo="TMA — taxa mínima" sufixo="%" valor={taxaDesc} onChange={setTaxaDesc} />
        <Resultado rotulo="VPL" valor={pronto ? reais(vpl(i, usados)) : ''} destaque />
        <Resultado rotulo="TIR por período" valor={pronto ? taxa(tir(usados)) || 'Sem TIR' : ''} destaque />
        <Resultado rotulo="Payback simples" valor={pronto ? (payback(usados) === null ? 'Não recupera' : `${qtd(payback(usados))} períodos`) : ''} />
        <Resultado rotulo="Payback descontado" valor={pronto ? (payback(usados, i) === null ? 'Não recupera' : `${qtd(payback(usados, i))} períodos`) : ''} />
        <Resultado rotulo="Índice de lucratividade" valor={pronto && usados[0] < 0 ? qtd((vpl(i, usados)! - usados[0]) / -usados[0], 4) : ''} />
      </Grupo>
    </div>
  );
}

// ───────────── Contábil ─────────────

function AbaContabil({ fid }: PropsAba) {
  const [dp, setDp] = useState<{ custo: string; residual: string; vida: string; metodo: MetodoDepreciacao }>({ custo: '50.000,00', residual: '5.000,00', vida: '5', metodo: 'linear' });
  const [mk, setMk] = useState({ custo: '100,00', despesas: '10', impostos: '8', margem: '15', preco: '' });
  const [pe, setPe] = useState({ fixos: '20.000,00', preco: '50,00', variavel: '30,00' });
  const linhas = tabelaDepreciacao(num(dp.custo), num(dp.residual) || 0, num(dp.vida), dp.metodo);
  const preco = valido(num(mk.custo), pct(mk.despesas), pct(mk.impostos), pct(mk.margem))
    ? precoPorMarkup(num(mk.custo), pct(mk.despesas), pct(mk.impostos), pct(mk.margem)) : null;
  const margemReal = valido(num(mk.preco), num(mk.custo), pct(mk.despesas), pct(mk.impostos)) ? margemDoPreco(num(mk.preco), num(mk.custo), pct(mk.despesas), pct(mk.impostos)) : null;
  const p = valido(num(pe.fixos), num(pe.preco), num(pe.variavel)) ? pontoEquilibrio(num(pe.fixos), num(pe.preco), num(pe.variavel)) : null;
  return (
    <>
      <div className="rp-calc-fin__colunas">
        <Grupo titulo="Formação de preço (markup)">
          <Valor id={fid('mk-c')} rotulo="Custo unitário" valor={mk.custo} onChange={(v) => setMk({ ...mk, custo: v })} />
          <Numero id={fid('mk-d')} rotulo="Despesas sobre o preço" sufixo="%" valor={mk.despesas} onChange={(v) => setMk({ ...mk, despesas: v })} />
          <Numero id={fid('mk-i')} rotulo="Impostos sobre o preço" sufixo="%" valor={mk.impostos} onChange={(v) => setMk({ ...mk, impostos: v })} />
          <Numero id={fid('mk-m')} rotulo="Margem desejada" sufixo="%" valor={mk.margem} onChange={(v) => setMk({ ...mk, margem: v })} />
          <Resultado rotulo="Markup multiplicador" valor={qtd(preco?.multiplicador, 4)} />
          <Resultado rotulo="Preço de venda" valor={preco ? reais(preco.preco) : 'Despesas, impostos e margem passam de 100%'} destaque />
          <Valor id={fid('mk-p')} rotulo="Preço praticado" valor={mk.preco} onChange={(v) => setMk({ ...mk, preco: v })} />
          <Resultado rotulo="Margem líquida no preço praticado" valor={taxa(margemReal, 2)} />
        </Grupo>
        <Grupo titulo="Ponto de equilíbrio">
          <Valor id={fid('pe-f')} rotulo="Custos e despesas fixos" valor={pe.fixos} onChange={(v) => setPe({ ...pe, fixos: v })} />
          <Valor id={fid('pe-p')} rotulo="Preço unitário" valor={pe.preco} onChange={(v) => setPe({ ...pe, preco: v })} />
          <Valor id={fid('pe-v')} rotulo="Custo variável unitário" valor={pe.variavel} onChange={(v) => setPe({ ...pe, variavel: v })} />
          <Resultado rotulo="Margem de contribuição" valor={reais(p?.margemContribuicao)} />
          <Resultado rotulo="Índice de margem" valor={taxa(p?.indice, 2)} />
          <Resultado rotulo="Ponto de equilíbrio (unidades)" valor={qtd(p?.quantidade)} destaque />
          <Resultado rotulo="Ponto de equilíbrio (receita)" valor={reais(p?.receita)} destaque />
        </Grupo>
      </div>
      <div className="rp-calc-fin__colunas">
        <Grupo titulo="Depreciação">
          <Valor id={fid('dp-c')} rotulo="Custo do bem" valor={dp.custo} onChange={(v) => setDp({ ...dp, custo: v })} />
          <Valor id={fid('dp-r')} rotulo="Valor residual" valor={dp.residual} onChange={(v) => setDp({ ...dp, residual: v })} />
          <Numero id={fid('dp-v')} rotulo="Vida útil (anos)" valor={dp.vida} onChange={(v) => setDp({ ...dp, vida: v })} />
          <Escolha id={fid('dp-m')} rotulo="Método" valor={dp.metodo} onChange={(v) => setDp({ ...dp, metodo: v })}
            opcoes={[['linear', 'Linear (quotas constantes)'], ['digitos', 'Soma dos dígitos dos anos'], ['decrescente', 'Saldo decrescente (taxa dupla)']]} />
          <Resultado rotulo="Taxa anual linear" valor={valido(num(dp.vida)) && num(dp.vida) > 0 ? taxa(1 / num(dp.vida), 2) : ''} />
        </Grupo>
        <Tabela titulo="Quotas de depreciação" colunas={['Ano', 'Depreciação', 'Acumulada', 'Valor contábil']}
          linhas={linhas.map((l) => [String(l.ano), reais(l.depreciacao), reais(l.acumulada), reais(l.contabil)])} />
      </div>
    </>
  );
}

// ───────────── Fiscal ─────────────

type FonteSimples = 'empresa-PRODUTO' | 'empresa-SERVICO' | keyof typeof ANEXOS_SIMPLES;
type TributoRetido = keyof typeof RETENCOES_PADRAO;
const NOMES_RETENCAO: [TributoRetido, string][] = [['irrf', 'IRRF'], ['pis', 'PIS'], ['cofins', 'COFINS'], ['csll', 'CSLL'], ['inss', 'INSS'], ['iss', 'ISS']];
const porcento = (fracao: number) => numero(fracao * 100, fracao * 100 % 1 ? 2 : 0);

function AbaFiscal({ fid }: PropsAba) {
  const { can } = useSession();
  const [param, setParam] = useState<TaxParameters | null>(null);
  const [sn, setSn] = useState<{ fonte: FonteSimples; rbt12: string; receita: string }>({ fonte: 'III', rbt12: '500.000,00', receita: '40.000,00' });
  const [df, setDf] = useState<{ valor: string; aliquota: string; modo: 'dentro' | 'fora' }>({ valor: '1.000,00', aliquota: '18', modo: 'dentro' });
  const [rt, setRt] = useState({ valor: '10.000,00', ...Object.fromEntries(NOMES_RETENCAO.map(([k]) => [k, porcento(RETENCOES_PADRAO[k])])) } as Record<'valor' | TributoRetido, string>);
  const [marcados, setMarcados] = useState<Record<TributoRetido, boolean>>({ irrf: true, pis: true, cofins: true, csll: true, inss: false, iss: false });

  // Parâmetros do Simples da empresa (Impostos gerenciais), quando o usuário pode lê-los: a revisão mais recente.
  useEffect(() => {
    if (!can('tax.read')) return;
    api.get<TaxParameters[]>('/api/v1/tax-parameters')
      .then((r) => setParam([...r.data].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.revision - a.revision)[0] ?? null))
      .catch(() => undefined);
  }, [can]);

  const tabela: FaixaSimples[] = sn.fonte.startsWith('empresa-')
    ? (param?.brackets[sn.fonte.slice(8) as 'PRODUTO' | 'SERVICO'] ?? []).map((b) => ({ ate: Number(b.upToCents) / 100, aliquota: Number(b.rate), deducao: Number(b.deductionCents) / 100 }))
    : ANEXOS_SIMPLES[sn.fonte].faixas;
  const s = valido(num(sn.rbt12), num(sn.receita)) ? simplesNacional(num(sn.rbt12), num(sn.receita), tabela) : null;
  const fontes: [FonteSimples, string][] = [
    ...(param ? ([['empresa-PRODUTO', `Parâmetros da empresa — produto (Anexo ${param.productAnnex})`], ['empresa-SERVICO', `Parâmetros da empresa — serviço (Anexo ${param.serviceAnnex})`]] as [FonteSimples, string][]) : []),
    ...Object.entries(ANEXOS_SIMPLES).map(([k, a]) => [k, a.nome] as [FonteSimples, string]),
  ];
  const d = valido(num(df.valor), pct(df.aliquota)) ? impostoDentroFora(num(df.valor), pct(df.aliquota), df.modo) : null;
  const aliquotas = Object.fromEntries(NOMES_RETENCAO.filter(([k]) => marcados[k] && valido(pct(rt[k]))).map(([k]) => [k, pct(rt[k])]));
  const r = valido(num(rt.valor)) ? retencoesNaFonte(num(rt.valor), aliquotas) : null;

  return (
    <div className="rp-calc-fin__colunas">
      <div>
        <Grupo titulo="Simples Nacional">
          <Escolha id={fid('sn-f')} rotulo="Tabela" valor={sn.fonte} onChange={(v) => setSn({ ...sn, fonte: v })} opcoes={fontes} />
          <Valor id={fid('sn-r')} rotulo="RBT12 (receita de 12 meses)" valor={sn.rbt12} onChange={(v) => setSn({ ...sn, rbt12: v })} />
          <Valor id={fid('sn-m')} rotulo="Receita do mês" valor={sn.receita} onChange={(v) => setSn({ ...sn, receita: v })} />
          <Resultado rotulo="Faixa" valor={s ? `${s.faixa}ª` : num(sn.rbt12) > 4800000 ? 'Acima do limite do Simples' : ''} />
          <Resultado rotulo="Alíquota nominal" valor={s ? percentual(String(s.aliquotaNominal)) : ''} />
          <Resultado rotulo="Parcela a deduzir" valor={reais(s?.deducao)} />
          <Resultado rotulo="Alíquota efetiva" valor={taxa(s?.aliquotaEfetiva)} destaque />
          <Resultado rotulo="Imposto do mês (DAS)" valor={reais(s?.imposto)} destaque />
        </Grupo>
        <Grupo titulo="Imposto por dentro e por fora">
          <Valor id={fid('df-v')} rotulo={df.modo === 'dentro' ? 'Valor líquido desejado' : 'Valor sem o imposto'} valor={df.valor} onChange={(v) => setDf({ ...df, valor: v })} />
          <Numero id={fid('df-a')} rotulo="Alíquota" sufixo="%" valor={df.aliquota} onChange={(v) => setDf({ ...df, aliquota: v })} />
          <Escolha id={fid('df-m')} rotulo="Cálculo" valor={df.modo} onChange={(v) => setDf({ ...df, modo: v })} opcoes={[['dentro', 'Por dentro (gross-up)'], ['fora', 'Por fora (somado ao valor)']]} />
          <Resultado rotulo="Imposto" valor={reais(d?.imposto)} />
          <Resultado rotulo="Valor com o imposto" valor={reais(d?.total)} destaque />
          <Resultado rotulo="Carga sobre o total" valor={d && d.total > 0 ? taxa(d.imposto / d.total, 2) : ''} />
        </Grupo>
      </div>
      <Grupo titulo="Retenções na nota de serviço">
        <Valor id={fid('rt-v')} rotulo="Valor da nota" valor={rt.valor} onChange={(v) => setRt({ ...rt, valor: v })} />
        {NOMES_RETENCAO.map(([k, nome]) => (
          <span key={k} className="rp-calc-fin__linha">
            <label className="rp-label rp-choice">
              <input type="checkbox" checked={marcados[k]} onChange={(e) => setMarcados({ ...marcados, [k]: e.target.checked })} /> {nome} (%)
            </label>
            <input className="rp-field rp-field--num" aria-label={`Alíquota de ${nome}`} inputMode="decimal" maxLength={10} disabled={!marcados[k]} value={rt[k]}
              onChange={(e) => setRt({ ...rt, [k]: e.target.value })} />
          </span>
        ))}
        {r?.linhas.map((l) => (
          <Resultado key={l.tributo} rotulo={`${l.tributo} retido`} valor={l.dispensada ? `${reais(l.valor)} — dispensado` : reais(l.valor)} />
        ))}
        <Resultado rotulo="Total retido" valor={reais(r?.totalRetido)} />
        <Resultado rotulo="Valor líquido a receber" valor={reais(r?.liquido)} destaque />
      </Grupo>
    </div>
  );
}

// ───────────── Datas ─────────────

function AbaDatas({ fid }: PropsAba) {
  const [de, setDe] = useState(dataDaApi(hojeIso()));
  const [ate, setAte] = useState('');
  const isoDe = dataParaApi(normalizarData(de));
  const isoAte = dataParaApi(normalizarData(ate));
  const okData = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const r = okData(isoDe) && okData(isoAte) ? diasEntre(isoDe!, isoAte!) : null;
  return (
    <div className="rp-calc-fin__colunas">
      <Grupo titulo="Prazo entre datas">
        <label className="rp-label" htmlFor={fid('dt-de')}>De</label>
        <CampoData id={fid('dt-de')} rotulo="data inicial" valor={de} onChange={setDe} className="rp-field rp-field--curto" />
        <label className="rp-label" htmlFor={fid('dt-ate')}>Até</label>
        <CampoData id={fid('dt-ate')} rotulo="data final" valor={ate} onChange={setAte} className="rp-field rp-field--curto" />
        <Resultado rotulo="Dias corridos" valor={r ? numero(r.corridos) : ''} destaque />
        <Resultado rotulo="Dias úteis" valor={r ? numero(r.uteis) : ''} destaque />
        <Resultado rotulo="Meses (comercial, 30 dias)" valor={r ? numero(r.corridos / 30, 2) : ''} />
      </Grupo>
      <p className="rp-calc-fin__ajuda">
        Conta de "De" (exclusive) até "Até" (inclusive). Dias úteis: segunda a sexta, fora os feriados nacionais. Nos campos de data
        vale a conta de datas, como =hoje+30du ou =19/05/2026+90dc.
      </p>
    </div>
  );
}

