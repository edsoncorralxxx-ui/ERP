import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { CompanyProfile } from '../api/types';
import { Chart, type ChartSpec } from '../charts/Chart';
import type { Connection } from '../shell/useConnection';
import { useWindow } from '../windows/WindowContext';

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// Campos que compõem o cadastro da empresa (complemento é opcional por natureza e fica de fora).
const CAMPOS: [string, (p: CompanyProfile) => string | null][] = [
  ['Razão social', (p) => p.legalName],
  ['Nome fantasia', (p) => p.tradeName],
  ['CNPJ', (p) => p.cnpj],
  ['Telefone', (p) => p.phone],
  ['E-mail', (p) => p.email],
  ['Logradouro', (p) => p.address.street],
  ['Nº', (p) => p.address.number],
  ['Bairro', (p) => p.address.district],
  ['Cidade', (p) => p.address.city],
  ['UF', (p) => p.address.state],
  ['CEP', (p) => p.address.postalCode],
];

type Linha = [string, string];

/** Cartão de gráfico (componente Dashboard 3D): cabeçalho com ícone e ações, desenho ou tabela de dados no corpo. */
function Cartao({ icone, titulo, spec, vazio, tabela, altura, nota }: { icone: string; titulo: string; spec: ChartSpec | null; vazio: string; tabela: [string, string, Linha[]]; altura: number; nota: ReactNode }) {
  const [emTabela, setEmTabela] = useState(false);
  return (
    <div className="rp-chart rp-cockpit__cartao">
      <div className="rp-chart-head">
        <i className={`rp-ico rp-ico-${icone}`} aria-hidden="true" />
        <span className="rp-cockpit__titulo-cartao">{titulo}</span>
        <div role="toolbar" aria-label="Ações do gráfico" className="rp-cockpit__acoes">
          <button type="button" className="rp-tool" aria-pressed={emTabela} title="Ver a tabela de dados" aria-label="Ver a tabela de dados" onClick={() => setEmTabela((v) => !v)}>
            <i className="rp-ico rp-ico-relatorio-lista" aria-hidden="true" />
          </button>
        </div>
      </div>
      {spec === null ? (
        <p className="rp-janela-mdi__aviso rp-cockpit__vazio" style={{ height: altura }}>
          <i className="rp-ico rp-ico-status-processando" aria-hidden="true" /> {vazio}
        </p>
      ) : emTabela ? (
        <div className="rp-grid-rolagem rp-rolagem rp-cockpit__tabela" style={{ height: altura }}>
          <table className="rp-grid rp-janela-mdi__grade">
            <thead>
              <tr>
                <th>{tabela[0]}</th>
                <th className="num">{tabela[1]}</th>
              </tr>
            </thead>
            <tbody>
              {tabela[2].map(([k, v], i) => (
                <tr key={`${k}-${i}`}>
                  <td>{k}</td>
                  <td className="num">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Chart spec={spec} altura={altura} label={titulo} />
      )}
      <div className="rp-chart-note">{nota}</div>
    </div>
  );
}

/**
 * Meu cockpit: indicadores e gráficos do design system com os dados que o sistema já tem — a saúde da conexão
 * nesta sessão e o preenchimento do cadastro da empresa. Os indicadores de negócio entram com cada módulo.
 */
export function CockpitWindow({ connection }: { connection: Connection }) {
  const win = useWindow();
  const [perfil, setPerfil] = useState<CompanyProfile | null>(null);

  useEffect(() => {
    let vivo = true;
    api
      .get<CompanyProfile>('/api/v1/company-profile')
      .then((r) => vivo && setPerfil(r.data))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // Recarrega quando a conexão volta, para refletir uma gravação feita em outra janela.
  }, [connection.state]);

  const hist = connection.history;
  const ok = hist.filter((c) => c.ok);
  const disponibilidade = hist.length ? (ok.length / hist.length) * 100 : 0;
  const media = ok.length ? Math.round(ok.reduce((s, c) => s + c.ms, 0) / ok.length) : 0;
  const ultima = ok.length ? ok[ok.length - 1].ms : 0;
  const preenchidos = perfil ? CAMPOS.filter(([, f]) => (f(perfil) ?? '').trim() !== '').length : 0;
  const completude = perfil ? (preenchidos / CAMPOS.length) * 100 : 0;
  const online = connection.state === 'online';

  // A Linha precisa de ao menos dois pontos para ter inclinação; até lá o cartão avisa que está aguardando.
  const linha: ChartSpec | null = hist.length >= 2
    ? { tipo: 'Linha', categorias: hist.map((c) => hora(c.at).slice(0, 5)), series: [{ nome: 'Tempo de resposta (ms)', valores: hist.map((c) => c.ms) }], unidade: ' ms' }
    : null;
  const rosca: ChartSpec | null = perfil
    ? {
        tipo: 'Rosca3D',
        fatias: [
          { nome: 'Preenchidos', valor: preenchidos },
          { nome: 'Em branco', valor: CAMPOS.length - preenchidos },
        ].filter((f) => f.valor > 0),
        furo: 0.55,
        centro: { valor: pct(completude), titulo: 'preenchido' },
      }
    : null;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo rp-cockpit rp-rolagem">
        <div className="rp-dash-kpis rp-cockpit__kpis">
          <div className="rp-kpi">
            <div className="rp-kpi-head">
              <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir status do servidor" title="Abrir status do servidor" onClick={() => win.open('server-status')} onKeyDown={(e) => e.key === 'Enter' && win.open('server-status')} />
              <i className="rp-ico rp-ico-integracoes" aria-hidden="true" />
              Servidor
            </div>
            <div className="rp-kpi-valor">{connection.state === 'checking' ? 'Verificando' : online ? 'Conectado' : 'Sem conexão'}</div>
            <div className={`rp-kpi-delta ${online ? 'rp-kpi-delta--up' : 'rp-kpi-delta--down'}`}>
              {connection.state === 'checking' ? '' : `${online ? '▲' : '▼'} verificado às ${hora(connection.checkedAt)}`}
            </div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-head">
              <i className="rp-ico rp-ico-status-sucesso" aria-hidden="true" />
              Disponibilidade na sessão
            </div>
            <div className="rp-kpi-valor">{hist.length ? pct(disponibilidade) : '—'}</div>
            <div className={`rp-kpi-delta ${disponibilidade >= 99 ? 'rp-kpi-delta--up' : 'rp-kpi-delta--down'}`}>
              {hist.length ? `${disponibilidade >= 99 ? '▲' : '▼'} ${ok.length} de ${hist.length} verificações` : ''}
            </div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-head">
              <i className="rp-ico rp-ico-atualizar" aria-hidden="true" />
              Tempo de resposta
            </div>
            <div className="rp-kpi-valor">{ok.length ? `${media.toLocaleString('pt-BR')} ms` : '—'}</div>
            <div className={`rp-kpi-delta ${ultima <= media ? 'rp-kpi-delta--up' : 'rp-kpi-delta--down'}`}>
              {ok.length ? `${ultima <= media ? '▲' : '▼'} última ${ultima.toLocaleString('pt-BR')} ms vs. média` : ''}
            </div>
          </div>
          <div className="rp-kpi">
            <div className="rp-kpi-head">
              <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir dados da empresa" title="Abrir dados da empresa" onClick={() => win.open('company-profile')} onKeyDown={(e) => e.key === 'Enter' && win.open('company-profile')} />
              <i className="rp-ico rp-ico-cadastros" aria-hidden="true" />
              Cadastro da empresa
            </div>
            <div className="rp-kpi-valor">{perfil ? pct(completude) : '—'}</div>
            <div className={`rp-kpi-delta ${completude === 100 ? 'rp-kpi-delta--up' : 'rp-kpi-delta--down'}`}>
              {perfil ? `${completude === 100 ? '▲' : '▼'} ${preenchidos} de ${CAMPOS.length} campos preenchidos` : ''}
            </div>
          </div>
        </div>
        <div className="rp-dash-row">
          <Cartao
            icone="relatorios"
            titulo="Tempo de resposta do servidor — últimas verificações"
            spec={linha}
            vazio="Aguardando a segunda verificação do servidor."
            altura={240}
            tabela={['Hora', 'Tempo', hist.map((c) => [hora(c.at), c.ok ? `${c.ms.toLocaleString('pt-BR')} ms` : 'Sem resposta'] as Linha)]}
            nota="Uma verificação a cada 10 segundos, desde a abertura do aplicativo."
          />
          <Cartao
            icone="bi"
            titulo="Preenchimento do cadastro da empresa"
            spec={rosca}
            vazio="Carregando os dados da empresa."
            altura={240}
            tabela={['Campo', 'Situação', perfil ? CAMPOS.map(([n, f]) => [n, (f(perfil) ?? '').trim() ? 'Preenchido' : 'Em branco'] as Linha) : []]}
            nota={
              <>
                <span className="rp-link" role="link" tabIndex={0} aria-label="Abrir dados da empresa" onClick={() => win.open('company-profile')} onKeyDown={(e) => e.key === 'Enter' && win.open('company-profile')} /> Complete em Configurações → Empresa.
              </>
            }
          />
        </div>
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          <button type="button" className="rp-btn rp-btn--default" onClick={win.requestClose}>
            OK
          </button>
        </div>
      </div>
    </>
  );
}
