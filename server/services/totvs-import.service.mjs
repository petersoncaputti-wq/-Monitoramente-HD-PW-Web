import { unzipSync } from 'fflate';

export const normalizeName = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function selectTotvsPayload(parsed) {
  return {
    reportPeriod: parsed.reportPeriod,
    sourceUpdatedAt: parsed.sourceUpdatedAt,
    lists: { categories: parsed.lists.categories.filter(row => /(^|[^a-z0-9])totvs(?=$|[^a-z0-9])/i.test(row.label)) },
  };
}

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('Aspas inválidas no CSV.');
    } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {
      row.push(cell); cell = '';
      if (char !== ',') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      }
    } else cell += char;
  }
  if (quoted) throw new Error('CSV contém aspas sem fechamento.');
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const names = {
  monthly: 'Serviço_Selecionado_-_Detalhado_Item_de_Catálogo_.csv',
  opened: 'Serviço_Selecionado_Abertos_Evolução_Mensal_v2.csv',
  closed: 'Serviço_Selecionado_Fechados_-_Evolução_Mensal_v2.csv',
  sla: 'Atendimento_no_Prazo_Global_-_Evolução_Mensal_v2.csv',
  tms: 'Serviço_Selecionado_Fechados_-_TMS_Mensal_v2.csv',
  satisfaction: 'Satisfação_Global_-_Evolução_Mensal.csv',
  abstention: 'Abstenção_Global_-_Evolução_Mensal.csv',
  backlogCompany: 'Serviço_Selecionado_-_BACKLOG_ATUAL_POR_EMPRESA_-_Detalhado_Item_de_Catálogo_.csv',
  backlogGroup: 'Serviço_Selecionado_-_BACKLOG_ATUAL_POR_GRUPO_-_Detalhado_Item_de_Catálogo_.csv',
  aging: 'Chamados_pendentes_por_idade_vs_status.csv',
  categories: 'Serviço_Selecionado_Abertos_-_Top_10_CCTI.csv',
  requesters: 'Serviço_Selecionado_Abertos_-_Top_10_Solicitantes.csv',
  companyOpened: 'Serviço_Selecionado_Abertos_-_Por_Empresa_v2.csv',
  companyClosed: 'Serviço_Selecionado_Fechados_-_Por_Empresa_v2.csv',
  directorate: 'Chamados_abertos_por_diretoria.csv',
  management: 'Chamados_abertos_por_gerencia.csv',
  dailyOpened: 'Serviço_Selecionado_Abertos_-_Volume_Diário_v2.csv',
  dailyClosed: 'Serviço_Selecionado_Fechados_-_Volume_Diário_v2.csv',
  companySla: 'Atendimento_no_Prazo_-_Mensal_por_empresa_organização_v2.csv',
  companyTms: 'Tempo_de_Atendimento_Médio_Horas_-_Empresas.csv',
  slaSummary: 'TB_SLA_vs_grupo_vs_analista_resolução_v2.csv',
};
const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthKey(value) {
  const match = /^(\w{3}) (\d{4})$/.exec(value);
  const index = match ? months.indexOf(match[1]) : -1;
  if (index < 0) throw new Error(`Período não reconhecido: ${value}`);
  return `${match[2]}-${String(index + 1).padStart(2, '0')}`;
}
function number(value) {
  if (value === undefined || value.trim() === '') throw new Error('Valor numérico ausente.');
  const result = Number(value.replace('%', '').replace(',', '.'));
  if (!Number.isFinite(result) || result < 0) throw new Error(`Valor numérico inválido: ${value}`);
  return result;
}

