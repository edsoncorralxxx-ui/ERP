Faixa de botões de ícone abaixo da barra de menus: ações sobre o documento aberto.

- Marcação: `.rp-toolbar` com `button.rp-tool` contendo um `<i class="rp-ico rp-ico-NOME">`; grupos separados por `.rp-tool-sep`.
- Ordem igual à barra clássica: visualizar, imprimir, enviar e-mail, SMS, fax, exportar (planilha, Word, PDF), iniciar/mover, bloquear tela · buscar, novo, primeiro, anterior, próximo, último, filtro · ordenar, documento-base, documento-destino, lucro bruto, meios de pagamento · editar, configurações do formulário, consulta, alertas, calendário · ajuda · assistente de IA por último.
- Estilo clássico: contorno azul-ardósia `#3b4d70` de 1px, preenchimento em degradê branco → `#c3d0e3`, páginas com canto dobrado; cor só no cadeado (dourado), aviso (laranja), mover e binóculo (azul), estrela de novo (laranja) e marca do calendário (vermelha).
- Indisponível: `disabled` deixa o ícone cinza e esmaecido (tons de cinza a 45%), como na barra original — a maior parte da barra fica assim até um documento estar aberto.
- Todo botão tem `title` com o nome da ação. Ferramenta ligada: `aria-pressed="true"`.
- Não coloque texto na barra; comandos com rótulo são Botões.
