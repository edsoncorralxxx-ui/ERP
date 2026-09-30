import { useRef, type FocusEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { resultadoDaExpressao } from '../../calculadora';

/** Troca o valor do campo como se o usuário tivesse digitado, para o `onChange` de quem usa o campo receber o texto. */
const digitar = (el: HTMLInputElement, texto: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, texto);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

/**
 * Campo de dinheiro do design system: o `input.rp-field` de sempre com "R$" dentro, à esquerda, e a calculadora.
 * Digitar "=" começa uma conta (o ícone de calculadora aparece à direita); Enter ou sair do campo põe o resultado,
 * Esc volta ao valor de antes. Aceita os mesmos atributos do `input`; `casas` é o máximo de casas do resultado.
 */
export function CampoDinheiro({ casas = 2, className, value, maxLength, onKeyDown, onBlur, ...resto }: InputHTMLAttributes<HTMLInputElement> & {
  value: string;
  casas?: number;
}) {
  const campo = useRef<HTMLInputElement>(null);
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

  const saida = (e: FocusEvent<HTMLInputElement>) => {
    if (!calc) return onBlur?.(e);
    if (!calcular()) digitar(e.currentTarget, antes.current);
    setTimeout(() => ultimoOnBlur.current?.(e), 0);
  };

  return (
    <span className={`rp-dinheiro${calc ? ' rp-dinheiro--calc' : ''}${curto ? ' rp-field--curto' : ''}`}>
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
        onBlur={saida}
      />
      {calc && <i className="rp-ico rp-ico-calculadora rp-dinheiro-calc" role="img" aria-label="Calculadora" />}
    </span>
  );
}
