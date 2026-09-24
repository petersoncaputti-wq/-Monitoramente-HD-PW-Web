# Acompanhamento Eco

Fonte: cópia local de Acompanhamento_Grupo_Eco_1.xlsx fornecida em 23/09/2026, com referência em 21/09/2026. A aplicação usa acompanhamento.json; o HTML original permanece apenas como referência histórica e não é importado.

A rota /kartado/acompanhamento-eco apresenta um comparativo das três unidades e os detalhes da unidade selecionada. Não há análise por IA, chamadas pagas ou uma aba de relatório duplicada.

Regras da exibição:
- Pendentes: cumprimento abaixo de 100%, sem alterar a situação da fonte, inclusive quando o texto e o percentual divergem.
- Parados ou aguardando: pendentes com essas situações registradas na planilha.
- Prazo vencido: situação explicitamente registrada na fonte, identificada como tal no detalhe; ou prazo ISO completo e válido anterior à referência com cumprimento abaixo de 100%. Prazos sem ano e expressões narrativas não geram atraso calculado.
- Agenda: registros agendados com data igual ou posterior à referência da unidade, em ordem cronológica. Os demais ficam no histórico, sem duplicação.
- Cobertura de participação: reuniões realizadas marcadas para entrar na média. Uma reunião apurada exige presentes informados e convocados maior que zero. Zero presentes é válido; campos ausentes não viram zero.
- Indicadores de objetivos e presença no comparativo são os publicados na planilha.
- Participantes e detalhes de objetivos são expansíveis. A busca de participantes ignora acentos.
- Impressão/PDF usa a visão atual, a unidade, os filtros e os detalhes expandidos. A navegação do portal é ocultada na impressão.

As datas de referência permanecem visíveis para não apresentar registros históricos como atuais. Não há comparação de evolução, pois existe apenas uma versão da base. Não há sincronização automática com SharePoint nem importação pela interface; atualizações exigem substituir acompanhamento.json. O campo de treinamento é específico de 21/09, conforme a coluna de origem.

Navegação: a aba inicial Visão do grupo contém comparativo, contagens de pendências com acesso direto aos filtros e agenda consolidada. Capixaba, Raposo Castello e Noroeste Paulista possuem abas próprias com os registros detalhados. Apenas a aba ativa é renderizada e impressa. As abas suportam setas, Home e End.
