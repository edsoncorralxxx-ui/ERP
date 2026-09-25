# Pacote de planejamento do backend — Renda+ ERP

Exportado em 25/09/2026. Inclui as funcionalidades do motor integrado e a orientação a objetos/padrões solicitados pelo usuário. Documentação de planejamento; não equivale a servidor implementado.

## Por onde começar

Leia `PLANO-BACKEND-COMPLETO.md` (ou `.txt`) para o material reunido em um arquivo. Para executar, siga `02-roteiro-e-backlog.md` e os prompts de `04-prompts-implementacao.md`, um item por vez, com dependências e critérios de aceite.

## Conteúdo

- 01: plano de arquitetura, domínios, entidades, regras, API, Java/Python, segurança, migração e operação.
- 02: 16 fases e backlog em CSV.
- 03: mapa das 32 áreas do mock para domínios/APIs/etapas do backend.
- 04: protocolo, 16 prompts de implementação e prompt de continuidade.
- 05: motor semântico, indicadores, análise, previsão, otimização, achados, decisões e IA futura.
- 06: OOP, agregados, Value Objects, SOLID, ports/adapters e padrões com exemplos de aplicação.
- 07: catálogo funcional completo recebido, adaptado à arquitetura vigente.
- 08: matriz dos 38 recursos funcionais/analíticos.
- 09: decisões e pendências, sem apresentar propostas como aprovações.
- referencias: cópias dos documentos anteriores e da nova referência recebida; não substituem a precedência das decisões atuais.
- MANIFESTO.json: arquivos, tamanhos e SHA-256 para conferência.

## Escopo e precedência

Electron + React no Mac, Java + Python no servidor. JavaFX/SQLite e escrita offline presentes em material antigo não foram readotados. Um servidor local pode atender sem internet externa, mas o cliente continua conectado a ele. Processamento pode continuar no servidor com o aplicativo fechado. IA generativa é futura e começa desativada.

A base atual tem 32 áreas. O motor amplia o escopo; novos recursos serão distribuídos entre novas telas e abas, sem presumir que já estão no mock. Há 38 recursos funcionais no catálogo, cada um podendo usar vários métodos matemáticos. Os métodos exigem dados apropriados e validação. O pedido de OOP/padrões orienta Java e Python sem impor herança profunda ou padrões sem necessidade.

Spring Boot, PostgreSQL, bibliotecas analíticas e versões são propostas a registrar/verificar na implementação. Este export não é aconselhamento fiscal/jurídico e não valida fórmulas oficiais. Não contém PDFs originais, banco de produção, credenciais ou dados novos importados. Números do estudo são referências de reconciliação do levantamento anterior; dados do mock são sintéticos.

## Documentos canônicos no projeto

As versões atuais deste plano estão em `docs/backend/`. Os documentos gerais em `docs/` receberam uma nota de atualização apontando para essa ampliação. Esta pasta exportada é um retrato com data, adequado para compartilhar. O ZIP não inclui código executável do backend; contém o planejamento completo.
