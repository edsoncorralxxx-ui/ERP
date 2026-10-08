import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import type {
  Lead, Opportunity, BusinessDocument, CustomerSummary, Equipment, ItemSummary, Payable, Project, ProposalSummary, Receivable, SalesOrderSummary, SupplierSummary,
} from '../api/types';
import type { WindowKind } from '../windows/windowManager';
import { useSession } from './SessionContext';
import { MENU, permissaoDe, windowFor } from './SideNav';

export type GrupoBusca = 'Operações' | 'Dados mestre' | 'Documentos';
export type ResultadoBusca = { grupo: GrupoBusca; rotulo: string; detalhe: string; kind: WindowKind; recordKey?: string };

/** Texto sem acento e em minúsculas, letra a letra, para comparar e achar o trecho a sublinhar na mesma posição. */
const semAcento = (s: string): string => [...s].map((c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()[0] ?? c).join('');

/** Operações: os itens do menu lateral que já abrem uma janela e que o usuário pode abrir. */
export const buscarOperacoes = (termo: string, can: (p: string) => boolean): ResultadoBusca[] => {
  const t = semAcento(termo.trim());
  if (!t) return [];
  const vistos = new Set<string>();
  const achados: ResultadoBusca[] = [];
  for (const m of MENU) {
    for (const it of m.itens) {
      const dest = windowFor(it);
      const need = dest && permissaoDe(dest);
      const chave = dest && `${dest.kind}/${dest.recordKey}`;
      if (!dest || !chave || vistos.has(chave) || (need && !can(need))) continue;
      if (!semAcento(it.rotulo).includes(t) && !semAcento(m.nome).includes(t)) continue;
      vistos.add(chave);
      achados.push({ grupo: 'Operações', rotulo: it.rotulo, detalhe: m.nome, kind: dest.kind, recordKey: dest.recordKey });
    }
  }
  return achados;
};

type Fonte = {
  grupo: GrupoBusca;
  permissao: string;
  caminho: (q: string) => string;
  /** Converte a resposta da lista em resultados. */
  ler: (dados: never[]) => ResultadoBusca[];
};

const POR_FONTE = 5;
const nome = (razao: string, fantasia: string | null) => (fantasia && fantasia !== razao ? `${razao} (${fantasia})` : razao);

/** Cadastros e documentos: as listas da API, todas com o filtro `search` e incluindo inativos, encerrados e cancelados. */
const FONTES: Fonte[] = [
  {
    grupo: 'Dados mestre', permissao: 'partner.read', caminho: (q) => `/api/v1/customers?status=TODOS&search=${q}`,
    ler: (d: CustomerSummary[]) => d.map((c) => ({ grupo: 'Dados mestre', rotulo: `${c.code} — ${nome(c.legalName, c.tradeName)}`, detalhe: 'Cliente', kind: 'customer', recordKey: c.id })),
  },
  {
    grupo: 'Dados mestre', permissao: 'partner.read', caminho: (q) => `/api/v1/suppliers?status=TODOS&search=${q}`,
    ler: (d: SupplierSummary[]) => d.map((f) => ({ grupo: 'Dados mestre', rotulo: `${f.code} — ${nome(f.legalName, f.tradeName)}`, detalhe: 'Fornecedor', kind: 'supplier', recordKey: f.id })),
  },
  {
    grupo: 'Dados mestre', permissao: 'item.read', caminho: (q) => `/api/v1/items?status=TODOS&search=${q}`,
    ler: (d: ItemSummary[]) => d.map((i) => ({ grupo: 'Dados mestre', rotulo: `${i.code} — ${i.description}`, detalhe: 'Produto ou serviço', kind: 'item', recordKey: i.id })),
  },
  {
    grupo: 'Dados mestre', permissao: 'equipment.read', caminho: (q) => `/api/v1/equipment?includeCancelled=true&search=${q}`,
    ler: (d: Equipment[]) => d.map((e) => ({ grupo: 'Dados mestre', rotulo: `${e.code} — ${e.model}`, detalhe: `Equipamento · ${e.customerName}`, kind: 'equipment', recordKey: e.id })),
  },
  {
    grupo: 'Dados mestre', permissao: 'lead.read', caminho: (q) => `/api/v1/leads?stage=TODAS&search=${q}`,
    ler: (d: Lead[]) => d.map((l) => ({ grupo: 'Dados mestre', rotulo: `${l.code} — ${l.companyName}`, detalhe: `Prospecção${l.city ? ` · ${l.city}` : ''}`, kind: 'lead', recordKey: l.id })),
  },
  {
    grupo: 'Documentos', permissao: 'opportunity.read', caminho: (q) => `/api/v1/opportunities?status=TODAS&search=${q}`,
    ler: (d: Opportunity[]) => d.map((o) => ({ grupo: 'Documentos', rotulo: `${o.code} — ${o.name}`, detalhe: `Oportunidade · ${o.customerName ?? o.leadName ?? ''}`, kind: 'opportunity', recordKey: o.id })),
  },
  {
    grupo: 'Documentos', permissao: 'proposal.read', caminho: (q) => `/api/v1/proposals?status=TODOS&search=${q}`,
    ler: (d: ProposalSummary[]) => d.map((p) => ({ grupo: 'Documentos', rotulo: `${p.code} — ${p.title}`, detalhe: `Proposta · ${p.customerName}`, kind: 'proposal', recordKey: p.id })),
  },
  {
    grupo: 'Documentos', permissao: 'sales_order.read', caminho: (q) => `/api/v1/sales-orders?status=TODOS&search=${q}`,
    ler: (d: SalesOrderSummary[]) => d.map((o) => ({ grupo: 'Documentos', rotulo: o.code, detalhe: `Pedido de venda · ${o.customerName}`, kind: 'order', recordKey: o.id })),
  },
  {
    grupo: 'Documentos', permissao: 'project.read', caminho: (q) => `/api/v1/projects?includeClosed=true&search=${q}`,
    ler: (d: Project[]) => d.map((p) => ({ grupo: 'Documentos', rotulo: `${p.code} — ${p.name}`, detalhe: `Projeto · ${p.customerName}`, kind: 'project', recordKey: p.id })),
  },
  {
    grupo: 'Documentos', permissao: 'document.read', caminho: (q) => `/api/v1/documents?status=TODOS&search=${q}`,
    ler: (d: BusinessDocument[]) => d.map((n) => ({ grupo: 'Documentos', rotulo: `${n.code}${n.number ? ` — Nº ${n.number}` : ''}`, detalhe: `Documento de faturamento · ${n.customerName}`, kind: 'document', recordKey: n.id })),
  },
  {
    grupo: 'Documentos', permissao: 'financial_title.read', caminho: (q) => `/api/v1/receivables?status=TODOS&search=${q}`,
    ler: (d: Receivable[]) => d.map((r) => ({ grupo: 'Documentos', rotulo: r.code, detalhe: `Título a receber · ${r.customerName}`, kind: 'receivable', recordKey: r.id })),
  },
  {
    grupo: 'Documentos', permissao: 'financial_title.read', caminho: (q) => `/api/v1/payables?status=TODOS&search=${q}`,
    ler: (d: Payable[]) => d.map((p) => ({ grupo: 'Documentos', rotulo: `${p.code}${p.documentNumber ? ` — ${p.documentNumber}` : ''}`, detalhe: `Título a pagar · ${p.supplierName}`, kind: 'payable', recordKey: p.id })),
  },
];

/** Busca nos cadastros e documentos que o usuário pode ler; uma lista que falha só fica de fora. */
export const buscarRegistros = async (termo: string, can: (p: string) => boolean): Promise<ResultadoBusca[]> => {
  const q = encodeURIComponent(termo.trim());
  const listas = await Promise.all(
    FONTES.filter((f) => can(f.permissao)).map((f) =>
      api.get<never[]>(f.caminho(q)).then((r) => f.ler(r.data ?? []).slice(0, POR_FONTE)).catch(() => [] as ResultadoBusca[]),
    ),
  );
  return listas.flat();
};

/** Sublinha os caracteres encontrados, como no design system (Busca). */
const sublinhar = (texto: string, termo: string): ReactNode => {
  const t = semAcento(termo.trim());
  const i = t ? semAcento(texto).indexOf(t) : -1;
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <u>{texto.slice(i, i + t.length)}</u>
      {texto.slice(i + t.length)}
    </>
  );
};

