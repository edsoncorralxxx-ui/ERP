import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { ItemFiscalProfile, TaxSetup } from '../api/types';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { DialogoConflito } from './comum/Dialogos';
import { tratarFalha } from './comum/Falhas';
import { ANEXO, CLASSIFICACAO, IMPOSTOS_ALTERADOS, avisarFiscal, baixarCsv, seloClassificacao, seta } from './comum/Fiscal';
import { LinhaResto } from './comum/LinhaResto';
import { Selecao } from './comum/Selecao';

type Aba = 'prod' | 'serv';

export const ORIGEM: Record<string, string> = {
  '0': '0 — Nacional',
  '1': '1 — Estrangeira, importação direta',
  '2': '2 — Estrangeira, adquirida no mercado interno',
  '3': '3 — Nacional, mais de 40% de conteúdo estrangeiro',
  '4': '4 — Nacional, processo produtivo básico',
  '5': '5 — Nacional, até 40% de conteúdo estrangeiro',
  '6': '6 — Estrangeira, importação direta sem similar',
  '7': '7 — Estrangeira, mercado interno sem similar',
  '8': '8 — Nacional, mais de 70% de conteúdo estrangeiro',
};
export const CSOSN: Record<string, string> = {
  '101': '101 — Tributada com permissão de crédito',
  '102': '102 — Tributada sem permissão de crédito',
  '103': '103 — Isenção por faixa de receita',
  '201': '201 — Com crédito e ICMS por substituição',
  '202': '202 — Sem crédito e ICMS por substituição',
  '203': '203 — Isenção por faixa e ICMS por substituição',
  '300': '300 — Imune',
  '400': '400 — Não tributada',
  '500': '500 — ICMS cobrado antes por substituição',
  '900': '900 — Outros',
};
export const RETENCAO_ISS: Record<string, string> = { NAO: 'Não', SIM: 'Sim', CONFORME_MUNICIPIO: 'Conforme o município' };

const SITUACOES = [{ valor: '', rotulo: 'Todas' }, ...Object.entries(CLASSIFICACAO).map(([valor, rotulo]) => ({ valor, rotulo }))];
const ANEXOS_FILTRO = [{ valor: '', rotulo: 'Todos' }, { valor: 'I', rotulo: 'Anexo I' }, { valor: 'II', rotulo: 'Anexo II' }, { valor: 'III', rotulo: 'Anexo III' }];
const vazio = (s: string | null | undefined) => s ?? '';
const ncmFormatado = (n: string | null) => (n && n.length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : vazio(n));
const cfop = (c: string | null) => (c && c.length === 4 ? `${c[0]}.${c.slice(1)}` : vazio(c));

type Form = { ncm: string; serviceCode: string; cfopInternal: string; cfopInterstate: string; csosn: string; origin: string; annex: string; activityId: string; nbs: string; issRetention: string; review: boolean; reviewNote: string };
const formDe = (i: ItemFiscalProfile): Form => ({
  ncm: ncmFormatado(i.ncm), serviceCode: vazio(i.serviceCode), cfopInternal: cfop(i.cfopInternal), cfopInterstate: cfop(i.cfopInterstate),
  csosn: vazio(i.csosn), origin: vazio(i.origin), annex: vazio(i.annex), activityId: vazio(i.activityId), nbs: vazio(i.nbs),
  issRetention: vazio(i.issRetention), review: i.review, reviewNote: vazio(i.reviewNote),
});

/**
 * Classificação fiscal de itens (mock "Classificação fiscal de itens", Sprint 12): produtos e materiais (NCM, CFOP,
 * CSOSN, origem, anexo) e serviços (item da LC 116, NBS, anexo, retenção de ISS), com a situação calculada e o que falta.
 * O anexo da classificação vai para as linhas das notas registradas depois; NCM e item da LC 116 ficam no cadastro do item.
 */
