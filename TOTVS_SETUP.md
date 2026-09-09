# TOTVs: importacao mensal

Card na pagina inicial e rota /totvs/chamados. Usa os componentes visuais do PW,
com indicadores, grafico de colunas, rosca e tabela de categorias.

A evolucao mensal mostra ate 12 meses terminando no mes selecionado, usando
somente o acumulado de categorias TOTVS salvo por mes. Lacunas aparecem como
sem importacao, nunca zero. Reimportacoes substituem a coluna mensal e nao
geram novos pontos. O historico misto do ZIP nao alimenta este grafico.

## Banco e atualizacao

A tabela public.totvs_imports foi criada no Azure pelo administrador durante
esta tarefa. O usuario da aplicacao recebeu SELECT, INSERT, UPDATE na tabela
e USAGE na sequencia; a leitura foi confirmada no terminal do App Service.
O indice unico totvs_imports_report_period_uidx garante um registro por mes.

Cada ZIP atualiza o acumulado do mes informado: ON CONFLICT (report_period)
substitui payload e datas. Meses diferentes permanecem separados. Apenas
categorias cujo rotulo identifica explicitamente TOTVS sao armazenadas.
ZIPs, dados mistos e versoes semanais nao sao gravados na tabela.

A rota GET /api/totvs lista os meses; GET /api/totvs/:id retorna o acumulado;
POST /api/totvs?period=YYYY-MM recebe application/zip. Leitura exige sessao;
importacao exige administrador. A interface oferece selecao de um mes salvo.

## Origem e limites

Informe o mes selecionado na origem: os CSVs de categorias nao trazem periodo.
A data de Status_cargas.csv identifica a carga. O arquivo de categorias pode
ser um ranking parcial; o painel identifica seu total como aberturas
identificadas, nao como todos os chamados do sistema. SLA, encerramentos,
backlog, satisfacao e series mistas nao sao exibidos como indicadores TOTVS.
Limites: ZIP 10 MB, conteudo 20 MB e 100 entradas. Arquivos duplicados,
periodos invalidos e valores numericos invalidos sao rejeitados.

## Testes

npm run test:totvs -- "C:/caminho/Dashboard_Ecorodovias.zip"
node scripts/test-totvs-scope.mjs "C:/caminho/Dashboard_Ecorodovias.zip"
npm run build

Referencia: agosto/2026 tem 97 aberturas TOTVS identificadas: 76 de erro,
12 de configuracao/ajustes e 9 de acesso. Testes verificam parsing, dados
persistidos exclusivamente TOTVS, ausencia distinta de zero, previsoes,
rotulos e graficos renderizados. As rotas rejeitam acesso sem sessao.

## Previa local

npm run preview:totvs -- "C:/caminho/Dashboard_Ecorodovias.zip" 2026-08

Disponivel em http://127.0.0.1:5175/. Usa um arquivo em tmp/totvs-preview,
ou a pasta passada como terceiro argumento. Este servidor escuta apenas
no computador local e nao acessa o banco de producao. Seu modo de acesso
direto existe apenas em desenvolvimento, nunca no build de producao.

## Publicacao

O fluxo existente em .github/workflows publica pushes da branch
azure-migration no App Service monitoramentohdpwdatabase. A conexao utiliza
as configuracoes DB_* do ambiente Azure. Nao executar db:migrate geral
para publicar a tela; a tabela e as permissoes ja foram preparadas.

Para uma nova instalacao, executar scripts/migrate-totvs.mjs com as
credenciais de migracao configuradas e conceder os mesmos privilegios ao
usuario da aplicacao. A migracao e transacional e nao apaga registros
antigos automaticamente se encontrar meses duplicados.
