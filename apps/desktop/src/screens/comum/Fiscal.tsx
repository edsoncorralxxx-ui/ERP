import { useState, type ReactNode } from 'react';
import type { ItemFiscalStatus, TaxGuide, TaxObligation, TaxObligationStatus, TaxPeriodStatus } from '../../api/types';
import { Chart, type ChartSpec } from '../../charts/Chart';
import { competenciaDaApi, dataDaApi } from '../../format';

/** Avisado depois de calcular, transmitir, gerar guia, encerrar, classificar ou alterar parâmetros: as janelas fiscais se atualizam. */
export const IMPOSTOS_ALTERADOS = 'renda:impostos-alterados';
export const avisarFiscal = () => window.dispatchEvent(new Event(IMPOSTOS_ALTERADOS));

const selo = (classe: string, texto: string) => <span className={`rp-badge${classe ? ` rp-badge--${classe}` : ''}`}>{texto}</span>;

export const COMPETENCIA: Record<TaxPeriodStatus, string> = { EM_APURACAO: 'Em apuração', ENCERRADA: 'Encerrada' };
export const seloCompetencia = (s: TaxPeriodStatus) => selo(s === 'ENCERRADA' ? 'fechado' : 'aberto', COMPETENCIA[s]);

export const OBRIGACAO: Record<TaxObligationStatus, string> = {
  A_ENTREGAR: 'A entregar', EM_PREPARACAO: 'Em preparação', EM_APURACAO: 'Em apuração', ABERTO: 'Aberto', DECISAO_PENDENTE: 'Decisão pendente',
  ENTREGUE: 'Entregue', PAGO: 'Pago',
};

/** Situação da obrigação; "Atrasada" e "Vence esta semana" vêm da data, nunca gravadas. */
export const situacaoObrigacao = (o: Pick<TaxObligation, 'status' | 'late' | 'dueThisWeek'>) =>
  o.late ? 'Atrasada' : o.dueThisWeek && (o.status === 'A_ENTREGAR' || o.status === 'ABERTO') ? 'Vence esta semana' : OBRIGACAO[o.status];

export const seloObrigacao = (o: Pick<TaxObligation, 'status' | 'late' | 'dueThisWeek'>) => {
  const t = situacaoObrigacao(o);
  return selo(
    o.status === 'ENTREGUE' || o.status === 'PAGO' ? 'aprovado' : o.late ? 'cancelado'
      : o.status === 'DECISAO_PENDENTE' || t === 'Vence esta semana' ? 'pendente' : 'aberto',
    t,
  );
};

export const ESFERA: Record<TaxObligation['sphere'], string> = { FEDERAL: 'Federal', ESTADUAL: 'Estadual', MUNICIPAL: 'Municipal' };

/** Prazo da obrigação em palavras: "em 3 dias", "Hoje", "2 d atrasada" ou "—" quando já entregue. */
export const prazo = (o: Pick<TaxObligation, 'status' | 'daysToDue'>) =>
  o.status === 'ENTREGUE' || o.status === 'PAGO' ? '—'
    : o.daysToDue < 0 ? `${-o.daysToDue} d atrasada` : o.daysToDue === 0 ? 'Hoje' : `em ${o.daysToDue} ${o.daysToDue === 1 ? 'dia' : 'dias'}`;

/** Competência da obrigação: AAAA-MM vira MM/AAAA; o ano fica como está. */
export const competenciaObrigacao = (c: string) => (c.length === 7 ? competenciaDaApi(c) : c);

export const CLASSIFICACAO: Record<ItemFiscalStatus, string> = { SEM_CLASSIFICACAO: 'Sem classificação', REVISAR: 'Revisar', CLASSIFICADO: 'Classificado' };
export const seloClassificacao = (s: ItemFiscalStatus) => selo(s === 'CLASSIFICADO' ? 'aprovado' : s === 'REVISAR' ? 'pendente' : 'cancelado', CLASSIFICACAO[s]);

