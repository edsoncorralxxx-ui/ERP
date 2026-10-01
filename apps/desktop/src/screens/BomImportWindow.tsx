import { useRef, useState, type KeyboardEvent } from 'react';
import { api, type ApiError } from '../api/client';
import type { BomImport } from '../api/types';
import { centavos, dataDaApi, dataHora, reais } from '../format';
import { useSession } from '../shell/SessionContext';
import { useWindow } from '../windows/WindowContext';
import { BOM_ALTERADA } from './BomRevisionWindow';
import { custo, ListaProblemas, quantidade } from './comum/Bom';
import { novaChave } from './comum/Cadastros';
import { MODELOS_ALTERADOS } from './EquipmentModelsWindow';

/**
 * Importar BOM (Sprint 10): o arquivo JSON da engenharia vai ao servidor, que devolve a prévia — submontagens, totais,
 * itens e unidades novos, códigos gerados e os problemas da origem — sem gravar nada além do arquivo. Confirmar grava o
 * modelo, as BOMs e as revisões em rascunho; o mesmo arquivo não carrega duas vezes.
 */
export function BomImportWindow() {
  const win = useWindow();
  const { can } = useSession();
  const [previa, setPrevia] = useState<BomImport | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = useRef(novaChave());
  const arquivo = useRef<HTMLInputElement>(null);

  const enviar = async (f: File) => {
    setErro(null);
    setEnviando(true);
    try {
      const conteudo = await f.text();
      const r = await api.post<BomImport>('/api/v1/bom-imports', { fileName: f.name, content: conteudo });
      setPrevia(r.data);
      chave.current = novaChave();
      win.notify({ tone: 'info', text: `Prévia da BOM ${r.data.product}: ${r.data.lineCount} linhas, ${reais(r.data.totalCents)}` });
    } catch (e) {
      const x = e as ApiError;
      setErro(`${x.message}${x.details[0] && x.details[0].message !== x.message ? ` ${x.details[0].message}` : ''}`);
      win.notify({ tone: 'erro', text: `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    if (!previa || enviando) return;
    setEnviando(true);
    try {
      const r = await api.post<BomImport>(`/api/v1/bom-imports/${previa.id}/confirmation`, null, { 'Idempotency-Key': chave.current });
      setPrevia(r.data);
      win.notify({ tone: 'sucesso', text: `BOM ${r.data.product} rev. ${r.data.revisionLabel ?? ''} carregada com sucesso: ${r.data.lineCount} linhas em rascunho` });
      window.dispatchEvent(new Event(BOM_ALTERADA));
      window.dispatchEvent(new Event(MODELOS_ALTERADOS));
      if (r.data.revisionId) win.open('bom-revision', r.data.revisionId);
    } catch (e) {
      const x = e as ApiError;
      if (!x.isNetwork) chave.current = novaChave();
      win.notify({ tone: x.isNetwork ? 'aviso' : 'erro', text: x.isNetwork ? `Sem conexão com o servidor; confirme de novo para reenviar a mesma carga (${x.code})` : `${x.message} (${x.code}) [${x.correlationId ?? '—'}]` });
    } finally {
      setEnviando(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      win.requestClose();
    }
  };

  const confirmada = previa?.status === 'CONFIRMED';
  const fid = `${win.windowId}-arquivo`;

  return (
    <>
      <div className="rp-window-body rp-janela-mdi__corpo" onKeyDown={onKeyDown}>
        <div className="rp-filtros rp-jlista__filtros">
          <label htmlFor={fid}>Arquivo da BOM (JSON)</label>
          <input id={fid} ref={arquivo} className="rp-field" type="file" accept=".json,application/json" disabled={enviando || !can('bom.update')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviar(f);
            }} />
        </div>
        {erro && (
          <p className="rp-janela-mdi__aviso" role="alert">
            <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
          </p>
        )}
        {!previa ? (
          !erro && <p className="rp-tip" role="note">Escolha o arquivo exportado pela engenharia, no formato da BOM da Balança Hidrostática (rev. 00). Nada é gravado antes de você confirmar.</p>
        ) : (
          <>
            <div className="rp-janela-mdi__cabecalho rp-ficha__cabecalho">
              <div className="rp-form rp-ficha__principal">
                <span className="rp-label">Produto</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Produto" value={previa.product} />
                <span className="rp-label">Revisão</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Revisão do arquivo"
                  value={`${previa.revisionLabel ?? 'Próxima livre'}${previa.revisionDate ? ` de ${dataDaApi(previa.revisionDate)}` : ''}`} />
                <span className="rp-label">Arquivo</span>
                <span />
                <input className="rp-field rp-field--readonly" readOnly aria-label="Arquivo" value={previa.fileName} />
              </div>
              <div className="rp-form rp-ficha__situacao">
                <span className="rp-label">Situação</span>
                <span>
                  <span className={`rp-badge${confirmada ? ' rp-badge--aprovado' : ' rp-badge--pendente'}`}>{confirmada ? 'Carregada' : 'Prévia'}</span>
                </span>
                <span className="rp-label">Linhas</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Linhas" value={previa.lineCount} />
                <span className="rp-label">Soma das linhas</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Soma das linhas" value={reais(previa.totalCents)} />
                <span className="rp-label">Total informado</span>
                <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Total informado no arquivo" value={reais(previa.informedTotalCents)} />
                {confirmada ? (
                  <>
                    <span className="rp-label">Carregada em</span>
                    <input className="rp-field rp-field--readonly" readOnly aria-label="Carregada em" value={`${dataHora(previa.confirmedAt)} por ${previa.confirmedBy}`} />
                  </>
                ) : (
                  <>
                    <span className="rp-label">Itens novos</span>
                    <input className="rp-field rp-field--readonly rp-field--num" readOnly aria-label="Itens novos" value={`${previa.newItems} (já cadastrados: ${previa.existingItems})`} />
                  </>
                )}
              </div>
            </div>

            <div className="rp-grid-rolagem rp-rolagem">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Submontagens da carga">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Submontagem</th>
                    <th>Dentro de</th>
                    <th className="num">Linhas</th>
                    <th className="num">Pendências</th>
                    <th className="num">Soma</th>
                    <th className="num">Informado no arquivo</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.groups.map((g, i) => (
                    <tr key={g.name}>
                      <td className="rownum">{i + 1}</td>
                      <td>{g.name}</td>
                      <td>{g.parent}</td>
                      <td className="num">{g.lines}</td>
                      <td className="num">{g.pending}</td>
                      <td className="num">{centavos(g.totalCents)}</td>
                      <td className="num">{centavos(g.informedCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="rp-bom__secao">Problemas da origem</h3>
            <ListaProblemas problemas={previa.problems} rotulo="Problemas da carga" />
            {previa.fileNotes.length > 0 && (
              <>
                <h3 className="rp-bom__secao">Observações do arquivo</h3>
                <ul className="rp-bom__problemas" aria-label="Observações do arquivo">
                  {previa.fileNotes.map((n) => (
                    <li key={n}>
                      <i className="rp-ico rp-ico-status-info" aria-hidden="true" /> {n}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(previa.newUnits.length > 0 || previa.newCategories.length > 0) && (
              <p className="rp-tip" role="note">
                {previa.newUnits.length > 0 && `Unidades novas: ${previa.newUnits.join(', ')}. `}
                {previa.newCategories.length > 0 && `Categorias de item novas: ${previa.newCategories.join(', ')}.`}
              </p>
            )}

            <h3 className="rp-bom__secao">Linhas do arquivo</h3>
            <div className="rp-grid-rolagem rp-rolagem rp-bom__grade">
              <table className="rp-grid rp-janela-mdi__grade" aria-label="Linhas do arquivo">
                <thead>
                  <tr>
                    <th className="rownum">#</th>
                    <th>Submontagem</th>
                    <th>Item</th>
                    <th>Cód. ref.</th>
                    <th>Descrição</th>
                    <th className="num">Qtd.</th>
                    <th>Un.</th>
                    <th className="num">Custo unit.</th>
                    <th className="num">Total</th>
                    <th>Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="rownum">{i + 1}</td>
                      <td>{l.group}</td>
                      <td className="num">{l.sourceNo}</td>
                      <td>{l.referenceCode ?? ''}{l.generatedCode ? ' (gerado)' : ''}</td>
                      <td>{l.description}</td>
                      <td className="num">{l.quantity === null ? <span className="rp-badge rp-badge--pendente">Sem quantidade</span> : quantidade(l.quantity)}</td>
                      <td>{l.uom}</td>
                      <td className="num">{custo(l.unitCost)}</td>
                      <td className="num">{centavos(l.lineCents)}</td>
                      <td>{confirmada ? '' : l.newItem ? 'Novo' : l.itemCode ?? 'Mesmo item da linha acima'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8}>{previa.pending > 0 ? 'Soma parcial' : 'Soma'}</td>
                    <td className="num">{centavos(previa.totalCents)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="rp-window-foot">
        <div className="rp-btn-row">
          {previa && !confirmada && can('bom.update') ? (
            <button type="button" className="rp-btn rp-btn--default" disabled={enviando} onClick={() => void confirmar()}>
              <span><u>C</u>onfirmar carga</span>
            </button>
          ) : (
            previa?.revisionId && (
              <button type="button" className="rp-btn rp-btn--default" onClick={() => win.open('bom-revision', previa.revisionId!)}>
                <span><u>A</u>brir BOM</span>
              </button>
            )
          )}
          <button type="button" className="rp-btn" onClick={win.requestClose}>{confirmada ? 'OK' : 'Cancelar'}</button>
        </div>
      </div>
    </>
  );
}
