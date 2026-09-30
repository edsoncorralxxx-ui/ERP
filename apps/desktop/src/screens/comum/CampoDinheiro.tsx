import { useRef, useState, type FocusEvent, type InputEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { resultadoDaExpressao } from '../../calculadora';

/** Troca o valor do campo como se o usuário tivesse digitado, para o `onChange` de quem usa o campo receber o texto. */
const digitar = (el: HTMLInputElement, texto: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, texto);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Campo de dinheiro do design system: o `input.rp-field` de sempre com "R$" dentro, à esquerda. O ícone de calculadora
 * aparece à esquerda, dentro do campo, quando se começa a digitar, e some ao sair. Digitar "=" (ou clicar no ícone)
 * começa uma conta; Enter ou sair do campo põe o resultado, Esc volta ao valor de antes. Aceita os mesmos atributos do `input`; `casas` é o máximo de casas do resultado.
 */
export function CampoDinheiro({ casas = 2, className, value, maxLength, onKeyDown, onBlur, onInput, ...resto }: InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  casas?: number;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [digitando, setDigitando] = useState(false);
  const calc = value.startsWith('=');
  const antes = useRef(value);
  if (!calc) antes.current = value;
  // A conta muda o estado de quem usa o campo; o onBlur dele roda depois, já com o valor novo.
  const ultimoOnBlur = useRef(onBlur);
  ultimoOnBlur.current = onBlur;
  const editavel = !resto.readOnly && !resto.disabled;
  const curto = className?.split(' ').includes('rp-field--curto');

  const calcular = (): boolean => {
    const r = resultadoDaExpressao(value, casas);
    if (r !== null) digitar(campo.current!, r);
    return r !== null;
  };

  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (editavel && !calc && e.key === '=') {
      e.preventDefault();
      digitar(e.currentTarget, '=');
      return;
    }
    if (calc && (e.key === 'Enter' || e.key === 'Escape')) {
      // Enter e Esc são da calculadora: não confirmam nem fecham a janela.
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') digitar(e.currentTarget, antes.current);
      else calcular();
      return;
    }
    onKeyDown?.(e);
  };

  const abrirConta = () => {
    const el = campo.current!;
    el.focus();
    if (!calc) digitar(el, '=');
    el.setSelectionRange(el.value.length, el.value.length);
  };

  const entrada = (e: InputEvent<HTMLInputElement>) => {
    setDigitando(true);
    onInput?.(e);
  };

  const saida = (e: FocusEvent<HTMLInputElement>) => {
    setDigitando(false);
    if (!calc) return onBlur?.(e);
    if (!calcular()) digitar(e.currentTarget, antes.current);
    setTimeout(() => ultimoOnBlur.current?.(e), 0);
  };

  return (
    <span className={`rp-dinheiro${calc ? ' rp-dinheiro--calc' : ''}${digitando && editavel ? ' rp-campo--com-icone' : ''}${curto ? ' rp-field--curto' : ''}`}>
      <span className="rp-dinheiro-simbolo" aria-hidden="true">R$</span>
      <input
        {...resto}
        ref={campo}
        className={className ?? 'rp-field rp-field--num'}
        value={value}
        inputMode={calc ? 'text' : resto.inputMode ?? 'decimal'}
        maxLength={calc ? undefined : maxLength}
        title={calc ? 'Calculadora: Enter põe o resultado, Esc cancela' : resto.title}
        onKeyDown={teclas}
        onInput={entrada}
        onBlur={saida}
      />
      {digitando && editavel && (
      <button type="button" className="rp-campo-icone" tabIndex={-1} title="Calculadora: digite = e a conta; Enter põe o resultado"
        aria-label={`Calculadora${resto['aria-label'] ? ` de ${resto['aria-label']}` : ''}`}
        onMouseDown={(e) => e.preventDefault()} onClick={abrirConta}>
        <i className="rp-ico rp-ico-calculadora" aria-hidden="true" />
      </button>
      )}
    </span>
  );
}
