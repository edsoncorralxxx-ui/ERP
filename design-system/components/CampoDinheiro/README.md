Campo de valor em reais: "R$" dentro do campo, à esquerda, e uma calculadora que se abre com "=".

- Marcação: `.rp-dinheiro` > `.rp-dinheiro-simbolo` ("R$") + `input.rp-field.rp-field--num` (+ `.rp-dinheiro-calc` durante a conta). No aplicativo, use o componente React `CampoDinheiro` (`apps/desktop/src/screens/comum/CampoDinheiro.tsx`), que aceita os mesmos atributos do `input`.
- Todo campo editável de dinheiro usa este componente: valores, saldos iniciais, parcelas, preços, descontos, limites e deduções. O valor digitado fica sem o símbolo (`1.234,56`); o "R$" é do campo. Valores somente leitura calculados continuam mostrando `R$ 1.234,56` no próprio texto.
- **Calculadora**: digitar `=` apaga o valor e começa uma conta; o "R$" some e o ícone `calculadora` aparece no canto direito, dentro do campo. Enter (ou sair do campo) põe o resultado com duas casas (`=2+2` → `4,00`) e o ícone some; Esc volta ao valor de antes. Durante a conta, Enter e Esc não confirmam nem fecham a janela.
- A conta aceita `+ - * /` (também `x`, `×` e `÷`), parênteses, sinal negativo e números no padrão brasileiro (`1.500,50`, `R$ 10,00`). Conta inválida ou divisão por zero: Enter não faz nada e sair do campo volta ao valor de antes.
- Campo somente leitura ou desabilitado não abre a calculadora.
