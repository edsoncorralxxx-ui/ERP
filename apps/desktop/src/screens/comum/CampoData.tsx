import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { dataDaApi, dataParaApi, hojeIso, normalizarData } from '../../format';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Campo de data do design system: `DD/MM/AAAA`, digitação livre normalizada ao sair (`20/09/26`, `200926`,
 * `20-09-2026`) e o calendário (semana começando na segunda, Hoje e Limpar; Esc fecha sem alterar).
 */
export function CampoData({ id, valor, onChange, somenteLeitura, className, invalido, rotulo }: {
  id: string;
  /** Texto do campo, como o usuário vê (`DD/MM/AAAA`). */
  valor: string;
  onChange: (texto: string) => void;
  somenteLeitura?: boolean;
  className?: string;
  invalido?: boolean;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = dataParaApi(valor);
  const base = atual && /^\d{4}-\d{2}-\d{2}$/.test(atual) ? atual : hojeIso();
  const [mes, setMes] = useState<[number, number]>([Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1]);
  const caixa = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const abrir = () => {
    setMes([Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1]);
    setAberto(true);
  };
  const escolher = (d: string) => {
    onChange(dataDaApi(d));
    setAberto(false);
  };
  const [ano, m] = mes;
  const primeiro = new Date(Date.UTC(ano, m, 1));
  const recuo = (primeiro.getUTCDay() + 6) % 7; // segunda = 0
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(ano, m, 1 - recuo + i));
    return { iso: d.toISOString().slice(0, 10), dia: d.getUTCDate(), fora: d.getUTCMonth() !== m };
  });
  const semanas = Array.from({ length: 6 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
  const hoje = hojeIso();
  const mover = (delta: number) => setMes(([a, mm]) => [a + Math.floor((mm + delta) / 12), (((mm + delta) % 12) + 12) % 12]);
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && aberto) {
      e.stopPropagation();
      e.preventDefault();
      setAberto(false);
    }
  };

  return (
    <span className="rp-campo rp-campo-data" ref={caixa} onKeyDown={teclas}>
      <input
        id={id}
        className={className ?? 'rp-field'}
        value={valor}
        maxLength={10}
        placeholder="DD/MM/AAAA"
        readOnly={somenteLeitura}
        aria-invalid={invalido}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(normalizarData(valor))}
      />
      <button type="button" className="rp-campo-btn" title="Abrir calendário" aria-label={`Abrir calendário${rotulo ? ` de ${rotulo}` : ''}`} disabled={somenteLeitura} onClick={() => (aberto ? setAberto(false) : abrir())}>
        <i className="rp-ico rp-ico-calendario" aria-hidden="true" />
      </button>
      {aberto && (
        <div className="rp-cal rp-campo-data__cal" role="dialog" aria-label="Calendário">
          <div className="rp-cal-head">
            <button type="button" title="Mês anterior" aria-label="Mês anterior" onClick={() => mover(-1)}>
              &lsaquo;
            </button>
            {MESES[m]} de {ano}
            <button type="button" title="Próximo mês" aria-label="Próximo mês" onClick={() => mover(1)}>
              &rsaquo;
            </button>
          </div>
          <table>
            <thead>
              <tr>
                {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => (
                  <th key={i}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {semanas.map((s, i) => (
                <tr key={i}>
                  {s.map((d) => (
                    <td
                      key={d.iso}
                      className={[d.fora ? 'fora' : '', d.iso === hoje ? 'hoje' : ''].join(' ').trim() || undefined}
                      aria-selected={d.iso === atual || undefined}
                      role="button"
                      tabIndex={0}
                      aria-label={dataDaApi(d.iso)}
                      onClick={() => escolher(d.iso)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), escolher(d.iso))}
                    >
                      {d.dia}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rp-cal-foot">
            <a role="button" tabIndex={0} onClick={() => escolher(hoje)} onKeyDown={(e) => e.key === 'Enter' && escolher(hoje)}>
              Hoje: {dataDaApi(hoje)}
            </a>
            <a role="button" tabIndex={0} onClick={() => (onChange(''), setAberto(false))} onKeyDown={(e) => e.key === 'Enter' && (onChange(''), setAberto(false))}>
              Limpar
            </a>
          </div>
        </div>
      )}
    </span>
  );
}