export function parseTotvsZip(buffer, reportPeriod) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(reportPeriod)) throw new Error('Informe o mês e ano selecionados na exportação.');
  if (buffer.length > 10 * 1024 * 1024) throw new Error('O ZIP deve ter no máximo 10 MB.');
  let size = 0, count = 0;
  const files = unzipSync(new Uint8Array(buffer), { filter(entry) {
    count++; size += entry.originalSize;
    if (count > 100 || size > 20 * 1024 * 1024) throw new Error('O conteúdo do ZIP excede o limite de 100 arquivos / 20 MB.');
    return /\.csv$/i.test(entry.name);
  }});
  const tables = new Map(); const inventory = [];
  for (const [path, bytes] of Object.entries(files)) {
    const name = path.split(/[\\/]/).pop();
    const key = normalizeName(name);
    if (tables.has(key)) throw new Error(`Arquivo duplicado: ${name}`);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); }
    const rows = parseCsv(text);
    // Exported blank headers (",") are discarded by parseCsv; named headers remain.
    if (text.replace(/^\uFEFF/, '').split(/\r?\n/)[0].replace(/,/g, '').trim()) rows.shift();
    tables.set(key, rows);
    inventory.push({ name, rows: rows.length });
  }
  const table = (key) => tables.get(normalizeName(names[key])) ?? [];
  if (!table('monthly').length && !(table('opened').length && table('closed').length)) {
    throw new Error('ZIP sem os arquivos de evolução mensal de chamados.');
  }
  const source = tables.get(normalizeName('Status_cargas.csv'))?.[0]?.[0];
  if (!source || !/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(source)) throw new Error('Status_cargas.csv ausente ou sem data válida.');
  const sourceUpdatedAt = `${source.slice(6,10)}-${source.slice(3,5)}-${source.slice(0,2)}T${source.slice(11)}`;
  const byMonth = new Map();
  function month(value) {
    const key = monthKey(value);
    if (!byMonth.has(key)) byMonth.set(key, { period: key });
    return byMonth.get(key);
  }
  if (table('monthly').length) {
    for (const row of table('monthly')) {
      const key = row[2] === 'Abertos' ? 'opened' : row[2] === 'Encerrados' ? 'closed' : null;
      if (!key) throw new Error('Tipo desconhecido na evolução mensal.');
      const item = month(row[0]); item[key] = (item[key] ?? 0) + number(row[1]);
    }
  } else {
    for (const row of table('opened')) if (row[3] === 'Real') {
      const item = month(row[0]); item.opened = (item.opened ?? 0) + number(row[1]);
    }
    for (const row of table('closed')) month(row[0]).closed = number(row[1]);
  }
  for (const row of table('sla')) {
    if (!['Dentro do SLA', 'Fora do SLA'].includes(row[1])) throw new Error('Categoria de SLA desconhecida.');
    const item = month(row[0]), key = row[1] === 'Dentro do SLA' ? 'inSla' : 'outSla';
    item[key] = (item[key] ?? 0) + number(row[2]);
  }
  for (const row of table('tms')) month(row[0]).tms = number(row[1]);
  for (const key of ['satisfaction', 'abstention']) for (const row of table(key)) {
    const value = number(row[0]);
    if (value > 100) throw new Error('Percentual acima de 100%.');
    month(row[1])[key] = value;
  }
  const series = [...byMonth.values()].sort((a,b) => a.period.localeCompare(b.period));
  if (!series.some((row) => row.period === reportPeriod && row.opened !== undefined)) throw new Error('O período informado não consta na evolução de aberturas.');
  const lists = {};
  const layouts = {
    backlogCompany: [1,0], backlogGroup: [1,0], aging: [2,0], categories: [1,0], requesters: [1,0],
    companyOpened: [0,1], companyClosed: [0,1], directorate: [0,1], management: [1,0],
    dailyOpened: [0,1], dailyClosed: [0,1], companyTms: [0,1],
  };
  for (const [key, [label, value]] of Object.entries(layouts)) lists[key] = table(key).map(row => ({ label: row[label] || 'Não informado', count: number(row[value]) }));
  const statuses = new Map();
  for (const row of table('aging')) statuses.set(row[1], (statuses.get(row[1]) ?? 0) + number(row[0]));
  lists.status = [...statuses].map(([label,count]) => ({ label,count }));
  const warnings = [];
  const sum = (key) => lists[key].reduce((total,row) => total + row.count, 0);
  if (lists.backlogCompany.length && lists.backlogGroup.length && sum('backlogCompany') !== sum('backlogGroup')) warnings.push(`Backlog divergente: ${sum('backlogCompany')} por empresa e ${sum('backlogGroup')} por grupo. Não há um total conciliado.`);
  if (lists.aging.length && lists.backlogGroup.length && sum('aging') !== sum('backlogGroup')) warnings.push('Pendências por idade e por grupo têm totais diferentes.');
  const selected = byMonth.get(reportPeriod);
  for (const [key, metric] of [['companyOpened','opened'],['dailyOpened','opened'],['companyClosed','closed'],['dailyClosed','closed']]) {
    if (lists[key].length && selected[metric] !== undefined && sum(key) !== selected[metric]) warnings.push(`${names[key]} soma ${sum(key)}, mas a série mensal informa ${selected[metric]} para ${reportPeriod}. Confira o período/filtro exportado.`);
  }
  for (const row of table('slaSummary')) if (row[0] !== 'Resumo Geral:' && monthKey(row[0]) === reportPeriod && selected.tms !== undefined && number(row[4]) !== selected.tms) warnings.push(`Tempo médio divergente em ${reportPeriod}: ${selected.tms} na série mensal e ${row[4]} na tabela de SLA. Unidade e critério precisam ser confirmados.`);
  const missing = Object.entries(names).filter(([,name]) => !tables.has(normalizeName(name))).map(([,name]) => name);
  if (missing.length) warnings.push(`Arquivos ausentes (${missing.length}): ${missing.join('; ')}`);
  warnings.push('Sem base individual: mediana, faixas de tempo de solução, reaberturas e detalhes dos chamados não estão disponíveis.');
  return { reportPeriod, sourceUpdatedAt, series, lists, warnings, inventory };
}
