# Acompanhamento Eco

Fonte: cópia local de `Acompanhamento_Grupo_Eco_1.xlsx` e `cliente-eco_1.html`, fornecidos pelo usuário em 23/09/2026. A referência dos dados é 21/09/2026. Não foi verificada uma versão mais recente no SharePoint.

`acompanhamento.json` preserva as quatro abas da planilha (Unidades, Reunioes, Pessoas e Objetivos). Campos vazios são `null`; nenhum dado ausente é convertido em zero. Não há fórmulas armazenadas no arquivo: DiasDecorridos, DiasDaEtapa, PrazoConsumido e Participacao estão vazios na origem. A interface calcula prazo consumido pelas datas de entrada, referência e virada, e participação por presentes/convocados quando ambos foram apurados e o denominador é positivo.

Os indicadores de objetivos e presença das unidades são os publicados na origem. A média simples das reuniões com EntraNaMediaDePresenca = Sim e presença apurada é 62,96% / 34,76% / 32,69%, arredondando para 63% / 35% / 33%. As médias de cumprimento dos objetivos são 54% / 60% / 38,64%, arredondando para 54% / 60% / 39%.

O HTML original é mantido apenas como arquivo de referência, sem importação pela aplicação. A visão “Relatório completo” é gerada a partir de `acompanhamento.json`, com resumo e seções de objetivos, reuniões e pessoas por unidade. O filtro de unidade também se aplica ao relatório. Não são incluídos diagnósticos ou recomendações do HTML. As datas de referência e etapas exibidas vêm dos dados de cada unidade; o campo de treinamento continua específico de 21/09, conforme a coluna da planilha.

A aba fica em `/kartado/acompanhamento-eco`, dentro da navegação existente. Não depende da API Kartado. Atualizações exigem substituir os dados importados em `acompanhamento.json`; o relatório passa a refletir esses mesmos dados sem editar HTML. Esta versão não inclui importação de Excel pela interface nem sincronização automática com o SharePoint.