export function FiscalClassificationWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [itens, setItens] = useState<ItemFiscalProfile[] | null>(null);
  const [setup, setSetup] = useState<TaxSetup | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>(recordKey === 'serv' ? 'serv' : 'prod');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [anexo, setAnexo] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (recordKey === 'serv' || recordKey === 'prod') setAba(recordKey);
  }, [recordKey]);

  const carregar = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([api.get<ItemFiscalProfile[]>('/api/v1/fiscal-classification'), api.get<TaxSetup>('/api/v1/tax-setup')]);
      setItens(l.data);
      setSetup(s.data);
      setErro(null);
    } catch (e) {
      const x = e as ApiError;
      setErro(x.isNetwork ? 'Sem conexão com o servidor. Tente de novo quando a conexão voltar.' : `${x.message} (${x.code})`);
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);
  useEffect(() => {
    const r = () => void carregar();
    window.addEventListener(IMPOSTOS_ALTERADOS, r);
    return () => window.removeEventListener(IMPOSTOS_ALTERADOS, r);
  }, [carregar]);

  const daAba = useMemo(() => (itens ?? []).filter((i) => (aba === 'serv') === (i.nature === 'SERVICO')), [itens, aba]);
  const linhas = useMemo(() => daAba.filter((i) => {
    if (situacao && i.status !== situacao) return false;
    if (anexo && i.annex !== anexo) return false;
    const t = busca.trim().toLowerCase();
    return !t || `${i.code} ${i.description} ${i.ncm ?? ''} ${ncmFormatado(i.ncm)} ${i.serviceCode ?? ''}`.toLowerCase().includes(t);
  }), [daAba, situacao, anexo, busca]);
  const atual = linhas.find((i) => i.itemId === sel) ?? linhas.find((i) => i.status !== 'CLASSIFICADO') ?? linhas[0] ?? null;
  const pendencias = daAba.filter((i) => i.status !== 'CLASSIFICADO').length;

  useEffect(() => {
    setForm(atual ? formDe(atual) : null);
    setErros({});
  }, [atual?.itemId, atual?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const servico = aba === 'serv';
  const alterado = !!(atual && form && JSON.stringify(form) !== JSON.stringify(formDe(atual)));
  useEffect(() => win.setDirty(alterado), [alterado, win]);

  const gravar = async () => {
    if (!atual || !form) return;
    setOcupado(true);
    try {
      const body = servico
        ? { serviceCode: form.serviceCode, annex: form.annex || null, activityId: form.activityId || null, nbs: form.nbs || null,
            issRetention: form.issRetention || null, review: form.review, reviewNote: form.reviewNote || null }
        : { ncm: form.ncm, cfopInternal: form.cfopInternal || null, cfopInterstate: form.cfopInterstate || null, csosn: form.csosn || null,
            origin: form.origin || null, annex: form.annex || null, activityId: form.activityId || null, review: form.review, reviewNote: form.reviewNote || null };
      const r = await api.put<ItemFiscalProfile>(`/api/v1/fiscal-classification/${atual.itemId}`, body, `"${atual.version}"`);
      setItens((l) => (l ?? []).map((i) => (i.itemId === r.data.itemId ? r.data : i)));
      setErros({});
      winRef.current.notify({ tone: 'sucesso', text: `Classificação fiscal do item ${r.data.code} gravada com sucesso: ${CLASSIFICACAO[r.data.status].toLowerCase()}` });
      avisarFiscal();
    } catch (e) {
      tratarFalha(e, { objeto: 'A classificação do item', notify: winRef.current.notify, setErros, setConflito });
    } finally {
      setOcupado(false);
    }
  };

  const exportar = () => {
    const cab = servico
      ? ['Código', 'Descrição', 'Item LC 116', 'NBS', 'Anexo', 'Retenção de ISS', 'Situação']
      : ['Código', 'Descrição', 'Tipo', 'NCM', 'CFOP interno', 'CFOP interestadual', 'CSOSN', 'Origem', 'Anexo', 'Situação'];
    baixarCsv(servico ? 'classificacao-servicos.csv' : 'classificacao-produtos.csv', cab, linhas.map((i) => servico
      ? [i.code, i.description, vazio(i.serviceCode), vazio(i.nbs), vazio(i.annex), RETENCAO_ISS[i.issRetention ?? ''] ?? '', CLASSIFICACAO[i.status]]
      : [i.code, i.description, i.type === 'MATERIAL' ? 'Material' : 'Produto', ncmFormatado(i.ncm), cfop(i.cfopInternal), cfop(i.cfopInterstate),
          vazio(i.csosn), vazio(i.origin), vazio(i.annex), CLASSIFICACAO[i.status]]));
  };

  const abrirItem = () => atual && win.open('item', atual.itemId);
  const podeGravar = !!atual && !!form && alterado && !ocupado && can('tax_classification.update');

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (conflito) return;
    if (e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'p') setAba('prod');
      else if (k === 's') setAba('serv');
      else if (k === 'a') void carregar();
      else if (k === 'c') abrirItem();
      else if (k === 'e') exportar();
      else if (k === 'g' && podeGravar) void gravar();
      else return;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const fid = (k: string) => `${win.windowId}-${k}`;
  const erroDe = (k: string) => erros[k] && <span className="rp-campo-erro"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erros[k]}</span>;
  const set = (k: keyof Form, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const somenteLeitura = !can('tax_classification.update');
  const campo = (k: keyof Form, rotulo: string, max: number, ph?: string) => (
    <>
      <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
      <span>
        <input id={fid(k)} className={`rp-field${somenteLeitura ? ' rp-field--readonly' : ''}`} readOnly={somenteLeitura} maxLength={max} placeholder={ph}
          value={String(form?.[k] ?? '')} aria-invalid={!!erros[k]} onChange={(e) => set(k, e.target.value)} />
        {erroDe(k)}
      </span>
    </>
  );
  const escolha = (k: keyof Form, rotulo: string, opcoes: { valor: string; rotulo: string }[]) => (
    <>
      <label className="rp-label" htmlFor={fid(k)}>{rotulo}</label>
      <span>
        <Selecao id={fid(k)} className="rp-field" valor={String(form?.[k] ?? '')} disabled={somenteLeitura} opcoes={[{ valor: '', rotulo: '' }, ...opcoes]}
          onChange={(v) => set(k, v)} aria-label={rotulo} />
        {erroDe(k)}
      </span>
    </>
  );
  const atividades = (setup?.activities ?? []).filter((a) => a.status === 'ATIVO').map((a) => ({ valor: a.id, rotulo: `${a.name} (${a.annexLabel})` }));
  const anexosForm = (servico ? ['I', 'II', 'III', 'IV', 'V'] : ['I', 'II', 'III', 'IV', 'V', 'INSUMO']).map((a) => ({ valor: a, rotulo: ANEXO[a] }));

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-jlista rp-fiscal" onKeyDown={onKeyDown}>
        <div className="rp-filtros rp-jlista__filtros">
          <label>
            Localizar <input className="rp-field rp-jlista__busca" type="search" placeholder="Código, descrição, NCM ou item" maxLength={100} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          <label>
            Situação <Selecao className="rp-field" valor={situacao} opcoes={SITUACOES} onChange={setSituacao} aria-label="Situação" />
          </label>
          <label>
            Anexo <Selecao className="rp-field" valor={anexo} opcoes={ANEXOS_FILTRO} onChange={setAnexo} aria-label="Anexo" />
          </label>
          <button type="button" className="rp-btn" onClick={() => { setBusca(''); setSituacao(''); setAnexo(''); }}>Limpar</button>
          <div className="rp-filtros-dir">
            {situacao && <span className="rp-chip"><b>Situação:</b> {CLASSIFICACAO[situacao as keyof typeof CLASSIFICACAO]} <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de situação" onClick={() => setSituacao('')}>×</i></span>}
            {anexo && <span className="rp-chip"><b>Anexo:</b> {anexo} <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de anexo" onClick={() => setAnexo('')}>×</i></span>}
            {busca.trim() && <span className="rp-chip"><b>Texto:</b> {busca.trim()} <i className="x" role="button" tabIndex={0} title="Remover" aria-label="Remover o filtro de texto" onClick={() => setBusca('')}>×</i></span>}
          </div>
        </div>
        <div className="rp-tabs" role="tablist">
          {([['prod', <span><u>P</u>rodutos e materiais</span>], ['serv', <span><u>S</u>erviços</span>]] as const).map(([t, r]) => (
            <div key={t} className="rp-tab" role="tab" tabIndex={0} aria-selected={aba === t} onClick={() => setAba(t)} onKeyDown={(e) => e.key === 'Enter' && setAba(t)}>{r}</div>
          ))}
        </div>
        {erro ? (
          <p className="rp-janela-mdi__aviso"><i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}</p>
        ) : (
          <div className="rp-tabpanel rp-fiscal__lista-lado" role="tabpanel">
            <div className="rp-grid-rolagem rp-rolagem rp-jlista__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label={servico ? 'Serviços' : 'Produtos e materiais'}>
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th />
                    <th>Código</th>
                    <th>Descrição</th>
                    {servico ? (
                      <>
                        <th>Item LC 116</th>
                        <th>NBS</th>
                        <th>Anexo</th>
                        <th>Retenção de ISS</th>
                      </>
                    ) : (
                      <>
                        <th>NCM</th>
                        <th>CFOP</th>
                        <th>CSOSN</th>
                        <th>Anexo</th>
                      </>
                    )}
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((i, n) => (
                    <tr key={i.itemId} aria-selected={i.itemId === atual?.itemId} onClick={() => setSel(i.itemId)} onDoubleClick={() => win.open('item', i.itemId)}>
                      <td className="rownum">{n}</td>
                      <td>{seta(`Abrir cadastro do item ${i.code}`, () => win.open('item', i.itemId))}</td>
                      <td>{i.code}</td>
                      <td>{i.description}</td>
                      {servico ? (
                        <>
                          <td>{vazio(i.serviceCode) || '—'}</td>
                          <td>{vazio(i.nbs) || '—'}</td>
                          <td>{i.annex ?? '—'}</td>
                          <td>{RETENCAO_ISS[i.issRetention ?? ''] ?? '—'}</td>
                        </>
                      ) : (
                        <>
                          <td>{ncmFormatado(i.ncm) || '—'}</td>
                          <td>{i.cfopInternal ? `${cfop(i.cfopInternal)} / ${cfop(i.cfopInterstate)}` : '—'}</td>
                          <td>{i.csosn ?? '—'}</td>
                          <td>{i.annex === 'INSUMO' ? '—' : i.annex ?? '—'}</td>
                        </>
                      )}
                      <td>{seloClassificacao(i.status)}</td>
                    </tr>
                  ))}
                  <LinhaResto colunas={9} />
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} />
                    <td colSpan={7}>
                      {linhas.length} de {daAba.length} itens · {pendencias} {pendencias === 1 ? 'pendência' : 'pendências'} de classificação
                    </td>
                  </tr>
                </tfoot>
              </table>
              {itens !== null && linhas.length === 0 && <p className="rp-jlista__vazio">Nenhum item com os filtros aplicados.</p>}
            </div>
            <div className="rp-rolagem rp-fiscal__lado">
              {atual && form && (
                <fieldset className="rp-grupo">
                  <legend>{atual.code}</legend>
                  <div className="rp-grupo-corpo">
                    <b>{atual.description}</b>
                    <div className="rp-form rp-fiscal__ficha-item">
                      {servico ? (
                        <>
                          {campo('serviceCode', 'Item LC 116', 5, '14.01')}
                          {campo('nbs', 'NBS', 12, '1.2001.10.00')}
                          {escolha('activityId', 'Atividade', atividades)}
                          {escolha('annex', 'Anexo', anexosForm)}
                          {escolha('issRetention', 'Retenção de ISS', Object.entries(RETENCAO_ISS).map(([valor, rotulo]) => ({ valor, rotulo })))}
                        </>
                      ) : (
                        <>
                          {campo('ncm', 'NCM', 10, '0000.00.00')}
                          {campo('cfopInternal', 'CFOP interno', 5, '5.101')}
                          {campo('cfopInterstate', 'CFOP interestadual', 5, '6.101')}
                          {escolha('csosn', 'CSOSN', Object.entries(CSOSN).map(([valor, rotulo]) => ({ valor, rotulo })))}
                          {escolha('origin', 'Origem', Object.entries(ORIGEM).map(([valor, rotulo]) => ({ valor, rotulo })))}
                          {escolha('activityId', 'Atividade', atividades)}
                          {escolha('annex', 'Anexo', anexosForm)}
                        </>
                      )}
                      <span className="rp-label">Revisar</span>
                      <label className="rp-choice">
                        <input type="checkbox" checked={form.review} disabled={somenteLeitura} onChange={(e) => set('review', e.target.checked)} /> Marcar para revisar com a contabilidade
                      </label>
                      {form.review && campo('reviewNote', 'O que revisar', 500)}
                    </div>
                    <span>{seloClassificacao(atual.status)}</span>
                    {atual.reasons.length > 0 ? (
                      atual.reasons.map((r) => <div key={r} className="rp-status-msg rp-status-msg--aviso" role="status"><span>{r}</span></div>)
                    ) : (
                      <div className="rp-status-msg rp-status-msg--sucesso" role="status"><span>Classificação conferida.</span></div>
                    )}
                    {can('tax_classification.update') && (
                      <div className="rp-btn-row">
                        <button type="button" className="rp-btn rp-btn--default" disabled={!podeGravar} onClick={() => void gravar()}><span><u>G</u>ravar</span></button>
                        <button type="button" className="rp-btn" disabled={!alterado} onClick={() => setForm(formDe(atual))}>Descartar</button>
                      </div>
                    )}
                  </div>
                </fieldset>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="rp-lista-foot rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={() => void carregar()}><span><u>A</u>tualizar</span></button>
          <button type="button" className="rp-btn" disabled={!atual} onClick={abrirItem}><span>Abrir <u>c</u>adastro do item</span></button>
          <button type="button" className="rp-btn" onClick={win.requestClose}>Fechar</button>
        </div>
        <div className="rp-btn-row">
          <button type="button" className="rp-btn" onClick={exportar}><span><u>E</u>xportar para planilha</span></button>
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Classificação alterada" objeto="A classificação do item" versao={conflito}
          onRecarregar={() => {
            setConflito(null);
            void carregar();
          }}
          onContinuar={() => setConflito(null)} />
      )}
    </>
  );
}