export const GUIA: Record<TaxGuide['status'] | 'SEM_GUIA', string> = { ABERTO: 'Aberto', PAGO: 'Pago', SUBSTITUIDA: 'Substituída', SEM_GUIA: 'Sem guia' };
export const seloGuia = (s: TaxGuide['status'] | 'SEM_GUIA') => selo(s === 'PAGO' ? 'aprovado' : s === 'SUBSTITUIDA' ? 'cancelado' : s === 'SEM_GUIA' ? 'pendente' : 'aberto', GUIA[s]);

export const ANEXO: Record<string, string> = {
  I: 'Anexo I — Comércio', II: 'Anexo II — Indústria', III: 'Anexo III — Serviços', IV: 'Anexo IV — Serviços', V: 'Anexo V — Serviços',
  INSUMO: 'Insumo (não tributa na saída)',
};
export const ORDINAL = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª'];
export const faixa = (n: number | null | undefined) => (n ? `${ORDINAL[n - 1] ?? `${n}ª`} faixa` : '');

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** "2026-09" → "set/26". */
export const mesCurto = (c: string) => `${MES_CURTO[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;
/** "2026-09" → "Setembro de 2026". */
export const mesLongo = (c: string) => `${MES_LONGO[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`;
export const nomeDoMes = (m: number) => MES_LONGO[m];

/** Centavos da API em milhares de reais, para os gráficos ("mil R$"). */
export const milReais = (cents: string | null | undefined) => (cents ? Math.round(Number(cents) / 1000) / 100 : 0);

/** Seta de link do design system, com o rótulo acessível. */
export const seta = (rotulo: string, fn: () => void) => (
  <span className="rp-link" role="link" tabIndex={0} aria-label={rotulo} title={rotulo} onClick={fn} onKeyDown={(e) => e.key === 'Enter' && fn()} />
);

/** Entrega um arquivo para o usuário salvar (planilha CSV, agenda .ics). */
export function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Planilha CSV no padrão brasileiro (ponto e vírgula, com BOM para abrir acentuada no Excel). */
export function baixarCsv(nome: string, cabecalho: string[], linhas: string[][]) {
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const texto = [cabecalho, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n');
  baixarArquivo(nome, `﻿${texto}\r\n`, 'text/csv;charset=utf-8');
}

/** Barra de progresso do design system, com o percentual em texto ao lado. */
export function Progresso({ rotulo, valor, ok, nota }: { rotulo: string; valor: number; ok?: boolean; nota?: ReactNode }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="rp-fiscal__progresso">
      <div className="rp-progress-row">
        <span>{rotulo}</span>
        <div className={`rp-progress${ok ? ' rp-progress--ok' : ''}`} role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${v}%` }} />
        </div>
        <b>{v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</b>
      </div>
      {nota && <span className="rp-fiscal__nota">{nota}</span>}
    </div>
  );
}

type Corte = 'todos' | 'u6' | 'u3';

/**
 * Cartão de gráfico (componente Dashboard 3D) das telas fiscais: filtro de períodos (ou das maiores fatias), alternância
 * entre o desenho e a tabela de dados e exportação da tabela para planilha.
 */
