Seta dourada que abre o registro mestre ou documento vinculado; o único sinal de "detalhar" do sistema.

- Marcação: `<span class="rp-link" role="link" tabindex="0" aria-label="Abrir …"></span>`, antes do rótulo ou antes do valor na grade. `rp-link--g` é a versão de 19px para cabeçalhos.
- A seta tem relevo, como no cliente clássico: um contorno fino de `seta-borda` que acompanha toda a silhueta — corpo, ombros da cabeça e ponta — e o corpo em degradê de `seta-topo` (a luz bate em cima) até `seta-base`. Nada de seta chapada e nada de contorno só de um lado: é esse volume fechado que a faz ser reconhecida como "detalhar".
- Desenho em SVG dentro do `bundle.css`, na proporção medida na tela de origem (13×10, corpo com pouco mais da metade da altura). O traço tem 0,7px na escala do desenho, então continua fino quando a seta cresce.
- Ao passar o mouse, o corpo clareia um pouco; ao clicar, escurece. O desenho não muda de tamanho.
- Esses três tons de dourado são só da seta; `gold` continua sendo o acento da marca e a faísca dos ícones de IA.
- Coloque em todo campo, célula ou total que se refere a outro registro (código do cliente, número do item, saldo da conta).
