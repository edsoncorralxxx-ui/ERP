# Design system adotado — Renda+ ERP

Integração iniciada no mock em 23/09/2026. O usuário escolheu o pacote Renda+ ERP como referência visual. A cópia recebida está em `renda-mais-erp/`; `origem.json` registra origem, versão e hashes dos 205 arquivos. O catálogo contém 49 componentes. O [mock React](../mock/README.md) reutiliza os estilos, ícones e gráficos originais; a biblioteca operacional completa e a integração com o servidor ainda serão desenvolvidas.

## Referências canônicas

- `renda-mais-erp/galeria.html`: galeria de referência.
- `renda-mais-erp/GUIA-DE-ESTILO.md`: regras visuais.
- `renda-mais-erp/design-system.json`: catálogo de componentes.
- `renda-mais-erp/componentes/<Componente>/USO.md` e `exemplo.html`: estrutura e uso.
- `renda-mais-erp/css/tokens.css`, seguido de `css/componentes.css`: estilos reais do pacote.
- `renda-mais-erp/js/renda-erp.js` e `js/renda-erp.d.ts`: implementações e tipos originais.

O guia original menciona alguns caminhos `components/bundle.*` e `components/index.d.ts` que não correspondem à distribuição recebida. Usar os caminhos reais acima; manter o pacote de referência intacto e registrar correções na integração.

## Aplicação no ERP

A organização por janelas segue a [especificação de interface](../docs/interface-janelas-erp-renda-mais.md), baseada nas nove capturas do SAP Business One fornecidas pelo usuário. Adotar uma janela principal Electron com múltiplas janelas internas React: cadastros/documentos simultâneos, sobreposição, foco, minimizar/maximizar/restaurar e navegação por vínculos. A especificação distribui as informações das 32 áreas em cabeçalhos, abas, tabelas, resumos e ações.

Preservar navegação azul, barras e janelas desktop, tabelas densas, estados dos campos, ícones próprios, marca e tokens. Usar contêiner `.rp` e classes `rp-`. Adaptar os componentes para React/TypeScript em biblioteca separada, com galeria e comparação visual. O formato HTML/JavaScript sem framework do pacote não altera a decisão Electron + React.

Implementar comportamento de formulários, tabelas, navegação e janelas sob controle do React. Envolver gráficos imperativos com criação, atualização e limpeza explícitas. O menu original registra listeners sem expor descarte: sua integração precisa evitar listeners duplicados ao remontar componentes.

Validar teclado no Mac, foco, leitura, zoom e contraste dos estados efetivamente usados. A presença de notas de contraste no guia não comprova conformidade de acessibilidade. O Gantt não está no catálogo e deverá ser implementado/adaptado seguindo a identidade existente.

Nomes, CNPJs, valores, usuários, percentuais de confiança e telas dos exemplos são demonstrativos. Não são cadastros reais, regras de negócio nem ampliação do escopo. O plano funcional define quais módulos serão entregues. Funções de formatação do pacote não substituem os cálculos financeiros do servidor Java.

Execução: [etapa 3 do planejamento](../docs/planejamento-desenvolvimento-erp-renda-mais.md). Prompts: [roteiro para o Codex](../docs/prompts-codex-erp-renda-mais.md).
