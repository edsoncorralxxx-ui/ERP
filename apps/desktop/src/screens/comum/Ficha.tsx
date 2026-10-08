import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../api/client';
import type { HistoryEntry } from '../../api/types';
import { dataDaApi, dataHora, reais } from '../../format';
import { useWindow } from '../../windows/WindowContext';
import { Selecao } from './Selecao';
import { ROTULO_HISTORICO, ACAO_HISTORICO, valorHistorico } from './GradeHistorico';

/**
 * Peças das fichas no desenho do mock (Cadastros-Parceiro, Cadastros-Item, CRM-Oportunidade): a linha de campo com o
 * rótulo sublinhado pelo fio claro, a coluna do asterisco e o campo; os indicadores à direita do cabeçalho com a seta e
 * o botão de análise; as abas com a letra de atalho sublinhada; a barra amarela do modo de edição; as grades simples
 * das abas (endereços, atividades, documentos, histórico) e a confirmação de exclusão.
 */

/** Linha de campo: rótulo (com a seta de link opcional) · asterisco · campo. `largura` é a coluna do rótulo. */
export function Linha({ id, rotulo, seta, req, erro, largura = 136, children, alto }: {
  id?: string;
  rotulo: ReactNode;
  seta?: { titulo: string; abrir: () => void };
  req?: boolean;
  erro?: string;
  largura?: number;
  alto?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`rp-ficha-linha${alto ? ' rp-ficha-linha--alta' : ''}`} style={{ gridTemplateColumns: `${largura}px 14px minmax(0, 1fr)` }}>
        {id ? (
          <label htmlFor={id} className="rp-link-field rp-ficha-linha__rot">
            {seta && <Seta {...seta} />}
            {rotulo}
          </label>
        ) : (
          <span className="rp-link-field rp-ficha-linha__rot">
            {seta && <Seta {...seta} />}
            {rotulo}
          </span>
        )}
        {req ? <span className="rp-req" aria-hidden="true">*</span> : <span />}
        <div className="rp-ficha-linha__campo">{children}</div>
      </div>
      {erro && (
        <div className="rp-ficha-linha" style={{ gridTemplateColumns: `${largura}px 14px minmax(0, 1fr)` }}>
          <span />
          <span />
          <span id={id ? `${id}-erro` : undefined} className="rp-campo-erro">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </span>
        </div>
      )}
    </>
  );
}

/** Seta de link do design system (abre o registro ou a lista ligada ao valor). */
export function Seta({ titulo, abrir }: { titulo: string; abrir: () => void }) {
  return (
    <span className="rp-link" role="link" tabIndex={0} aria-label={titulo} title={titulo}
      onClick={(e) => (e.preventDefault(), e.stopPropagation(), abrir())}
      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), abrir())} />
  );
}

/**
 * Campo de texto da ficha. `largura` em px (ou 100%); `ro` é o campo só de leitura do design system (fundo azul). Sem
 * `onChange` (ficha em consulta), o campo fica branco como no mock e não aceita digitação.
 */
export function Campo({ id, valor, onChange, largura, ro, erro, num, max, placeholder, rotulo, tipo = 'text' }: {
  id: string;
  valor: string;
  onChange?: (v: string) => void;
  largura?: number | string;
  ro?: boolean;
  erro?: string;
  num?: boolean;
  max?: number;
  placeholder?: string;
  rotulo?: string;
  tipo?: string;
}) {
  const leitura = !!ro;
  return (
    <input id={id} type={tipo} aria-label={rotulo}
      className={`rp-field${leitura ? ' rp-field--readonly' : ''}${num ? ' rp-field--num' : ''}`}
      style={{ width: typeof largura === 'number' ? `${largura}px` : largura ?? '100%' }}
      value={valor} readOnly={leitura} maxLength={max} placeholder={placeholder}
      aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined}
      onChange={(e) => onChange?.(e.target.value)} data-consulta={!onChange || undefined} />
  );
}

