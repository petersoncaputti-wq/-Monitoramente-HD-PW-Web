import XLSX from 'xlsx';
import { unzipSync } from 'fflate';

const clean = value => String(value ?? '').trim();
const header = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const statuses = { Closed: 'Fechado', Resolved: 'Resolvido', Pending: 'Pendente', Queued: 'Na fila' };
function date(value, date1904) {
  if (!clean(value)) return '';
  if (typeof value !== 'number') throw new Error('Datas devem ser células de data do Excel.');
  const d = XLSX.SSF.parse_date_code(value, { date1904 });
  if (!d || d.y < 2000 || d.y > 2100) throw new Error('Data inválida no relatório.');
  const pad = n => String(n).padStart(2, '0');
  return `${d.y}-${pad(d.m)}-${pad(d.d)}T${pad(d.H)}:${pad(d.M)}:${pad(Math.floor(d.S))}`;
}

export function parseTotvsXlsx(buffer, scope = 'mentions') {
  if (!['mentions', 'all'].includes(scope)) throw new Error('Recorte inválido.');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('Selecione um XLSX de até 10 MB.');
  let expanded = 0, entries = 0;
  unzipSync(buffer, { filter: entry => {
    expanded += entry.originalSize; entries++;
    if (expanded > 30 * 1024 * 1024 || entries > 200) throw new Error('XLSX excede o limite de conteúdo.');
    return false;
  } });
  const book = XLSX.read(buffer, { type: 'buffer' });
  if (book.SheetNames.length !== 1) throw new Error('O relatório deve conter uma única aba.');
  const matrix = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
  const headers = (matrix.shift() ?? []).map(header);
  const required = ['id do ticket', 'data de criacao', 'data de resolucao', 'status', 'descricao', 'atribuir ao grupo'];
  if (required.some(name => !headers.includes(name)) || new Set(headers).size !== headers.length) throw new Error('Cabeçalhos incompatíveis com o relatório detalhado.');
  const records = [], ids = new Set();
  for (const [index, cells] of matrix.entries()) {
    if (cells.every(v => !clean(v))) continue;
    const get = name => cells[headers.indexOf(name)] ?? '';
    const id = clean(get('id do ticket'));
    // Jasper export includes a final numeric total, not a ticket.
    if (index === matrix.length - 1 && typeof get('id do ticket') === 'number' && cells.slice(1).every(v => !clean(v))) continue;
    if (!/^\d+-\d+$/.test(id)) throw new Error(`ID inválido na linha ${index + 2}.`);
    if (ids.has(id)) throw new Error(`ID duplicado na linha ${index + 2}.`);
    ids.add(id);
    const opened = date(get('data de criacao'), book.Workbook?.WBProps?.date1904);
    const closed = date(get('data de resolucao'), book.Workbook?.WBProps?.date1904);
    if (!opened || !clean(get('status'))) throw new Error(`Abertura ou status ausente na linha ${index + 2}.`);
    if (closed && closed < opened) throw new Error(`Resolução anterior à abertura na linha ${index + 2}.`);
    const matches = /\b(totvs|tcop)\b/i.test(['descricao', 'detalhes', 'cause', 'resolucao'].map(name => clean(get(name))).join(' '));
    if (scope === 'mentions' && !matches) continue;
    records.push({
      'Caso n.º': id, Status: statuses[clean(get('status'))] ?? clean(get('status')),
      Abertoem: opened, Fechadoem: closed, Atualizado: '',
      Resumo: clean(get('descricao')), Motivo: clean(get('cause')), Tipodeticket: '',
      Prioridade: clean(get('prioridade')), Solicitante: clean(get('solicitante')),
      Organizaçãodosolicitante: clean(get('organizacao do solicitante')),
      Organizaçãodobeneficiário: clean(get('organizacao do solicitante')),
      Grupoatribuído: clean(get('atribuir ao grupo')), AgenteAtribuído: clean(get('resolvido por')),
      Atribuído: '', Solicitadopara: '', StatusdoSLA: '',
    });
  }
  if (!records.length) throw new Error('Nenhum chamado encontrado no recorte escolhido.');
  const latest = records.map(r => r.Abertoem).sort().at(-1);
  return { kind: 'detailed', scope, sourceCount: ids.size, reportPeriod: latest.slice(0, 7),
    sourceUpdatedAt: new Date().toISOString(), lists: { categories: [] }, tickets: records };
}