/** Lupa da Busca do design system (components/Busca/preview.html). */
const Lupa = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="6.5" cy="6.5" r="4.5" fill="none" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="2.4" />
    <path d="M10 10l4.5 4.5" style={{ stroke: 'var(--nav-divider)' }} strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const MINIMO = 2;
const ESPERA_MS = 250;

/**
 * Busca global do canto superior: sugere operações (telas do menu), dados mestre e documentos enquanto se digita.
 * Setas escolhem, Enter abre, Esc fecha a lista (e, com ela fechada, limpa o campo).
 */
export function BuscaGlobal({ onOpen }: { onOpen: (kind: WindowKind, recordKey?: string) => void }) {
  const { can } = useSession();
  const [termo, setTermo] = useState('');
  const [registros, setRegistros] = useState<{ termo: string; itens: ResultadoBusca[] } | null>(null);
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const limpo = termo.trim();
  const operacoes = useMemo(() => buscarOperacoes(limpo, can), [limpo, can]);
  const buscando = limpo.length >= MINIMO && registros?.termo !== limpo;
  const resultados = useMemo(
    () => [...operacoes, ...(limpo.length >= MINIMO && registros?.termo === limpo ? registros.itens : [])],
    [operacoes, registros, limpo],
  );

  useEffect(() => {
    if (limpo.length < MINIMO) return;
    let vale = true;
    const t = setTimeout(() => {
      void buscarRegistros(limpo, can).then((itens) => vale && setRegistros({ termo: limpo, itens }));
    }, ESPERA_MS);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [limpo, can]);

  useEffect(() => setAtivo(0), [limpo]);

  const mostrar = aberta && limpo.length > 0;
  useLayoutEffect(() => {
    if (!mostrar) return;
    const r = caixa.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 2, width: r.width });
  }, [mostrar, resultados.length]);

  useEffect(() => {
    if (!mostrar) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !lista.current?.contains(alvo)) setAberta(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [mostrar]);

  useEffect(() => {
    lista.current?.querySelector('[aria-selected=true]')?.scrollIntoView?.({ block: 'nearest' });
  }, [ativo]);

  const abrir = (r: ResultadoBusca | undefined) => {
    if (!r) return;
    onOpen(r.kind, r.recordKey);
    setAberta(false);
    setTermo('');
    campo.current?.blur();
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAberta(true);
      if (resultados.length) setAtivo((a) => (a + (e.key === 'ArrowDown' ? 1 : resultados.length - 1)) % resultados.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      abrir(resultados[ativo]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (mostrar) setAberta(false);
      else setTermo('');
    }
  };

  const listaId = 'rp-busca-global-lista';
  let grupoAnterior: GrupoBusca | null = null;

  return (
    <div className="rp-search" ref={caixa}>
      <input
        ref={campo}
        role="combobox"
        aria-label="Busca global"
        aria-expanded={mostrar}
        aria-controls={listaId}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && resultados[ativo] ? `${listaId}-${ativo}` : undefined}
        placeholder="Pesquisar operações, dados mestre e documentos"
        maxLength={100}
        value={termo}
        onChange={(e) => (setTermo(e.target.value), setAberta(true))}
        onFocus={() => setAberta(true)}
        onKeyDown={teclas}
      />
      <button type="button" aria-label="Pesquisar" title="Pesquisar" onClick={() => (limpo ? (setAberta(true), abrir(resultados[ativo])) : campo.current?.focus())}>
        <Lupa />
      </button>
      {mostrar && pos &&
        createPortal(
          <div ref={lista} id={listaId} role="listbox" aria-label="Resultados da busca" className="rp-search-list rp-busca__lista rp-rolagem"
            style={{ left: pos.left, top: pos.top, width: pos.width }}>
            {resultados.map((r, i) => {
              const titulo = r.grupo !== grupoAnterior;
              grupoAnterior = r.grupo;
              return (
                <Fragment key={`${r.kind}-${r.recordKey ?? r.rotulo}`}>
                  {titulo && <div className="rp-search-grupo" role="presentation">{r.grupo}</div>}
                  <div id={`${listaId}-${i}`} role="option" aria-selected={i === ativo} onMouseDown={(e) => e.preventDefault()} onClick={() => abrir(r)}>
                    <span>{sublinhar(r.rotulo, limpo)}</span>
                    <span className="rp-search-detalhe">{r.detalhe}</span>
                  </div>
                </Fragment>
              );
            })}
            {buscando && <div className="rp-search-aviso" role="presentation">Procurando nos dados mestre e documentos…</div>}
            {!buscando && resultados.length === 0 && (
              <div className="rp-search-aviso" role="presentation">
                {limpo.length < MINIMO ? 'Digite ao menos 2 caracteres para procurar nos dados mestre e documentos' : 'Nenhum registro correspondente encontrado'}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
