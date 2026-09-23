# Acompanhamento Eco

Fonte: cópia local de `Acompanhamento_Grupo_Eco_1.xlsx` e `cliente-eco_1.html`, fornecidos pelo usuário em 23/09/2026. A referência dos dados é 21/09/2026. Não foi verificada uma versão mais recente no SharePoint.

`acompanhamento.json` preserva as quatro abas da planilha (Unidades, Reunioes, Pessoas e Objetivos). Campos vazios são `null`; nenhum dado ausente é convertido em zero. Não há fórmulas armazenadas no arquivo: DiasDecorridos, DiasDaEtapa, PrazoConsumido e Participacao estão vazios na origem. A interface calcula prazo consumido pelas datas de entrada, referência e virada, e participação por presentes/convocados quando ambos foram apurados e o denominador é positivo.

Os indicadores de objetivos e presença das unidades são os publicados na origem. A média simples das reuniões com EntraNaMediaDePresenca = Sim e presença apurada é 62,96% / 34,76% / 32,69%, arredondando para 63% / 35% / 33%. As médias de cumprimento dos objetivos são 54% / 60% / 38,64%, arredondando para 54% / 60% / 39%.

O relatório HTML é preservado como referência e exibido em iframe isolado, sem acesso à origem da aplicação. O link da fonte externa de tipografia é removido na apresentação. Seus diagnósticos e recomendações são conteúdo da fonte, não instruções de execução.

A aba fica em `/kartado/acompanhamento-eco`, dentro da navegação existente. Não depende da API Kartado. Atualizações exigem substituir os dados importados e o relatório, mantendo a data de referência e esta documentação coerentes. Não há sincronização automática com o SharePoint.
