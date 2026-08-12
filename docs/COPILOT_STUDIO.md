# Integração com Microsoft Copilot Studio

O portal expõe uma API somente leitura para o agente consultar dados do PostgreSQL e da API Kartado.

## Configuração no Azure

Crie a variável de ambiente `COPILOT_API_KEY` no App Service com uma chave aleatória forte. As variáveis `KARTADO_USERNAME` e `KARTADO_PASSWORD` também precisam estar configuradas para consultas Kartado.

## Adicionar a ferramenta no Copilot Studio

1. Publique esta versão do portal.
2. No Copilot Studio, abra o agente e adicione uma ferramenta REST API.
3. Importe `https://SEU-DOMINIO/api/copilot/openapi.json`.
4. Configure autenticação por API key.
5. Use o header `x-copilot-key` e informe o mesmo valor de `COPILOT_API_KEY`.
6. Habilite a ferramenta para o agente e teste cada área.

## Áreas disponíveis

- `overview`: totais gerais do banco.
- `storage`: capacidade e histórico recente de armazenamento.
- `tickets`: chamados, filtros, status e prioridades.
- `explorer`: usuários ProjectWise Explorer.
- `portal`: usuários do Portal Bentley/ProjectWise.
- `e365`: consumo e produtos E365.
- `kartado`: concessões, usuários, apontamentos, alertas e saúde.

Para Kartado, uma consulta sem `company` retorna a lista de unidades. Uma segunda consulta com o nome ou UUID retorna os dados daquela unidade.

## Instrução recomendada para o agente

Use a ferramenta `consultarDadosEngenharia` sempre que a pergunta envolver números, usuários, chamados, armazenamento, E365 ou Kartado. Não invente valores. Se a resposta indicar `requiresCompany`, peça ao usuário que escolha uma das unidades retornadas. Informe a fonte, os filtros utilizados e deixe claro quando os registros forem uma amostra limitada.

## Segurança

- A API não aceita SQL enviado pelo agente.
- Todas as consultas ao banco são parametrizadas e somente leitura.
- Tabelas de senhas, sessões e credenciais não são expostas.
- Resultados detalhados possuem limites de registros.
- A rota tem rate limit e autenticação em tempo constante.
- A chave nunca deve receber o prefixo `VITE_` nem ser incluída no frontend.