/** Observações: a caixa amarela-clara do mock (componente Dica de campo). */
export function Observacoes({ id, valor, onChange, ro, linhas = 3, max = 2000 }: {
  id: string; valor: string; onChange?: (v: string) => void; ro?: boolean; linhas?: number; max?: number;
}) {
  return (
    <textarea id={id} className="rp-field rp-field--note rp-ficha-obs" rows={linhas} value={valor} maxLength={max}
      readOnly={ro} data-consulta={!onChange || undefined} onChange={(e) => onChange?.(e.target.value)} />
  );
}

/** Caixa de seleção com o rótulo à direita. */
export function Marca({ id, rotulo, marcado, onChange, ro }: { id: string; rotulo: ReactNode; marcado: boolean; onChange?: (v: boolean) => void; ro?: boolean }) {
  return (
    <label htmlFor={id} className="rp-ficha-marca">
      <input id={id} type="checkbox" checked={marcado} disabled={ro || !onChange} onChange={(e) => onChange?.(e.target.checked)} />
      {rotulo}
    </label>
  );
}

/** Título de seção sublinhado (Condições, Crédito, Retenções na fonte…). */
export const Secao = ({ children }: { children: ReactNode }) => <h3 className="rp-secao-tit rp-ficha-secao">{children}</h3>;

/** Botão de análise (gráfico de barras pequeno) ao lado dos indicadores. */
export function BotaoAnalise({ titulo, onClick }: { titulo: string; onClick?: () => void }) {
  return (
    <button type="button" className="rp-graf-btn rp-ficha-graf" aria-label={titulo} title={titulo} onClick={onClick} disabled={!onClick}>
      <svg width="18" height="18" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="1" y="6" width="3" height="7" style={{ fill: 'var(--chart-1)', stroke: 'var(--chart-axis)' }} strokeWidth=".8" />
        <rect x="5.5" y="3" width="3" height="10" style={{ fill: 'var(--chart-2)', stroke: 'var(--chart-axis)' }} strokeWidth=".8" />
        <rect x="10" y="8" width="3" height="5" style={{ fill: 'var(--chart-3)', stroke: 'var(--chart-axis)' }} strokeWidth=".8" />
      </svg>
    </button>
  );
}

export type Indicador = { rotulo: string; valor: string; abrir?: () => void; analise?: () => void };

/** Indicadores à direita do cabeçalho da ficha: "Valores em R$" e as linhas com a seta, o valor e o botão de análise. */
export function Indicadores({ itens, largura = 156, nota = 'Valores em R$' }: { itens: Indicador[]; largura?: number; nota?: string }) {
  return (
    <div className="rp-ficha-kpis">
      <div className="rp-ficha-kpis__nota">{nota}</div>
      {itens.map((k) => (
        <Linha key={k.rotulo} rotulo={k.rotulo} largura={largura}>
          {k.abrir ? <Seta titulo={`Abrir ${k.rotulo}`} abrir={k.abrir} /> : <span className="rp-ficha-kpis__sem-seta" />}
          <input className="rp-field rp-field--readonly rp-field--num" style={{ width: '150px' }} value={k.valor} readOnly aria-label={k.rotulo} />
          <BotaoAnalise titulo={`Análise de ${k.rotulo}`} onClick={k.analise} />
        </Linha>
      ))}
    </div>
  );
}

export type Aba<T extends string> = { id: T; rotulo: string; tecla: string; desabilitada?: boolean };

