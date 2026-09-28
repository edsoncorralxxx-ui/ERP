import { useMemo } from 'react';
import { api } from '../api/client';
import type { BusinessDocument, DocumentStatus } from '../api/types';
import { competenciaDaApi, dataDaApi, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';

/** Avisado pela ficha do documento depois de registrar, vincular, desfazer, cancelar ou classificar. */
export const DOCUMENTOS_ALTERADOS = 'renda:documentos-alterados';

let novos = 0;
export const novoDocumento = () => `novo-${++novos}`;

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ status: situacao });
  if (busca) q.set('search', busca);
  return (await api.get<BusinessDocument[]>(`/api/v1/documents?${q.toString()}`)).data;
};

export const seloDocumento = (s: DocumentStatus) => (
  <span className={`rp-badge ${s === 'ATIVO' ? 'rp-badge--aprovado' : 'rp-badge--cancelado'}`}>{s === 'ATIVO' ? 'Ativo' : 'Cancelado'}</span>
);

/** Nota pelo número e série, como o usuário a procura: "Nº 1234 / série 1". */
export const numeroDaNota = (d: Pick<BusinessDocument, 'number' | 'series'>) => `Nº ${d.number} / série ${d.series}`;

/**
 * Janela de lista "Documentos e faturamento" (formulário "documentos"): as notas registradas, com o total, o que já
 * está vinculado às parcelas e, no rodapé, o faturamento da lista (IND-005: só notas ativas).
 */
export function DocumentsWindow() {
  const win = useWindow();
  const { can } = useSession();
  const podeCriar = can('document.register');
  const open = win.open;
  const novo = useMemo(() => (podeCriar ? () => open('document', novoDocumento()) : undefined), [podeCriar, open]);
  return (
    <JanelaLista<BusinessDocument>
      nome={['documento', 'documentos']}
      rotulo="Documentos e faturamento"
      placeholder="Número da nota, código ou cliente"
      carregar={carregar}
      evento={DOCUMENTOS_ALTERADOS}
      abrir={(id) => win.open('document', id)}
      rotuloLinha={(d) => `Abrir documento ${d.code}`}
      novo={novo}
      situacoes={[
        { valor: 'ATIVOS', rotulo: 'Ativos' },
        { valor: 'CANCELADOS', rotulo: 'Cancelados' },
        { valor: 'TODOS', rotulo: 'Todos' },
      ]}
      filtros={[
        { chave: 'competencia', rotulo: 'Competência', max: 7, testa: (d, v) => competenciaDaApi(d.competence).includes(v) },
      ]}
      selo={(d) => seloDocumento(d.status)}
      total={(ds) => `Faturado da lista: ${reais(ds.filter((d) => d.status === 'ATIVO').reduce((t, d) => t + BigInt(d.totalCents), 0n).toString())}`}
      colunas={[
        { titulo: 'Documento', valor: (d) => d.code },
        { titulo: 'Nota', valor: numeroDaNota },
        { titulo: 'Cliente', valor: (d) => `${d.customerCode} — ${d.customerName}` },
        { titulo: 'Emissão', valor: (d) => dataDaApi(d.issueDate) },
        { titulo: 'Competência', valor: (d) => competenciaDaApi(d.competence) },
        { titulo: 'Total', num: true, valor: (d) => reais(d.totalCents) },
        { titulo: 'Vinculado', num: true, valor: (d) => reais(d.linkedCents) },
      ]}
    />
  );
}
