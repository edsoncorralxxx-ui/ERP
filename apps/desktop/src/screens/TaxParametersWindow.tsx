import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { DocumentLineKind, TaxBracket, TaxParameters } from '../api/types';
import { centavos, centavosParaApi, competenciaDaApi, competenciaParaApi, dataHora, percentual, percentualParaFracao, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { tratarFalha } from './comum/Falhas';
import { Selecao } from './comum/Selecao';
import { IMPOSTOS_ALTERADOS } from './TaxPeriodsWindow';

const TIPOS: [DocumentLineKind, string][] = [
  ['PRODUTO', 'Produto'],
  ['SERVICO', 'Serviço'],
];

/** Faixa em edição, como digitada: limite em reais, alíquota em percentual, parcela em reais. */
type FaixaEdicao = { ate: string; aliquota: string; deducao: string };
type Rascunho = { vigencia: string; anexoProduto: string; anexoServico: string; fonte: string; obs: string; faixas: Record<DocumentLineKind, FaixaEdicao[]> };

const paraEdicao = (b: TaxBracket): FaixaEdicao => ({
  ate: centavos(b.upToCents),
  aliquota: percentual(b.rate).replace('%', ''),
  deducao: centavos(b.deductionCents),
});

const rascunhoDe = (p: TaxParameters | undefined): Rascunho => ({
  vigencia: '',
  anexoProduto: p?.productAnnex ?? '',
  anexoServico: p?.serviceAnnex ?? '',
  fonte: '',
  obs: '',
  faixas: {
    PRODUTO: (p?.brackets.PRODUTO ?? []).map(paraEdicao),
    SERVICO: (p?.brackets.SERVICO ?? []).map(paraEdicao),
  },
});

/** Limite inferior de cada faixa: o superior da anterior mais um centavo. */
const inferior = (faixas: TaxBracket[], i: number) => (i === 0 ? '0' : (BigInt(faixas[i - 1].upToCents) + 1n).toString());

/**
 * Parâmetros fiscais do Simples Nacional (PD-013, respondida no planning da Sprint 7): as revisões, cada uma com a
 * vigência, o anexo de produto e de serviço e as faixas (limite do RBT12, alíquota nominal e parcela a deduzir). A
 * revisão gravada não muda; mudar as tabelas é adicionar uma revisão nova, com a vigência a partir da qual vale.
 */
export function TaxParametersWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [revisoes, setRevisoes] = useState<TaxParameters[] | null>(null);
  const [sel, setSel] = useState<string>('');
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);
  const chave = useRef(novaChave());
  const podeRevisar = can('tax_parameter.admin');

  const carregar = useCallback(async (manter?: string) => {
    try {
      const r = await api.get<TaxParameters[]>('/api/v1/tax-parameters');
      setRevisoes(r.data);
      setSel((s) => manter ?? (s || r.data[0]?.id || ''));
    } catch (e) {
      const x = e as ApiError;
      winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const atual = revisoes?.find((r) => r.id === sel);
  const edicao = rascunho !== null;
  useEffect(() => win.setDirty(edicao), [edicao, win]);

  const nova = useMemo(() => (podeRevisar ? () => setRascunho(rascunhoDe(revisoes?.[0])) : undefined), [podeRevisar, revisoes]);

  const gravar = useCallback(async (): Promise<boolean> => {
    if (!rascunho) return false;
    setGravando(true);
    const faixas = (k: DocumentLineKind) => rascunho.faixas[k].map((f) => ({
      upToCents: centavosParaApi(f.ate) ?? '', rate: percentualParaFracao(f.aliquota), deductionCents: centavosParaApi(f.deducao) ?? '0',
    }));
    try {
      const r = await api.post<TaxParameters>('/api/v1/tax-parameters', {
        validFrom: competenciaParaApi(rascunho.vigencia), productAnnex: rascunho.anexoProduto.trim(), serviceAnnex: rascunho.anexoServico.trim(),
        brackets: { PRODUTO: faixas('PRODUTO'), SERVICO: faixas('SERVICO') }, source: rascunho.fonte.trim(), notes: rascunho.obs.trim() || null,
      }, { 'Idempotency-Key': chave.current });
      chave.current = novaChave();
      setRascunho(null);
      setErros({});
      await carregar(r.data.id);
      winRef.current.notify({ tone: 'sucesso', text: `Revisão ${r.data.revision} dos parâmetros fiscais adicionada com sucesso (vigência ${competenciaDaApi(r.data.validFrom)})` });
      window.dispatchEvent(new Event(IMPOSTOS_ALTERADOS));
      return true;
    } catch (e) {
      if (!(e as ApiError).isNetwork) chave.current = novaChave();
      tratarFalha(e, { objeto: 'Os parâmetros', notify: winRef.current.notify, setErros, setConflito: () => undefined });
      return false;
    } finally {
      setGravando(false);
    }
  }, [rascunho, carregar]);

  useEffect(() => win.registerCommands({ novo: edicao ? undefined : nova, save: edicao && !gravando ? gravar : undefined }), [win, nova, edicao, gravando, gravar]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (edicao) setRascunho(null);
      else win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const setFaixa = (k: DocumentLineKind, i: number, patch: Partial<FaixaEdicao>) =>
    setRascunho((r) => r && { ...r, faixas: { ...r.faixas, [k]: r.faixas[k].map((f, j) => (j === i ? { ...f, ...patch } : f)) } });
  const leitura = (rotulo: string, valor: string) => (
    <>
      <span className="rp-label">{rotulo}</span>
      <input className="rp-field rp-field--readonly" readOnly aria-label={rotulo} value={valor} />
    </>
  );

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
          {edicao ? (
            <div className="rp-form rp-form--adicao rp-ficha__situacao" aria-label="Nova revisão">
              <label className="rp-label rp-label--req" htmlFor={fid('vigencia')}>Vigência a partir de</label>
              <input id={fid('vigencia')} className="rp-field rp-field--curto" placeholder="MM/AAAA" maxLength={7} value={rascunho.vigencia}
                aria-invalid={!!erros.validFrom} onChange={(e) => setRascunho({ ...rascunho, vigencia: e.target.value })} />
              {erroDe('validFrom')}
              <label className="rp-label rp-label--req" htmlFor={fid('anexop')}>Anexo do produto</label>
              <input id={fid('anexop')} className="rp-field rp-field--curto" maxLength={10} value={rascunho.anexoProduto} aria-invalid={!!erros.productAnnex}
                onChange={(e) => setRascunho({ ...rascunho, anexoProduto: e.target.value })} />
              {erroDe('productAnnex')}
              <label className="rp-label rp-label--req" htmlFor={fid('anexos')}>Anexo do serviço</label>
              <input id={fid('anexos')} className="rp-field rp-field--curto" maxLength={10} value={rascunho.anexoServico} aria-invalid={!!erros.serviceAnnex}
                onChange={(e) => setRascunho({ ...rascunho, anexoServico: e.target.value })} />
              {erroDe('serviceAnnex')}
              <label className="rp-label rp-label--req" htmlFor={fid('fonte')}>Fonte das tabelas</label>
              <input id={fid('fonte')} className="rp-field" maxLength={300} value={rascunho.fonte} aria-invalid={!!erros.source}
                onChange={(e) => setRascunho({ ...rascunho, fonte: e.target.value })} />
              {erroDe('source')}
              <label className="rp-label" htmlFor={fid('obs')}>Observações</label>
              <input id={fid('obs')} className="rp-field" maxLength={500} value={rascunho.obs} onChange={(e) => setRascunho({ ...rascunho, obs: e.target.value })} />
            </div>
          ) : (
            <div className="rp-form rp-ficha__situacao">
              <label className="rp-label" htmlFor={fid('revisao')}>Revisão</label>
              <Selecao id={fid('revisao')} className="rp-field" valor={sel} onChange={setSel}
                opcoes={(revisoes ?? []).map((r) => ({ valor: r.id, rotulo: `Revisão ${r.revision} — vigência ${competenciaDaApi(r.validFrom)}` }))} />
              {leitura('Regime', 'Simples Nacional')}
              {leitura('Anexos', atual ? `Produto ${atual.productAnnex}, serviço ${atual.serviceAnnex}` : '')}
              {leitura('Fonte', atual?.source ?? '')}
              {leitura('Registrada', atual ? `${dataHora(atual.createdAt)} por ${atual.createdBy}` : '')}
            </div>
          )}
        </div>
        {edicao && (
          <p className="rp-janela-mdi__aviso rp-ficha__nota">
            <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> A nova revisão vale a partir da vigência; as competências anteriores e as simulações já feitas continuam com a revisão que usaram.
          </p>
        )}
        <div className="rp-parametros__faixas">
          {TIPOS.map(([k, nome]) => {
            const faixas = atual?.brackets[k] ?? [];
            return (
              <fieldset key={k} className="rp-grupo">
                <legend>{nome} — Anexo {edicao ? (k === 'PRODUTO' ? rascunho.anexoProduto : rascunho.anexoServico) : k === 'PRODUTO' ? atual?.productAnnex : atual?.serviceAnnex}</legend>
              <table className="rp-grid rp-janela-mdi__grade" aria-label={`Faixas de ${nome.toLowerCase()}`}>
                <thead>
                  <tr>
                    <th className="rownum">Faixa</th>
                    <th className="num">RBT12 de</th>
                    <th className="num">Até</th>
                    <th className="num">Alíquota nominal (%)</th>
                    <th className="num">Parcela a deduzir</th>
                  </tr>
                </thead>
                <tbody>
                  {edicao
                    ? rascunho.faixas[k].map((f, i) => {
                        const campo = `brackets.${k}[${i}]`;
                        const erro = erros[`${campo}.upToCents`] ?? erros[`${campo}.rate`] ?? erros[`${campo}.deductionCents`] ?? erros[campo];
                        return (
                          <tr key={i}>
                            <td className="rownum">{i + 1}ª</td>
                            <td className="num">{i === 0 ? 'R$ 0,00' : erro ? <span className="rp-campo-erro">{erro}</span> : ''}</td>
                            <td><input className="rp-field rp-field--num rp-field--adicao" aria-label={`${nome}: limite da ${i + 1}ª faixa`} value={f.ate}
                              aria-invalid={!!erros[`${campo}.upToCents`]} onChange={(e) => setFaixa(k, i, { ate: e.target.value })} /></td>
                            <td><input className="rp-field rp-field--num rp-field--adicao" aria-label={`${nome}: alíquota da ${i + 1}ª faixa`} value={f.aliquota}
                              aria-invalid={!!erros[`${campo}.rate`]} onChange={(e) => setFaixa(k, i, { aliquota: e.target.value })} /></td>
                            <td><input className="rp-field rp-field--num rp-field--adicao" aria-label={`${nome}: parcela a deduzir da ${i + 1}ª faixa`} value={f.deducao}
                              aria-invalid={!!erros[`${campo}.deductionCents`]} onChange={(e) => setFaixa(k, i, { deducao: e.target.value })} /></td>
                          </tr>
                        );
                      })
                    : faixas.map((b, i) => (
                        <tr key={i}>
                          <td className="rownum">{i + 1}ª</td>
                          <td className="num">{reais(inferior(faixas, i))}</td>
                          <td className="num">{reais(b.upToCents)}</td>
                          <td className="num">{percentual(b.rate)}</td>
                          <td className="num">{reais(b.deductionCents)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              </fieldset>
            );
          })}
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {edicao ? (
            <>
              <button type="button" className="rp-btn rp-btn--default" disabled={gravando} onClick={() => void gravar()}>
                Adicionar
              </button>
              <button type="button" className="rp-btn" onClick={() => (setRascunho(null), setErros({}))}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
              OK
            </button>
          )}
        </div>
        <div className="rp-btn-row">
          {!edicao && nova && (
            <button type="button" className="rp-btn" onClick={nova}>
              Nova revisão
            </button>
          )}
        </div>
      </div>
    </>
  );
}