/** Abas da ficha com a letra de atalho sublinhada (Alt + letra troca de aba). */
export function Abas<T extends string>({ abas, atual, onTroca, rotulo }: { abas: Aba<T>[]; atual: T; onTroca: (a: T) => void; rotulo: string }) {
  return (
    <div className="rp-tabs rp-ficha-abas" role="tablist" aria-label={rotulo}>
      {abas.map((a) => {
        const i = a.rotulo.toLowerCase().indexOf(a.tecla.toLowerCase());
        return (
          <button key={a.id} type="button" role="tab" className="rp-tab" aria-selected={a.id === atual} aria-disabled={a.desabilitada || undefined}
            onClick={() => !a.desabilitada && onTroca(a.id)}>
            <span>{i < 0 ? a.rotulo : <>{a.rotulo.slice(0, i)}<u>{a.rotulo[i]}</u>{a.rotulo.slice(i + 1)}</>}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Alt + letra da aba: devolve a aba da tecla, ou nulo. */
export const abaDaTecla = <T extends string>(abas: Aba<T>[], tecla: string): T | null =>
  abas.find((a) => !a.desabilitada && a.tecla.toLowerCase() === tecla.toLowerCase())?.id ?? null;

/** Rótulo de botão com a letra de atalho sublinhada. */
export const comAtalho = (rotulo: string, tecla: string) => {
  const i = rotulo.toLowerCase().indexOf(tecla.toLowerCase());
  return i < 0 ? rotulo : <span>{rotulo.slice(0, i)}<u>{rotulo[i]}</u>{rotulo.slice(i + 1)}</span>;
};

/** Barra amarela do modo de edição (ferramenta Editar): Excluir registro, Cancelar e Salvar. */
export function BarraEdicao({ registro, onExcluir, onCancelar, onSalvar, gravando, rotuloExcluir = 'Excluir registro' }: {
  registro: string;
  onExcluir?: () => void;
  onCancelar: () => void;
  onSalvar: () => void;
  gravando?: boolean;
  rotuloExcluir?: string;
}) {
  return (
    <div className="rp-ficha-edicao" role="region" aria-label="Modo de edição">
      <i className="rp-ico rp-ico-editar" aria-hidden="true" />
      <span><b>Modo de edição:</b> {registro}. Altere os dados e clique em Salvar.</span>
      <span className="rp-ficha-edicao__botoes">
        {onExcluir && (
          <button type="button" className="rp-btn" onClick={onExcluir}>
            <i className="rp-ico rp-ico-excluir" aria-hidden="true" />{rotuloExcluir}
          </button>
        )}
        <button type="button" className="rp-btn" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="rp-btn rp-btn--default" onClick={onSalvar} disabled={gravando}>
          <i className="rp-ico rp-ico-salvar" aria-hidden="true" />Salvar
        </button>
      </span>
    </div>
  );
}

/** Confirmação de exclusão do mock: caixa de mensagem sobre a janela. */
export function ConfirmaExclusao({ registro, texto, onSim, onNao, rotulo = 'Excluir' }: {
  registro: string; texto: string; onSim: () => void; onNao: () => void; rotulo?: string;
}) {
  const sim = useRef<HTMLButtonElement>(null);
  useEffect(() => sim.current?.focus(), []);
  return (
    <div className="rp-modal rp-ficha-modal" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), onNao())}>
      <div className="rp rp-window rp-msgbox" role="alertdialog" aria-label="Excluir registro">
        <div className="rp-titlebar"><span>Excluir registro</span></div>
        <div className="rp-window-body">
          <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" />
          <div><b>{rotulo} {registro}?</b><br />{texto}</div>
        </div>
        <div className="rp-window-foot">
          <button ref={sim} type="button" className="rp-btn rp-btn--default" onClick={onSim}>{rotulo}</button>
          <button type="button" className="rp-btn" onClick={onNao}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

export type ColunaSimples<L> = {
  rotulo: string;
  largura: string;
  valor: (l: L, i: number) => ReactNode;
  num?: boolean;
  titulo?: (l: L) => string;
};

/**
 * Grade das abas da ficha (Endereços, Atividades, Documentos, Histórico): cabeçalho de 20px, linhas de 19px com o
 * número à esquerda e as linhas pautadas até o fim da área, como no mock.
 */
export function GradeSimples<L>({ rotulo, colunas, linhas, numerada = true, sel, onSel, onAbrir, vazio, chave }: {
  rotulo: string;
  colunas: ColunaSimples<L>[];
  linhas: L[] | null;
  numerada?: boolean;
  sel?: number | null;
  onSel?: (i: number) => void;
  onAbrir?: (l: L, i: number) => void;
  vazio?: string;
  chave?: (l: L, i: number) => string;
}) {
  const modelo = `${numerada ? '32px ' : ''}${colunas.map((c) => c.largura).join(' ')}`;
  return (
    <div role="grid" aria-label={rotulo} aria-rowcount={linhas?.length ?? 0} className="rp-ficha-grade">
      <div role="row" className="rp-ficha-grade__cab" style={{ gridTemplateColumns: modelo }}>
        {numerada && <div role="columnheader">#</div>}
        {colunas.map((c) => (
          <div key={c.rotulo} role="columnheader" className={c.num ? 'num' : undefined}>{c.rotulo}</div>
        ))}
      </div>
      <div className="rp-ficha-grade__linhas rp-rolagem">
        {(linhas ?? []).map((l, i) => (
          <div key={chave ? chave(l, i) : i} role="row" aria-selected={sel === i} className="rp-ficha-grade__linha" style={{ gridTemplateColumns: modelo }}
            onClick={() => onSel?.(i)} onDoubleClick={() => onAbrir?.(l, i)}>
            {numerada && <div role="gridcell" className="rp-ficha-grade__n">{i + 1}</div>}
            {colunas.map((c) => (
              <div key={c.rotulo} role="gridcell" className={c.num ? 'num' : undefined} title={c.titulo?.(l)}>{c.valor(l, i)}</div>
            ))}
          </div>
        ))}
        {linhas !== null && linhas.length === 0 && vazio && <p className="rp-ficha-grade__vazio">{vazio}</p>}
        {linhas === null && <p className="rp-ficha-grade__vazio">Carregando…</p>}
      </div>
    </div>
  );
}

const ROTULO_PERFIL: Record<string, string> = {
  stateRegistration: 'Inscrição estadual', supplierCategory: 'Categoria', modal: 'Modal', phone1: 'Telefone 1', phone2: 'Telefone 2',
  mobile: 'Celular', email: 'E-mail', site: 'Site', industry: 'Tipo de indústria', dailyCapacityTons: 'Moagem (t/dia)',
  responsible: 'Responsável', defaultCarrier: 'Transportadora padrão', territory: 'Território', origin: 'Origem', notes: 'Observações',
  blocked: 'Bloqueado', blockedFrom: 'Bloqueado de', blockedTo: 'Bloqueado até', blockedReason: 'Motivo do bloqueio',
  paymentCondition: 'Condição de pagamento', paymentMethod: 'Forma de pagamento', priceList: 'Tabela de preços',
  defaultDiscountPercent: 'Desconto padrão (%)', lateInterestPercent: 'Juros de mora (% a.m.)', creditLimitCents: 'Limite de crédito',
  pixKey: 'Chave Pix', bankAgency: 'Banco / agência', bankAccount: 'Conta corrente', taxRegime: 'Regime tributário',
  icmsTaxpayer: 'Contribuinte do ICMS', municipalRegistration: 'Inscrição municipal', cnae: 'CNAE principal',
  cnaeDescription: 'Descrição do CNAE', nfeEmail: 'E-mail para NF-e', withholdIss: 'Retém ISS', withholdIrrf: 'Retém IRRF',
  withholdPis: 'Retém PIS', withholdCofins: 'Retém COFINS', withholdCsll: 'Retém CSLL', withholdInss: 'Retém INSS',
  carrierStatus: 'Situação como transportadora', complement: 'Complemento', brand: 'Marca', gtin: 'GTIN / EAN',
  stockItem: 'Item de estoque', salesItem: 'Item de venda', purchaseItem: 'Item de compra', manufactured: 'Fabricado',
  manufacturer: 'Fabricante', partNumber: 'Part number', warrantyMonths: 'Garantia (meses)', traceability: 'Rastreabilidade',
  blockedForPurchase: 'Bloqueado para compra', netWeightKg: 'Peso líquido (kg)', grossWeightKg: 'Peso bruto (kg)',
  dimensions: 'Dimensões', salesUom: 'UM de venda', unitsPerPackage: 'Itens por embalagem', commissionPercent: 'Comissão (%)',
  maxDiscountPercent: 'Desconto máximo (%)', salePriceCents: 'Preço de venda', preferredSupplier: 'Fornecedor preferencial',
  supplierItemCode: 'Código no fornecedor', purchaseUom: 'UM de compra', conversionFactor: 'Fator de conversão',
  leadTimeDays: 'Lead time (dias)', minLot: 'Lote mínimo', valuationMethod: 'Método de avaliação', defaultWarehouse: 'Depósito padrão',
  minStock: 'Estoque mínimo', maxStock: 'Estoque máximo', engineeringProduct: 'Produto de engenharia', bomReference: 'Estrutura (BOM)',
  bomRevision: 'Revisão da BOM', drawing: 'Desenho', routing: 'Roteiro', standardHours: 'Horas-padrão', cest: 'CEST',
  spedType: 'Tipo SPED', ipiRate: 'Alíquota de IPI', taxBenefitCode: 'Benefício fiscal', issExigibility: 'Exigibilidade do ISS',
  issIncidence: 'Incidência do ISS', issRate: 'Alíquota de ISS', type: 'Tipo', department: 'Departamento', jobTitle: 'Função',
  costCenter: 'Centro de custo', admissionDate: 'Admissão', phone: 'Telefone',
};

const rotuloCampo = (k: string) => ROTULO_PERFIL[k] ?? ROTULO_HISTORICO[k] ?? k;
const textoValor = (v: string | null, k: string) => {
  if (v === null || v === '') return '—';
  if (k.endsWith('Cents') && /^-?\d+$/.test(v)) return `R$ ${reais(v)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dataDaApi(v);
  return valorHistorico(v, k);
};

/** Detalhe de um evento da auditoria: "Campo: antes → depois; …" ou o motivo. */
export function detalheHistorico(h: HistoryEntry): string {
  if (/REGISTERED|CREATED|DRAFTED|OPENED/.test(h.action)) return h.reason ? `Cadastro criado. ${h.reason}` : 'Cadastro criado';
  const partes = Object.entries(h.changes ?? {}).map(([k, c]) => `${rotuloCampo(k)}: ${textoValor(c.before, k)} → ${textoValor(c.after, k)}`);
  if (h.reason) partes.push(`Motivo: ${h.reason}`);
  return partes.join('; ');
}

/** Aba Histórico do mock: Data e hora · Usuário · Evento · Detalhe, do mais recente para o mais antigo. */
export function HistoricoFicha({ caminho }: { caminho: string | null }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const [linhas, setLinhas] = useState<HistoryEntry[] | null>(caminho ? null : []);
  useEffect(() => {
    if (!caminho) return;
    api.get<HistoryEntry[]>(caminho)
      .then((r) => setLinhas([...r.data].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))))
      .catch((e: ApiError) => {
        setLinhas([]);
        winRef.current.notify({ tone: 'erro', text: `${e.message} (${e.code}) [${e.correlationId ?? '—'}]` });
      });
  }, [caminho]);
  return (
    <GradeSimples rotulo="Histórico" numerada={false} linhas={linhas} vazio="Sem eventos registrados para este cadastro."
      colunas={[
        { rotulo: 'Data e hora', largura: '140px', valor: (h) => dataHora(h.occurredAt) },
        { rotulo: 'Usuário', largura: '180px', valor: (h) => h.actor },
        { rotulo: 'Evento', largura: '180px', valor: (h) => ACAO_HISTORICO[h.action] ?? h.action },
        { rotulo: 'Detalhe', largura: 'minmax(0,1fr)', valor: (h) => detalheHistorico(h), titulo: (h) => detalheHistorico(h) },
      ]} />
  );
}

/** Situação com o ponto colorido (listas do mock). */
export function PontoSituacao({ ativo, rotulo }: { ativo: boolean; rotulo?: string }) {
  return (
    <span className={`rp-ficha-sit${ativo ? ' rp-ficha-sit--ativo' : ''}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.5" /></svg>
      {rotulo ?? (ativo ? 'Ativo' : 'Inativo')}
    </span>
  );
}

const cache = new Map<string, Promise<unknown>>();

/**
 * Lista auxiliar das fichas (tabelas de referência, colaboradores, transportadoras, tabelas de preço): carregada uma vez
 * por caminho e compartilhada entre as janelas; `renovar` descarta o que está guardado (depois de gravar a tabela).
 */
export function useApi<T>(caminho: string | null, inicial: T): T {
  const [v, setV] = useState<T>(inicial);
  useEffect(() => {
    if (!caminho) return;
    let vivo = true;
    let p = cache.get(caminho) as Promise<T> | undefined;
    if (!p) {
      p = api.get<T>(caminho).then((r) => r.data);
      cache.set(caminho, p);
      p.catch(() => cache.delete(caminho));
    }
    // Lista esperada e resposta em outro formato: fica a inicial, em vez de quebrar quem percorre a lista.
    p.then((d) => vivo && setV(Array.isArray(inicial) && !Array.isArray(d) ? inicial : d)).catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [caminho]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
export const renovarApi = (prefixo: string) => [...cache.keys()].filter((k) => k.startsWith(prefixo)).forEach((k) => cache.delete(k));

export type LinhaReferencia = { id: string; code: string; description: string; attrs: Record<string, unknown>; active: boolean };
export type TabelaReferencia = { table: string; title: string; version: string; rows: LinhaReferencia[] };

/** Opções de uma tabela auxiliar (condições, formas de pagamento, moedas…): valor = código, rótulo = descrição. */
export function useReferencia(tabela: string) {
  const t = useApi<TabelaReferencia | null>(`/api/v1/reference-tables/${tabela}`, null);
  return (t?.rows ?? []).filter((r) => r.active !== false).map((r) => ({ valor: r.code, rotulo: r.description }));
}

/** Opções com o valor atual garantido (registro antigo com valor fora da lista continua aparecendo). */
export const comAtual = (opcoes: { valor: string; rotulo: string }[], atual: string, vazio = '') => {
  const base = [{ valor: '', rotulo: vazio }, ...opcoes];
  return atual && !opcoes.some((o) => o.valor === atual) ? [...base, { valor: atual, rotulo: atual }] : base;
};

type Anexo = { id: string; kind: string; fileName: string; contentType: string; sizeBytes: number; uploadedAt: string; uploadedBy: string };
const TIPOS_ANEXO = ['Contrato social', 'Cartão CNPJ', 'Proposta assinada', 'Ficha técnica', 'Desenho técnico', 'Manual', 'Certificado', 'Foto', 'Outros'];

/** Aba Documentos: anexos guardados no servidor (até 10 MB cada) — Anexar, Abrir e Remover. */
export function Anexos({ dono, donoId, ro }: { dono: string; donoId: string | null; ro?: boolean }) {
  const win = useWindow();
  const winRef = useRef(win);
  winRef.current = win;
  const [linhas, setLinhas] = useState<Anexo[] | null>(donoId ? null : []);
  const [sel, setSel] = useState<number | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState('Outros');
  const [remover, setRemover] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const falha = (e: unknown) => {
    const x = e as ApiError;
    winRef.current.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
  };
  const carregar = () => {
    if (!donoId) return;
    api.get<Anexo[]>(`/api/v1/attachments?ownerEntity=${dono}&ownerId=${donoId}`).then((r) => setLinhas(r.data)).catch((e) => (setLinhas([]), falha(e)));
  };
  useEffect(carregar, [dono, donoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    const f = arquivo;
    setArquivo(null);
    if (!f || !donoId) return;
    if (f.size > 10 * 1024 * 1024) {
      winRef.current.notify({ tone: 'erro', text: `${f.name} tem mais de 10 MB; anexe um arquivo menor (ANEXO-001)` });
      return;
    }
    const base64 = await new Promise<string>((ok, nok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => nok(r.error);
      r.readAsDataURL(f);
    });
    try {
      await api.post('/api/v1/attachments', { ownerEntity: dono, ownerId: donoId, kind: tipo, fileName: f.name, contentType: f.type || 'application/octet-stream', contentBase64: base64 });
      winRef.current.notify({ tone: 'sucesso', text: `${f.name} anexado` });
      carregar();
    } catch (e) {
      falha(e);
    }
  };
  const abrir = async (a: Anexo) => {
    try {
      const r = await api.get<{ fileName: string; contentType: string; contentBase64: string }>(`/api/v1/attachments/${a.id}/content`);
      const bin = atob(r.data.contentBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: r.data.contentType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = r.data.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      falha(e);
    }
  };
  const excluir = async () => {
    setRemover(false);
    const a = sel === null ? null : linhas?.[sel];
    if (!a) return;
    try {
      await api.del(`/api/v1/attachments/${a.id}`);
      winRef.current.notify({ tone: 'sucesso', text: `${a.fileName} removido` });
      setSel(null);
      carregar();
    } catch (e) {
      falha(e);
    }
  };
  const atual = sel === null ? null : linhas?.[sel] ?? null;
  return (
    <div className="rp-ficha__aba">
      <GradeSimples rotulo="Documentos" linhas={linhas} sel={sel} onSel={setSel} onAbrir={(a) => void abrir(a)}
        vazio={donoId ? 'Nenhum documento anexado.' : 'Grave o cadastro para anexar documentos.'} chave={(a) => a.id}
        colunas={[
          { rotulo: 'Tipo', largura: '180px', valor: (a) => a.kind },
          { rotulo: 'Arquivo', largura: 'minmax(0,1fr)', valor: (a) => <><Seta titulo="Abrir documento" abrir={() => void abrir(a)} />{a.fileName}</> },
          { rotulo: 'Data', largura: '100px', valor: (a) => dataHora(a.uploadedAt).slice(0, 10) },
          { rotulo: 'Enviado por', largura: '180px', valor: (a) => a.uploadedBy },
        ]} />
      <div className="rp-ficha__botoes">
        <input ref={input} type="file" hidden onChange={(e) => (setArquivo(e.target.files?.[0] ?? null), (e.target.value = ''))} />
        <button type="button" className="rp-btn" disabled={ro || !donoId} onClick={() => input.current?.click()}>Anexar</button>
        <button type="button" className="rp-btn" disabled={!atual} onClick={() => atual && void abrir(atual)}>Abrir</button>
        <button type="button" className="rp-btn" disabled={ro || !atual} onClick={() => setRemover(true)}>Remover</button>
      </div>
      {arquivo && (
        <div className="rp-modal rp-ficha-modal">
          <div className="rp rp-window rp-msgbox" role="dialog" aria-label="Anexar documento">
            <div className="rp-titlebar"><span>Anexar documento</span></div>
            <div className="rp-window-body">
              <i className="rp-ico rp-ico-status-info" aria-hidden="true" />
              <div className="rp-ficha__coluna">
                <b>{arquivo.name}</b>
                <Linha id={`${win.windowId}-tipo-anexo`} rotulo="Tipo do documento" largura={120}>
                  <Selecao id={`${win.windowId}-tipo-anexo`} valor={tipo} onChange={setTipo} opcoes={TIPOS_ANEXO.map((t) => ({ valor: t, rotulo: t }))} />
                </Linha>
              </div>
            </div>
            <div className="rp-window-foot">
              <button type="button" className="rp-btn rp-btn--default" onClick={() => void enviar()}>Anexar</button>
              <button type="button" className="rp-btn" onClick={() => setArquivo(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {remover && atual && (
        <ConfirmaExclusao registro={atual.fileName} rotulo="Remover" texto="O arquivo sai deste cadastro; a remoção fica registrada no histórico."
          onSim={() => void excluir()} onNao={() => setRemover(false)} />
      )}
    </div>
  );
}
