import XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
const template = JSON.parse(readFileSync(new URL('../../src/data/kartado-eco/acompanhamento.json', import.meta.url), 'utf8'));
const numeric = new Set(['ObjetivosCumpridos','PresencaMedia','ItensInventario','Convocados','Presentes','Presencas','Convocacoes','Cumprimento']);
const nullable = new Set(['Convocados','Presentes']);
const percentages = new Set(['ObjetivosCumpridos','PresencaMedia','Cumprimento']);
const dates = new Set(['DataReferencia','EntradaNaEtapa','DataVirada','Data']);
const optional = new Set(['DiasDecorridos','DiasDaEtapa','PrazoConsumido','Participacao','Frente','NoTreinamento21_09']);
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function parseEcoWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('Envie um Excel .xlsx de até 5 MB.');
  let workbook;
  try { workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, sheetRows: 10002 }); }
  catch { throw new Error('Não foi possível ler o arquivo Excel.'); }
  const payload = {};
  for (const [name, example] of Object.entries(template)) {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`Aba obrigatória ausente: ${name}.`);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (rows.length > 10001) throw new Error(`${name}: limite de 10.000 registros.`);
    const headers = (rows.shift() || []).map(value => String(value ?? '').trim());
    const keys = Object.keys(example[0]);
    for (const key of keys.filter(key => !optional.has(key))) {
      if (headers.filter(header => header === key).length !== 1) throw new Error(`${name}: coluna ${key} ausente ou duplicada.`);
    }
    payload[name] = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.some(value => value !== null && value !== '')).map(({ row, index }) => {
      const result = {};
      for (const key of keys) {
        let value = row[headers.indexOf(key)] ?? null;
        const fail = message => { throw new Error(`${name}, linha ${index + 2}, ${key}: ${message}`); };
        if (dates.has(key)) {
          if (value instanceof Date) value = value.toISOString().slice(0,10);
          else if (typeof value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(value.trim())) value = value.trim().split('/').reverse().join('-');
          if (!validDate(String(value))) fail('use uma data válida.');
        } else if (numeric.has(key)) {
          if ((value === null || value === '') && nullable.has(key)) { result[key] = null; continue; }
          if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail('use um número não negativo.');
          if (percentages.has(key) && value > 1) fail('use percentual do Excel entre 0% e 100%.');
          if (!percentages.has(key) && !Number.isInteger(value)) fail('use um número inteiro.');
        } else if (optional.has(key) && !['Frente','NoTreinamento21_09'].includes(key)) {
          value = null; // Derived values are calculated by the dashboard.
        } else {
          if (value instanceof Date && key === 'Prazo') value = value.toISOString().slice(0,10);
          value = String(value ?? '').trim();
          if (!value && !optional.has(key)) fail('campo obrigatório.');
          if (value.length > 4000) fail('texto muito longo.');
        }
        result[key] = value;
      }
      return result;
    });
  }
  const names = payload.Unidades.map(row => row.Unidade);
  if (!names.length || new Set(names).size !== names.length) throw new Error('Unidades deve conter nomes únicos e pelo menos uma unidade.');
  for (const unit of payload.Unidades) if (unit.EntradaNaEtapa > unit.DataVirada) throw new Error(`${unit.Unidade}: entrada posterior à virada.`);
  for (const name of ['Reunioes','Objetivos','Pessoas']) for (const row of payload[name]) {
    if (!names.includes(row.Unidade)) throw new Error(`${name}: unidade desconhecida ${row.Unidade}.`);
  }
  for (const row of payload.Reunioes) {
    if (!['Realizada','Agendada'].includes(row.Status)) throw new Error('Reunioes: Status deve ser Realizada ou Agendada.');
    if (!['Sim','Nao','Não'].includes(row.EntraNaMediaDePresenca)) throw new Error('Reunioes: EntraNaMediaDePresenca deve ser Sim ou Nao.');
  }
  return payload;
}
