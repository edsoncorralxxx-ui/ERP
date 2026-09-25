Painel com descobertas geradas por IA sobre os dados da tela, cada uma com ícone, texto, confiança e ações.

- Marcação: `.rp-ai` > `.rp-ai-head` (ícone `ia-*`, título, selo `rp-badge--ia`) > `.rp-ai-item` (ícone, `b` + `p`, `.rp-ai-conf`, `.rp-ai-acoes` opcional) > `.rp-ai-chat` opcional > `.rp-ai-foot`.
- Fundo `ai-surface`, contorno `ai-border`; nunca gradientes ou roxo.
- Cada item: título curto, uma frase com o número que importa, grau de confiança em percentual.
- Ações que mudam dados pedem confirmação do usuário (Aplicar / Ignorar); a IA nunca altera registros sozinha.
- Rodapé sempre diz quando e com base em quê foi gerado, e pede conferência.
