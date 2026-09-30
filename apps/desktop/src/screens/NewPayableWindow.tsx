import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { Payable, SupplierSummary } from '../api/types';
import { centavos, centavosParaApi, competenciaDaApi, competenciaParaApi, dataDaApi, dataParaApi, hojeIso, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { novaChave } from './comum/Cadastros';
import { CampoData } from './comum/CampoData';
import { useCategorias } from './comum/Categorias';
import { Selecao } from './comum/Selecao';
import { PAGAR_ALTERADOS, seloPagar } from './PayablesWindow';
import { DialogoDividir } from './SalesOrderWindow';

type Parcela = { dueDate: string; amount: string };
type Form = {
  supplierId: string; category: string; competence: string; documentNumber: string; description: string; total: string; notes: string;
  installments: Parcela[];
};

const vazio = (): Form => ({
  supplierId: '', category: '', competence: competenciaDaApi(hojeIso()), documentNumber: '', description: '', total: '', notes: '',
  installments: [{ dueDate: '', amount: '' }],
});

/** Centavos do texto digitado, ou nulo quando não é valor. */
const emCentavos = (texto: string): bigint | null => {
  const c = centavosParaApi(texto);
  return c && /^\d+$/.test(c) ? BigInt(c) : null;
};

/**
 * Novo título a pagar (RegisterPayableTitle): beneficiário, categoria de despesa, competência, documento do fornecedor,
 * total e as parcelas (uma parcela = um título), com Dividir o total. Em modo de adição os campos ficam amarelo-claros;
 * depois de adicionar, a janela mostra os títulos gerados, cada um com a seta para a ficha. A mesma chave de
 * idempotência é reenviada até o servidor responder.
 */
export function NewPayableWindow() {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const categorias = useCategorias();
  const [fornecedores, setFornecedores] = useState<SupplierSummary[]>([]);
  const [form, setForm] = useState<Form>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, setGravando] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [gerados, setGerados] = useState<Payable[] | null>(null);
  const chave = useRef(novaChave());
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    api.get<SupplierSummary[]>('/api/v1/suppliers').then((r) => setFornecedores(r.data)).catch(() => undefined);
  }, []);

  const somenteLeitura = gerados !== null || !can('financial_title.create');
  const alterado = useMemo(() => !somenteLeitura && JSON.stringify(form) !== JSON.stringify(vazio()), [form, somenteLeitura]);
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const total = emCentavos(form.total) ?? 0n;
  const parcelado = form.installments.reduce((s, p) => s + (emCentavos(p.amount) ?? 0n), 0n);
  const diferenca = total - parcelado;

  const gravar = useCallback(async (): Promise<boolean> => {
    const f = formRef.current;
    setGravando(true);
    try {
      const r = await api.post<Payable[]>(
        '/api/v1/payables',
        {
          supplierId: f.supplierId || null,
          category: f.category || null,
          competence: competenciaParaApi(f.competence) || null,
          documentNumber: f.documentNumber.trim() || null,
          description: f.description.trim() || null,
          totalCents: centavosParaApi(f.total),
          installments: f.installments.map((p) => ({ dueDate: dataParaApi(p.dueDate), amountCents: centavosParaApi(p.amount) })),
          notes: f.notes.trim() || null,
        },
        { 'Idempotency-Key': chave.current },
      );
      chave.current = novaChave();
      setGerados(r.data);
      setErros({});
      const codigos = r.data.length === 1 ? `Título ${r.data[0].code} adicionado` : `Títulos ${r.data[0].code} a ${r.data[r.data.length - 1].code} adicionados`;
      winRef.current.notify({ tone: 'sucesso', text: `${codigos} com sucesso: ${reais(r.data.reduce((s, t) => s + BigInt(t.originalCents), 0n).toString())} a pagar` });
      window.dispatchEvent(new Event(PAGAR_ALTERADOS));
      return true;
    } catch (e) {
      const x = e as ApiError;
      if (x.isNetwork) {
        winRef.current.notify({ tone: 'aviso', text: `Sem conexão com o servidor; grave de novo para reenviar o mesmo título (${x.code})` });
      } else {
        chave.current = novaChave();
        const m: Record<string, string> = {};
        x.details.forEach((d) => d.field && (m[d.field] = d.message));
        setErros(Object.keys(m).length > 0 ? m : { geral: x.message });
        winRef.current.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
      }
      return false;
    } finally {
      setGravando(false);
    }
  }, []);

  const podeGravar = alterado && !gravando;
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined }), [podeGravar, gravar, win]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setParcela = (i: number, patch: Partial<Parcela>) => setForm((f) => ({ ...f, installments: f.installments.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const addParcela = () => setForm((f) => ({ ...f, installments: [...f.installments, { dueDate: '', amount: '' }] }));
  const remParcela = (i: number) => setForm((f) => ({ ...f, installments: f.installments.filter((_, j) => j !== i) }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (dividir) return;
    if (e.altKey && e.key.toLowerCase() === 'd' && !somenteLeitura && total > 0n) {
      e.preventDefault();
      setDividir(true);
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && podeGravar) {
      e.preventDefault();
      void gravar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) =>
    erros[k] && (
      <>
        <span />
        <span />
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}
        </span>
      </>
    );
  const classeCampo = `rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`;
  const emAdicao = !somenteLeitura;
  const opcoesFornecedores = fornecedores.map((f) => ({ valor: f.id, rotulo: `${f.code} — ${f.legalName}` }));
  const opcoesCategorias = categorias.filter((c) => c.direction === 'DESPESA' && c.status === 'ATIVO').map((c) => ({ valor: c.code, rotulo: c.name }));
  const erroParcelas = Object.entries(erros).filter(([k]) => k.startsWith('installments')).map(([k, v]) => {
    const m = /\[(\d+)\]/.exec(k);
    return m ? `Parcela ${Number(m[1]) + 1}: ${v}` : v;
  });
  const seta = (rotulo: string, fn: () => void) => (
    <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
  );

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
          <div className={`rp-form rp-form--req rp-ficha__principal${emAdicao ? ' rp-form--adicao' : ''}`}>
            <label className="rp-label" htmlFor={fid('beneficiario')}>Beneficiário</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <Selecao id={fid('beneficiario')} className={classeCampo} valor={form.supplierId} disabled={somenteLeitura} aria-invalid={!!erros.supplierId}
              onChange={(v) => set({ supplierId: v })} opcoes={[{ valor: '', rotulo: 'Escolha o fornecedor' }, ...opcoesFornecedores]} />
            {erroDe('supplierId')}
            <label className="rp-label" htmlFor={fid('categoria')}>Categoria</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <Selecao id={fid('categoria')} className={classeCampo} valor={form.category} disabled={somenteLeitura} aria-invalid={!!erros.category}
              onChange={(v) => set({ category: v })} opcoes={[{ valor: '', rotulo: 'Escolha a categoria de despesa' }, ...opcoesCategorias]} />
            {erroDe('category')}
            <label className="rp-label" htmlFor={fid('competencia')}>Competência</label>
            <span className="rp-req" aria-hidden="true">*</span>
            <input id={fid('competencia')} className={`${classeCampo} rp-field--curto`} value={form.competence} maxLength={7} placeholder="MM/AAAA" readOnly={somenteLeitura}
              aria-invalid={!!erros.competence} onChange={(e) => set({ competence: e.target.value })} />
            {erroDe('competence')}
            <label className="rp-label" htmlFor={fid('documento')}>Documento</label>
            <span />
            <input id={fid('documento')} className={classeCampo} value={form.documentNumber} maxLength={60} placeholder="Nota, fatura ou boleto do fornecedor" readOnly={somenteLeitura}
              onChange={(e) => set({ documentNumber: e.target.value })} />
            {erroDe('documentNumber')}
            <label className="rp-label" htmlFor={fid('descricao')}>Descrição</label>
            <span />
            <input id={fid('descricao')} className={classeCampo} value={form.description} maxLength={150} readOnly={somenteLeitura}
              onChange={(e) => set({ description: e.target.value })} />
            {erroDe('description')}
          </div>
          <div className={`rp-form rp-ficha__situacao${emAdicao ? ' rp-form--adicao' : ''}`}>
            <label className="rp-label rp-label--req" htmlFor={fid('total')}>Total</label>
            <input id={fid('total')} className={`${classeCampo} rp-field--num`} value={form.total} maxLength={20} inputMode="decimal" readOnly={somenteLeitura}
              aria-invalid={!!erros.totalCents} onChange={(e) => set({ total: e.target.value })}
              onBlur={() => {
                const c = emCentavos(form.total);
                if (c !== null) set({ total: centavos(c.toString()) });
              }} />
            {erros.totalCents && (
              <>
                <span />
                <span className="rp-campo-erro">
                  <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.totalCents}
                </span>
              </>
            )}
            <label className="rp-label" htmlFor={fid('obs')}>Observação</label>
            <input id={fid('obs')} className={classeCampo} value={form.notes} maxLength={500} readOnly={somenteLeitura} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>

        {gerados ? (
          <div className="rp-tabela">
            <div className="rp-tabela-acoes">
              <span className="rp-tabela-tit">Títulos gerados</span>
            </div>
            <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Títulos gerados">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th aria-label="Abrir" />
                    <th>Título</th>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th className="num">Valor</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {gerados.map((t, i) => (
                    <tr key={t.id} onDoubleClick={() => win.open('payable', t.id, gerados.map((g) => g.id))}>
                      <td className="rownum">{i + 1}</td>
                      <td>{seta(`Abrir título ${t.code}`, () => win.open('payable', t.id, gerados.map((g) => g.id)))}</td>
                      <td>{t.code}</td>
                      <td>{t.origin}</td>
                      <td>{dataDaApi(t.dueDate)}</td>
                      <td className="num">{reais(t.originalCents)}</td>
                      <td>{seloPagar(t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rp-tabela">
            <div className="rp-tabela-acoes">
              <span className="rp-tabela-tit">Parcelas a pagar</span>
              {!somenteLeitura && (
                <button type="button" className="rp-btn" onClick={() => setDividir(true)} disabled={total <= 0n}>
                  <span><u>D</u>ividir o total</span>
                </button>
              )}
            </div>
            <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
              <table className={`rp-grid rp-grid--edicao${emAdicao ? ' rp-form--adicao' : ''}`} aria-label="Parcelas do título">
                <thead>
                  <tr>
                    <th className="rp-ficha__col-num">#</th>
                    <th className="rp-parcelas__data">Vencimento</th>
                    <th className="num rp-linhas__valor">Valor</th>
                    <th className="rp-ficha__col-x" aria-label="Remover" />
                  </tr>
                </thead>
                <tbody>
                  {form.installments.map((p, i) => (
                    <tr key={i}>
                      <td className="rownum">{i + 1}</td>
                      <td>
                        <CampoData id={fid(`venc-${i}`)} rotulo={`vencimento da parcela ${i + 1}`} valor={p.dueDate} somenteLeitura={somenteLeitura}
                          invalido={!!erros[`installments[${i}].dueDate`]} onChange={(v) => setParcela(i, { dueDate: v })} />
                      </td>
                      <td>
                        <input className="rp-field rp-field--num" value={p.amount} maxLength={20} inputMode="decimal" readOnly={somenteLeitura}
                          aria-label={`Valor da parcela ${i + 1}`} aria-invalid={!!erros[`installments[${i}].amountCents`]}
                          onChange={(e) => setParcela(i, { amount: e.target.value })}
                          onBlur={() => {
                            const c = emCentavos(p.amount);
                            if (c !== null) setParcela(i, { amount: centavos(c.toString()) });
                          }} />
                      </td>
                      <td className="rp-linha-x" role={somenteLeitura ? undefined : 'button'} tabIndex={somenteLeitura ? -1 : 0} title="Remover parcela"
                        aria-label={`Remover parcela ${i + 1}`} onClick={() => !somenteLeitura && remParcela(i)} onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remParcela(i)}>
                        {somenteLeitura ? '' : '×'}
                      </td>
                    </tr>
                  ))}
                  {!somenteLeitura && (
                    <tr className="nova">
                      <td className="rownum">{form.installments.length + 1}</td>
                      <td colSpan={3} role="button" tabIndex={0} onClick={addParcela} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), addParcela())}>
                        Clique para adicionar uma parcela…
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Soma das parcelas</td>
                    <td className="num" aria-label="Soma das parcelas">{reais(parcelado.toString())}</td>
                    <td className={diferenca === 0n ? '' : 'rp-parcelas__diferenca'}>
                      {diferenca === 0n ? (
                        <><i className="rp-ico rp-ico-status-sucesso" aria-hidden="true" /> Confere com o total</>
                      ) : (
                        <><i className="rp-ico rp-ico-status-aviso" aria-hidden="true" /> Diferença de {reais(diferenca.toString())}</>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {erroParcelas.map((m) => (
              <p key={m} className="rp-campo-erro rp-ficha__erro">
                <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
              </p>
            ))}
          </div>
        )}
        {erros.geral && (
          <p className="rp-campo-erro rp-ficha__erro">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros.geral}
          </p>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {gerados ? (
            <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
              OK
            </button>
          ) : (
            <>
              <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}>
                Adicionar
              </button>
              <button type="button" className="rp-btn" onClick={win.requestClose}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
      {dividir && (
        <DialogoDividir
          total={total}
          inicio={hojeIso()}
          idBase={fid('dividir')}
          onCancelar={() => setDividir(false)}
          onDividir={(ps) => {
            setDividir(false);
            set({ installments: ps.map((p) => ({ dueDate: p.dueDate, amount: p.amount })) });
          }}
        />
      )}
    </>
  );
}
