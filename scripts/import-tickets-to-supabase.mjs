import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function readEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const values = {};
  const content = readFileSync(path, 'utf-8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, '');
  }

  return values;
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));
}

function valueOf(row, ...keys) {
  for (const key of keys) {
    const value = row[normalizeKey(key)];

    if (String(value ?? '').trim()) {
      return value;
    }
  }

  return '';
}

function text(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed
      ? new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))
      : null;
  }

  const valueText = String(value).trim();
  const brMatch = valueText.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (brMatch) {
    const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = brMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
    );
  }

  const parsed = new Date(valueText);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateIso(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function readTicketRows(filePath) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: true,
  });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  return XLSX.utils
    .sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: true })
    .map(normalizeRow)
    .filter((row) => Object.values(row).some((value) => String(value ?? '').trim()));
}

function mapTicket(row) {
  const openedAt = dateIso(valueOf(row, 'Abertoem', 'Aberto em'));

  if (!openedAt) {
    throw new Error(
      `Chamado sem data de abertura valida: ${
        text(valueOf(row, 'Cason', 'Caso n.º', 'Caso')) ?? text(row.resumo) ?? '-'
      }`,
    );
  }

  return {
    assigned_agent: text(valueOf(row, 'AgenteAtribuido', 'Agente Atribuído')),
    assigned_group: text(valueOf(row, 'Grupoatribuido', 'Grupo atribuído')),
    assigned_to: text(valueOf(row, 'Atribuido', 'Atribuído')),
    beneficiary_organization: text(
      valueOf(row, 'Organizacaodobeneficiario', 'Organização do beneficiário'),
    ),
    case_number: text(valueOf(row, 'Cason', 'Caso n.º', 'Caso')),
    closed_at: dateIso(valueOf(row, 'Fechadoem', 'Fechado em')),
    opened_at: openedAt,
    priority: text(valueOf(row, 'Prioridade')),
    reason: text(valueOf(row, 'Motivo')),
    requested_for: text(valueOf(row, 'Solicitadopara', 'Solicitado para')),
    requester: text(valueOf(row, 'Solicitante')),
    requester_organization: text(
      valueOf(row, 'Organizacaodosolicitante', 'Organização do solicitante'),
    ),
    sla_status: text(valueOf(row, 'StatusdoSLA', 'Status do SLA')),
    status: text(valueOf(row, 'Status')) ?? 'Novo',
    ticket_type: text(valueOf(row, 'Tipodeticket', 'Tipo de ticket')),
    updated_at: dateIso(valueOf(row, 'Atualizado', 'Atualizado em')),
  };
}

async function supabaseRequest(env, path, options = {}) {
  const baseUrl = env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !serviceKey) {
    throw new Error('Configure VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(details || `Erro HTTP ${response.status} ao chamar Supabase.`);
  }

  return response.json();
}

async function importTickets(env, rows) {
  const withCaseNumber = rows.filter((row) => row.case_number);
  const withoutCaseNumber = rows.filter((row) => !row.case_number);
  let imported = 0;

  if (withCaseNumber.length > 0) {
    const result = await supabaseRequest(env, '/rest/v1/tickets?on_conflict=case_number', {
      body: JSON.stringify(withCaseNumber),
      method: 'POST',
    });
    imported += result.length;
  }

  if (withoutCaseNumber.length > 0) {
    const result = await supabaseRequest(env, '/rest/v1/tickets', {
      body: JSON.stringify(withoutCaseNumber),
      headers: { Prefer: 'return=representation' },
      method: 'POST',
    });
    imported += result.length;
  }

  return imported;
}

async function main() {
  const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const env = readEnvFile(resolve(rootDir, '.env.local'));
  const sourcePath = resolve(process.argv[2] ?? resolve(rootDir, 'public', 'dados', 'chamados.xlsx'));

  if (!existsSync(sourcePath)) {
    throw new Error(`Arquivo nao encontrado: ${sourcePath}`);
  }

  const rows = readTicketRows(sourcePath).map(mapTicket);
  const imported = await importTickets(env, rows);

  console.log(
    JSON.stringify(
      {
        imported,
        rowsRead: rows.length,
        sourcePath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
