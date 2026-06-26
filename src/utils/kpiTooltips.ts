export type KpiTooltipKey =
  | 'latestUpdate'
  | 'totalCapacity'
  | 'usedSpace'
  | 'freeSpace'
  | 'usagePercentage'
  | 'periodVariation'
  | 'averageGrowthRate'
  | 'peakUsage'
  | 'lowestFreeSpace'
  | 'twelveMonthForecast'
  | 'daysUntilFull';

const KPI_TOOLTIPS: Record<KpiTooltipKey, { meaning: string; calculation: string }> = {
  latestUpdate: {
    meaning:
      'Mostra a data e a hora do registro mais recente encontrado na planilha importada.',
    calculation:
      'Combinamos as colunas de data e hora de cada linha, validamos os registros e selecionamos o maior instante do período importado.',
  },
  totalCapacity: {
    meaning:
      'Mostra a capacidade total do disco monitorado em GB, usando o valor que melhor representa o conjunto importado.',
    calculation:
      'Lemos todos os valores válidos da coluna TotalGB e escolhemos o valor que mais se repete na planilha, reduzindo o impacto de inconsistências pontuais.',
  },
  usedSpace: {
    meaning:
      'Mostra quanto espaço do disco estava ocupado no registro mais recente importado.',
    calculation:
      'Localizamos o último registro válido por data e hora e exibimos o valor da coluna UsadoGB dessa leitura.',
  },
  freeSpace: {
    meaning:
      'Mostra quanto espaço ainda estava disponível no disco no registro mais recente importado.',
    calculation:
      'Localizamos o último registro válido por data e hora e exibimos o valor da coluna LivreGB dessa leitura.',
  },
  usagePercentage: {
    meaning:
      'Mostra o percentual atual de ocupação do disco no registro mais recente importado.',
    calculation:
      'Usamos primeiro a coluna PercentualUsado do registro mais recente. Se ela não estiver disponível, calculamos pela fórmula UsadoGB / TotalGB x 100.',
  },
  periodVariation: {
    meaning:
      'Mostra quanto o espaço usado variou entre o primeiro e o último registros válidos do período importado.',
    calculation:
      'Aplicamos a fórmula variação = UsadoGB final - UsadoGB inicial. Resultado positivo indica crescimento de uso; resultado negativo indica redução.',
  },
  averageGrowthRate: {
    meaning:
      'Mostra o ritmo médio de crescimento do espaço usado no período importado, com leitura principal em GB por hora e apoio em GB por dia.',
    calculation:
      'Primeiro calculamos a variação do uso: UsadoGB final - UsadoGB inicial. Depois dividimos essa variação pelo total de horas entre o primeiro e o último registro para obter GB/h. A taxa diária é a taxa horária multiplicada por 24.',
  },
  peakUsage: {
    meaning:
      'Mostra o maior volume de espaço usado registrado em todo o histórico importado.',
    calculation:
      'Comparamos todos os valores válidos da coluna UsadoGB e selecionamos o maior deles, exibindo também a data e a hora em que esse pico ocorreu.',
  },
  lowestFreeSpace: {
    meaning:
      'Mostra o menor volume de espaço livre registrado em todo o histórico importado.',
    calculation:
      'Comparamos todos os valores válidos da coluna LivreGB e selecionamos o menor deles, exibindo também a data e a hora em que esse mínimo ocorreu.',
  },
  twelveMonthForecast: {
    meaning:
      'Mostra a projeção de espaço usado para os próximos 12 meses, assumindo que o ritmo médio observado continue igual.',
    calculation:
      'Calculamos a taxa média horária de crescimento e projetamos 12 meses pela fórmula: Usado atual + (taxa horária x 24 x 365).',
  },
  daysUntilFull: {
    meaning:
      'Mostra em quantos dias o disco pode atingir a capacidade máxima, mantendo o ritmo médio atual de crescimento do uso.',
    calculation:
      'Primeiro calculamos o crescimento médio diário: ((UsadoGB final - UsadoGB inicial) / horas decorridas) x 24. Depois aplicamos a fórmula Dias restantes = LivreGB atual / crescimento médio diário.',
  },
};

export function getKpiTooltipText(key: KpiTooltipKey) {
  const tooltip = KPI_TOOLTIPS[key];

  return `O que este indicador mostra: ${tooltip.meaning}\n\nComo o cálculo é feito: ${tooltip.calculation}`;
}

