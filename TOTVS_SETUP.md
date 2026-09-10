# TOTVs: importacao mensal

## XLSX detalhado e limpeza administrativa

O painel aceita o XLSX detalhado com ID, criacao, resolucao, status, descricao
e grupo. O administrador escolhe mencoes a TOTVS/TCOP nos textos ou o relatorio
completo, rotulado como multiplos sistemas. O filtro textual nao e classificacao
definitiva. O total numerico final do Excel nao e um ticket. IDs duplicados,
datas invalidas, arquivos acima de 10 MB e conteudo acima de 30 MB sao rejeitados.
Os textos integrais de detalhes nao sao armazenados.

Cada XLSX substitui a importacao do mes da ultima abertura no recorte, inclusive
seu recorte anterior. Outros meses sao versoes independentes. Nao ha soma de
tickets entre versoes. Envie a exportacao completa atualizada; arquivos
incrementais nao sao mesclados. Aberturas usam criacao; encerramentos usam
resolucao e status Closed/Resolved. Encerrados sem data nao entram em series nem
tempos. Pendentes sao os criados no periodo e nao finalizados na exportacao.
Tempo medio e mediana usam horas corridas. SLA permanece indisponivel.

DELETE /api/totvs exige administrador e JSON {"confirmation":"LIMPAR TOTVS"}.
Executa apenas DELETE FROM public.totvs_imports, preservando tabela, sequencia
e demais dados. O botao pede confirmacao textual; falhas preservam a tela.

Antes de publicar, execute npm run db:migrate-totvs com credenciais de migracao
e DB_APP_USER (ou DB_USER) do usuario da aplicacao. A migracao concede DELETE
apenas na tabela TOTVS, alem das permissoes de importacao existentes. Sem essa
permissao, o botao informa o bloqueio do banco. A migracao nao apaga dados.

Validacao: node scripts/test-totvs-detailed.mjs "C:/caminho/Report1789066001565.xlsx"
Testa o Excel de referencia, indicadores, autorizacao e limpeza com banco simulado.
Previa: npm run preview:totvs -- "C:/caminho/Report1789066001565.xlsx" 2026-09
O modo local usa arquivos, nao o Azure. Para uma previa independente, passe outra
pasta como terceiro argumento. Os detalhes abaixo descrevem o formato ZIP anterior.

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
