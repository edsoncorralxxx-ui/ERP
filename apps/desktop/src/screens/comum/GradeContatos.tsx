import type { KeyboardEvent } from 'react';

export type Contato = { id: string | null; name: string; role: string; phone: string; email: string };
export const CONTATO_VAZIO: Contato = { id: null, name: '', role: '', phone: '', email: '' };

const MAX = { name: 120, role: 100, phone: 30, email: 200 } as const;
const COLUNAS: [keyof typeof MAX, string][] = [
  ['name', 'Nome'],
  ['role', 'Função'],
  ['phone', 'Telefone'],
  ['email', 'E-mail'],
];

type Props = {
  contatos: Contato[];
  onChange: (contatos: Contato[]) => void;
  somenteLeitura: boolean;
  adicao: boolean;
  /** Erros do servidor por campo ("contacts[0].email"). */
  erros: Record<string, string>;
  titulo: string;
};

/**
 * Contatos do parceiro na Tabela de edição do design system: cada célula é um campo, a última linha cria o contato,
 * o × remove; Ctrl+Insert adiciona e Ctrl+Delete remove a linha em foco.
 */
export function GradeContatos({ contatos, onChange, somenteLeitura, adicao, erros, titulo }: Props) {
  const muda = (i: number, patch: Partial<Contato>) => onChange(contatos.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(contatos.filter((_, j) => j !== i));
  const adiciona = () => onChange([...contatos, { ...CONTATO_VAZIO }]);
  const teclas = (e: KeyboardEvent<HTMLTableElement>) => {
    if (somenteLeitura || !e.ctrlKey || (e.key !== 'Insert' && e.key !== 'Delete')) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Insert') return adiciona();
    const linha = (e.target as HTMLElement).closest('tr');
    const i = linha ? Array.from(linha.parentElement?.children ?? []).indexOf(linha) : -1;
    if (i >= 0 && i < contatos.length) remove(i);
  };
  const errosDaLista = Object.entries(erros)
    .filter(([k]) => k.startsWith('contacts'))
    .map(([k, v]) => {
      const m = /\[(\d+)\]/.exec(k);
      return `Contato ${m ? Number(m[1]) + 1 : ''}: ${v}`;
    });
  return (
    <div className="rp-tabela">
      <div className="rp-tabela-acoes">
        <span className="rp-tabela-tit">{titulo}</span>
      </div>
      <div className="rp-grid-rolagem rp-rolagem rp-ficha__grade">
        <table className={`rp-grid rp-grid--edicao${adicao && !somenteLeitura ? ' rp-form--adicao' : ''}`} onKeyDown={teclas}>
          <thead>
            <tr>
              <th className="rp-ficha__col-num">#</th>
              <th>
                Nome <span className="rp-req">*</span>
              </th>
              <th>Função</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th className="rp-ficha__col-x" aria-label="Remover" />
            </tr>
          </thead>
          <tbody>
            {contatos.map((c, i) => (
              <tr key={c.id ?? `n${i}`}>
                <td className="rownum">{i + 1}</td>
                {COLUNAS.map(([k, rotulo]) => {
                  const erro = erros[`contacts[${i}].${k}`];
                  return (
                    <td key={k}>
                      <input
                        className="rp-field"
                        value={c[k]}
                        maxLength={MAX[k]}
                        readOnly={somenteLeitura}
                        aria-label={`${rotulo} da linha ${i + 1}`}
                        aria-invalid={!!erro}
                        title={erro}
                        onChange={(e) => muda(i, { [k]: e.target.value })}
                      />
                    </td>
                  );
                })}
                <td
                  className="rp-linha-x"
                  role={somenteLeitura ? undefined : 'button'}
                  tabIndex={somenteLeitura ? -1 : 0}
                  title="Remover contato"
                  aria-label={`Remover contato ${i + 1}`}
                  onClick={() => !somenteLeitura && remove(i)}
                  onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && remove(i)}
                >
                  {somenteLeitura ? '' : '×'}
                </td>
              </tr>
            ))}
            {!somenteLeitura && (
              <tr className="nova">
                <td className="rownum">{contatos.length + 1}</td>
                <td colSpan={5} role="button" tabIndex={0} onClick={adiciona} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), adiciona())}>
                  Clique para adicionar um contato…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {errosDaLista.map((m) => (
        <p key={m} className="rp-campo-erro rp-ficha__erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {m}
        </p>
      ))}
    </div>
  );
}
