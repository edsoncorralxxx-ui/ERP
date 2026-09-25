Rodapé fixo do aplicativo com compartimentos de contexto: usuário, empresa, conexão, data, hora, alertas e IA.

- Marcação: `.rp-sysbar` com `.rp-sysbar-slot` (ícone de 14px + texto); um `--grow` ocupa o espaço livre.
- Conexão: `.rp-sysbar-led` verde, ou `--off` vermelho **com** o texto "Sem conexão".
- Ordem: usuário · empresa · conexão · (livre / tarefa em andamento) · data · hora · alertas · IA.
- A versão clássica mínima (`.rp-status`, só data) segue disponível para telas simples.
