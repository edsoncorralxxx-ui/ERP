import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { avaliarData, ehContaDeData } from '../../calculadora';
import { dataDaApi, dataParaApi, hojeIso, normalizarData } from '../../format';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/**
 * Campo de data do design system: `DD/MM/AAAA`, digitação livre normalizada ao sair (`20/09/26`, `200926`,
 * `20-09-2026`), o calendário no ícone que aparece à direita, dentro do campo, quando se começa a digitar (semana começando na segunda, Hoje e Limpar; Esc fecha sem
 * alterar) e a conta de datas: `=19/05/2026+90du`, `=hoje+30dc`, `=+1m` — Enter ou sair do campo põe a data, Esc
 * volta à de antes.
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
  const [digitando, setDigitando] = useState(false);
  const comIcone = !somenteLeitura && (digitando || aberto);
  const atual = dataParaApi(valor);
  const base = atual && /^\d{4}-\d{2}-\d{2}$/.test(atual) ? atual : hojeIso();
  const [mes, setMes] = useState<[number, number]>([Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1]);
  const caixa = useRef<HTMLSpanElement>(null);
  const conta = ehContaDeData(valor);
  const antes = useRef(valor);
  if (!conta) antes.current = valor;

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
  /** Resolve a conta de datas; conta inválida fica no campo (com "=", sair do campo volta à data de antes). */
  const calcular = (): boolean => {
    const iso = dataParaApi(antes.current);
    const r = avaliarData(valor, iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null, hojeIso());
    if (r) onChange(dataDaApi(r));
    return r !== null;
  };
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && aberto) {
      e.stopPropagation();
      e.preventDefault();
      setAberto(false);
    } else if (!conta && !somenteLeitura && e.key === '=' && e.target instanceof HTMLInputElement) {
      // "=" começa uma conta nova, guardando a data que estava no campo como ponto de partida.
      e.preventDefault();
      setDigitando(true);
      onChange('=');
    } else if (!somenteLeitura && !aberto && ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4')) {
      // Alt+↓ ou F4 abre o calendário pelo teclado, mesmo sem o ícone à vista.
      e.preventDefault();
      abrir();
    } else if (conta && (e.key === 'Enter' || e.key === 'Escape') && e.target instanceof HTMLInputElement) {
      // Enter e Esc são da conta: não confirmam nem fecham a janela.
      e.stopPropagation();
      e.preventDefault();
      if (e.key === 'Escape') onChange(antes.current);
      else calcular();
    }
  };
  const saida = () => {
    setDigitando(false);
    if (!conta) return onChange(normalizarData(valor));
    if (!calcular() && valor.trim().startsWith('=')) onChange(antes.current);
  };

  return (
    <span className={`rp-campo rp-campo--icone rp-campo-data${comIcone ? ' rp-campo--com-icone' : ''}${className?.split(' ').includes('rp-field--curto') ? ' rp-field--curto' : ''}`} ref={caixa} onKeyDown={teclas}>
      <input
        id={id}
        className={className ?? 'rp-field'}
        value={valor}
        maxLength={40}
        placeholder="DD/MM/AAAA"
        readOnly={somenteLeitura}
        aria-invalid={invalido}
        title={conta ? 'Conta de datas: Enter põe a data, Esc cancela (dc dias corridos, du dias úteis, s semanas, m meses, a anos)' : undefined}
        onChange={(e) => (setDigitando(true), onChange(e.target.value))}
        onBlur={saida}
      />
      {comIcone && (
      <button type="button" className="rp-campo-icone" title="Abrir calendário" aria-label={`Abrir calendário${rotulo ? ` de ${rotulo}` : ''}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()}
        onClick={() => (aberto ? setAberto(false) : abrir())}>
        <i className="rp-ico rp-ico-calendario" aria-hidden="true" />
      </button>
      )}
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
