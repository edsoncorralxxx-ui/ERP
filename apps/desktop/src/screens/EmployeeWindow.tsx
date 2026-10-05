import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { Employee } from '../api/types';
import { dataDaApi, dataParaApi } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { CADASTROS_ALTERADOS } from './CadastroListaWindow';
import { novaChave } from './comum/Cadastros';
import { DialogoConflito } from './comum/Dialogos';
import { Abas, Anexos, BarraEdicao, Campo, ConfirmaExclusao, HistoricoFicha, Linha, type Aba } from './comum/Ficha';
import { Selecao } from './comum/Selecao';

type TabId = 'geral' | 'doc' | 'hist';
const ABAS: Aba<TabId>[] = [{ id: 'geral', rotulo: 'Geral', tecla: 'G' }, { id: 'doc', rotulo: 'Documentos', tecla: 'u' }, { id: 'hist', rotulo: 'Histórico', tecla: 'H' }];
const DEPARTAMENTOS = ['Comercial', 'Engenharia', 'Produção', 'Instalação', 'Pós-venda', 'Financeiro', 'Compras', 'Qualidade', 'Administração'];

type Form = { code: string; name: string; department: string; jobTitle: string; costCenter: string; admissionDate: string; email: string; phone: string; ativo: boolean };
const vazio: Form = { code: '', name: '', department: '', jobTitle: '', costCenter: '', admissionDate: '', email: '', phone: '', ativo: true };
const toForm = (e: Employee): Form => ({
  code: e.code, name: e.name, department: e.department ?? '', jobTitle: e.jobTitle ?? '', costCenter: e.costCenter ?? '',
  admissionDate: dataDaApi(e.admissionDate), email: e.email ?? '', phone: e.phone ?? '', ativo: e.status === 'ATIVO',
});