export function CartaoGrafico({ icone, titulo, spec, altura, vazio, arquivo, nota }: {
  icone: string;
  titulo: string;
  spec: ChartSpec | null;
  altura: number;
  vazio: string;
  arquivo: string;
  nota?: ReactNode;
}) {
  const [emTabela, setEmTabela] = useState(false);
  const [filtro, setFiltro] = useState(false);
  const [corte, setCorte] = useState<Corte>('todos');
  const n = corte === 'u6' ? 6 : corte === 'u3' ? 3 : 0;
  let s = spec;
  if (s && n) {
    if ('fatias' in s) s = { ...s, fatias: s.fatias.slice(0, n) };
    else if ('categorias' in s) {
      const k = Math.max(0, s.categorias.length - n);
      s = { ...s, categorias: s.categorias.slice(k), series: s.series.map((x) => ({ ...x, valores: x.valores.slice(k) })) };
    }
  }
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const tabela: { cab: string[]; linhas: string[][] } = !s
    ? { cab: [], linhas: [] }
    : 'fatias' in s
      ? {
          cab: ['Item', 'Valor', '%'],
          linhas: s.fatias.map((f) => {
            const t = (s as { fatias: { valor: number }[] }).fatias.reduce((a, x) => a + x.valor, 0);
            return [f.nome, fmt(f.valor), `${(t ? (f.valor / t) * 100 : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`];
          }),
        }
      : 'categorias' in s
        ? { cab: ['Período', ...s.series.map((x) => x.nome)], linhas: s.categorias.map((c, i) => [c, ...(s as { series: { valores: number[] }[] }).series.map((x) => fmt(x.valores[i]))]) }
        : { cab: [], linhas: [] };
  const opcoes: [Corte, string][] = s && 'fatias' in s ? [['todos', 'Todas as fatias'], ['u3', 'As 3 maiores']] : [['todos', 'Todos os períodos'], ['u6', 'Últimos 6'], ['u3', 'Últimos 3']];
  return (
    <div className="rp-chart rp-cockpit__cartao">
      <div className="rp-chart-head">
        <i className={`rp-ico rp-ico-${icone}`} aria-hidden="true" />
        <span className="rp-cockpit__titulo-cartao">{titulo}</span>
        <div role="toolbar" aria-label="Ações do gráfico" className="rp-cockpit__acoes">
          <button type="button" className="rp-tool" aria-pressed={filtro} title="Filtrar dados do gráfico" aria-label="Filtrar dados do gráfico" onClick={() => setFiltro((v) => !v)}>
            <i className="rp-ico rp-ico-filtro" aria-hidden="true" />
          </button>
          <button type="button" className="rp-tool" aria-pressed={emTabela} title="Ver a tabela de dados" aria-label="Ver a tabela de dados" onClick={() => setEmTabela((v) => !v)}>
            <i className="rp-ico rp-ico-relatorio-lista" aria-hidden="true" />
          </button>
          <button type="button" className="rp-tool" title="Exportar para planilha" aria-label="Exportar para planilha" disabled={!s}
            onClick={() => baixarCsv(arquivo, tabela.cab, tabela.linhas)}>
            <i className="rp-ico rp-ico-exportar-planilha" aria-hidden="true" />
          </button>
        </div>
      </div>
      {filtro && (
        <div className="rp-filtros rp-fiscal__corte">
          <span>Mostrar</span>
          {opcoes.map(([v, r]) => (
            <label key={v} className="rp-choice">
              <input type="radio" name={`corte-${titulo}`} checked={corte === v} onChange={() => setCorte(v)} /> {r}
            </label>
          ))}
        </div>
      )}
      {s === null ? (
        <p className="rp-janela-mdi__aviso rp-cockpit__vazio" style={{ height: altura }}>
          <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> {vazio}
        </p>
      ) : emTabela ? (
        <div className="rp-grid-rolagem rp-rolagem rp-cockpit__tabela" style={{ height: altura }}>
          <table className="rp-grid rp-janela-mdi__grade" aria-label={`Dados — ${titulo}`}>
            <thead>
              <tr>
                {tabela.cab.map((c, i) => (
                  <th key={c} className={i ? 'num' : undefined}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((v, j) => (
                    <td key={j} className={j ? 'num' : undefined}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Chart spec={s} altura={altura} label={titulo} />
      )}
      {nota && <div className="rp-chart-note">{nota}</div>}
    </div>
  );
}

/** Alertas por regra (não são IA: a ADR-014 mantém a IA desligada), cada um com ícone e palavra. */
export function Alertas({ alertas, titulo = 'Alertas' }: { alertas: string[]; titulo?: string }) {
  return (
    <div className="rp-chart rp-fiscal__alertas">
      <div className="rp-chart-head">
        <i className="rp-ico rp-ico-status-aviso" aria-hidden="true" />
        <span>{titulo}</span>
      </div>
      <div className="rp-fiscal__alertas-corpo">
        {alertas.length === 0 ? (
          <div className="rp-status-msg rp-status-msg--sucesso" role="status"><span>Nenhum alerta para a competência.</span></div>
        ) : (
          alertas.map((a) => (
            <div key={a} className="rp-status-msg rp-status-msg--aviso" role="status"><span>{a}</span></div>
          ))
        )}
        <span className="rp-fiscal__nota">Alertas calculados pelas regras do Renda+ a partir das notas, da apuração e das obrigações.</span>
      </div>
    </div>
  );
}

export { dataDaApi };