/** Ficha do colaborador no desenho das fichas do mock: matrícula, nome, departamento, função, centro de custo e contato. */
export function EmployeeWindow({ recordKey }: { recordKey: string }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const { can } = useSession();
  const [reg, setReg] = useState<Employee | null>(null);
  const [etag, setEtag] = useState('');
  const [form, setForm] = useState<Form>(vazio);
  const [tab, setTab] = useState<TabId>('geral');
  const [editando, setEditando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [conflito, setConflito] = useState<string | null>(null);
  const [excluir, setExcluir] = useState(false);
  const chave = useRef(novaChave());
  const id = reg?.id ?? (recordKey.startsWith('novo-') ? null : recordKey);
  const adicao = reg === null && recordKey.startsWith('novo-');
  const podeEditar = can('employee.admin');
  const ro = !podeEditar || (!adicao && !editando);
  const original = useMemo(() => (reg ? toForm(reg) : vazio), [reg]);
  const alterado = JSON.stringify(form) !== JSON.stringify(original);
  useEffect(() => win.setDirty(alterado), [alterado, win]);
  useEffect(() => win.setTitle?.(`Colaborador — ${reg ? `${reg.code} ${reg.name}` : 'novo'}`), [reg, win]);

  const aplicar = (e: Employee, tag?: string) => {
    setReg(e);
    setEtag(tag ?? `"${e.version}"`);
    setForm(toForm(e));
    setErros({});
  };
  useEffect(() => {
    if (recordKey.startsWith('novo-')) return;
    api.get<Employee>(`/api/v1/employees/${recordKey}`).then((r) => aplicar(r.data, r.etag))
      .catch((e: ApiError) => winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code}) [${e.correlationId ?? '—'}]` }));
  }, [recordKey]);

  const falha = (e: unknown) => {
    const x = e as ApiError;
    if (x.isConflict) return setConflito(x.details.find((d) => d.field === 'version')?.message.replace('atual=', '') ?? '?');
    const map: Record<string, string> = {};
    x.details?.forEach((d) => d.field && (map[d.field] = d.message));
    setErros(map);
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message}${x.details?.[0] ? ` ${x.details[0].message}` : ''} (${x.code}) [${x.correlationId ?? '—'}]` });
  };

  const formRef = useRef(form);
  formRef.current = form;
  const gravar = useCallback(async (): Promise<boolean> => {
    const f = formRef.current;
    setGravando(true);
    try {
      const n = (s: string) => s.trim() || null;
      const body = { code: n(f.code), name: f.name.trim(), department: n(f.department), jobTitle: n(f.jobTitle), costCenter: n(f.costCenter),
        admissionDate: f.admissionDate ? dataParaApi(f.admissionDate) : null, email: n(f.email), phone: n(f.phone) };
      let r = reg
        ? await api.put<Employee>(`/api/v1/employees/${reg.id}`, body, etag)
        : await api.post<Employee>('/api/v1/employees', body, { 'Idempotency-Key': chave.current });
      const tag = () => r.etag ?? `"${r.data.version}"`;
      if (!f.ativo && r.data.status === 'ATIVO') r = await api.post<Employee>(`/api/v1/employees/${r.data.id}/deactivate`, { reason: 'Inativado na ficha' }, { 'If-Match': tag() });
      else if (f.ativo && r.data.status === 'INATIVO') r = await api.post<Employee>(`/api/v1/employees/${r.data.id}/reactivate`, undefined, { 'If-Match': tag() });
      const novo = !reg;
      aplicar(r.data, r.etag);
      setEditando(false);
      chave.current = novaChave();
      winRef.current.notify({ tone: 'sucesso', text: `Colaborador ${r.data.code} ${novo ? 'adicionado' : 'atualizado'} com sucesso` });
      window.dispatchEvent(new Event(CADASTROS_ALTERADOS));
      return true;
    } catch (e) {
      falha(e);
      return false;
    } finally {
      setGravando(false);
    }
  }, [reg, etag]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelar = () => (setForm(original), setErros({}), setEditando(false));
  const podeGravar = alterado && !gravando && podeEditar && (adicao || editando);
  const editar = useMemo(() => (reg && podeEditar ? () => (editando ? cancelar() : setEditando(true)) : undefined), [reg, podeEditar, editando]); // eslint-disable-line react-hooks/exhaustive-deps
  const excluirCmd = useMemo(() => (reg && podeEditar && reg.status === 'ATIVO' ? () => setExcluir(true) : undefined), [reg, podeEditar]);
  useEffect(() => win.registerCommands({ save: podeGravar ? gravar : undefined, editar, excluir: excluirCmd }), [podeGravar, gravar, editar, excluirCmd, win]);

  const set = (p: Partial<Form>) => !ro && setForm((f) => ({ ...f, ...p }));
  const fid = (k: string) => `${win.windowId}-${k}`;
  const txt = (k: keyof Form, rotulo: string, largura: number | string = '100%', max = 120, req = false) => (
    <Linha id={fid(k)} rotulo={rotulo} req={req} erro={erros[k]}>
      <Campo id={fid(k)} valor={String(form[k])} largura={largura} max={max} erro={erros[k]} onChange={ro ? undefined : (v) => set({ [k]: v } as Partial<Form>)} />
    </Linha>
  );
  const registro = reg ? `o colaborador ${reg.code}` : 'o colaborador novo';

  return (
    <>
      {editando && reg && <BarraEdicao registro={registro} gravando={gravando} onCancelar={cancelar} onSalvar={() => void gravar()} onExcluir={excluirCmd} rotuloExcluir="Inativar" />}
      <div className={`rp-window-body rp-janela-mdi__corpo rp-ficha${ro && !adicao ? ' rp-ficha--consulta' : ''}${editando ? ' rp-ficha--editando' : ''}`}>
        <div className="rp-ficha__cab">
          <div className="rp-ficha__coluna">
            <Linha id={fid('code')} rotulo="Matrícula" req erro={erros.code}>
              <Campo id={fid('code')} valor={form.code} largura={110} max={20} ro={!adicao} erro={erros.code} onChange={adicao ? (v) => set({ code: v.toUpperCase() }) : undefined} />
            </Linha>
            {txt('name', 'Nome', '100%', 120, true)}
            <Linha id={fid('department')} rotulo="Departamento">
              <Selecao id={fid('department')} valor={form.department} onChange={(v) => set({ department: v })} disabled={!podeEditar} largura="100%"
                opcoes={[{ valor: '', rotulo: '' }, ...[...DEPARTAMENTOS, ...(form.department && !DEPARTAMENTOS.includes(form.department) ? [form.department] : [])].map((d) => ({ valor: d, rotulo: d }))]} />
            </Linha>
          </div>
          <div className="rp-ficha__coluna" />
        </div>
        <Abas abas={ABAS.map((a) => (a.id !== 'geral' && !id ? { ...a, desabilitada: true } : a))} atual={tab} onTroca={setTab} rotulo="Abas da ficha do colaborador" />
        <div role="tabpanel" className="rp-ficha__painel rp-rolagem">
          {tab === 'geral' && (
            <div className="rp-ficha__duas">
              <div className="rp-ficha__coluna">
                {txt('jobTitle', 'Função', '100%', 100)}
                {txt('costCenter', 'Centro de custo', 180, 60)}
                {txt('admissionDate', 'Admissão', 110, 10)}
              </div>
              <div className="rp-ficha__coluna">
                {txt('email', 'E-mail', '100%', 200)}
                {txt('phone', 'Telefone', 180, 30)}
                <fieldset className="rp-ficha-situacao">
                  <legend>Situação</legend>
                  <label htmlFor={fid('ativo')}><input id={fid('ativo')} type="radio" name={fid('sit')} checked={form.ativo} onChange={() => set({ ativo: true })} />Ativo</label>
                  <label htmlFor={fid('inativo')}><input id={fid('inativo')} type="radio" name={fid('sit')} checked={!form.ativo} onChange={() => set({ ativo: false })} />Inativo</label>
                </fieldset>
              </div>
            </div>
          )}
          {tab === 'doc' && <Anexos dono="employee" donoId={id} ro={!can('attachment.update')} />}
          {tab === 'hist' && <HistoricoFicha caminho={id ? `/api/v1/employees/${id}/history` : null} />}
        </div>
      </div>
      <div className="rp-window-foot rp-ficha-foot">
        <div>
          <button type="button" className="rp-btn rp-btn--default" disabled={gravando} onClick={() => (podeGravar ? void gravar() : win.requestClose())}>
            {adicao ? 'Adicionar' : alterado ? 'Atualizar' : 'OK'}
          </button>
          <button type="button" className="rp-btn" onClick={() => win.requestClose()}>Cancelar</button>
        </div>
      </div>
      {conflito !== null && (
        <DialogoConflito rotulo="Colaborador alterado por outra pessoa" objeto={registro} versao={conflito}
          onRecarregar={() => { setConflito(null); if (id) api.get<Employee>(`/api/v1/employees/${id}`).then((r) => aplicar(r.data, r.etag)); }} onContinuar={() => setConflito(null)} />
      )}
      {excluir && reg && (
        <ConfirmaExclusao registro={registro} rotulo="Inativar" texto="O colaborador fica inativo e sai das listas de responsáveis; o histórico continua guardado."
          onSim={() => { setExcluir(false); set({ ativo: false }); setTimeout(() => void gravar(), 0); }} onNao={() => setExcluir(false)} />
      )}
    </>
  );
}
