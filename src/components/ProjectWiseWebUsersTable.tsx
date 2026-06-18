import { useMemo, useState } from 'react';
import type { ProjectWiseWebUserRow } from '@/types/monitoring';
import {
  formatProjectWiseDate,
  isProjectWiseWebUserActiveWithin180Days,
} from '@/utils/projectWiseUsersKpis';

interface ProjectWiseWebUsersTableProps {
  rows: ProjectWiseWebUserRow[];
}

function getBooleanBadge(value: unknown, trueLabel: string, falseLabel: string) {
  const isTrue = String(value ?? '').trim().toLowerCase() === 'true';
  const style = isTrue
    ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
    : 'border-brand-100 bg-brand-50 text-brand-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {isTrue ? trueLabel : falseLabel}
    </span>
  );
}

function getLoginStatusBadge(row: ProjectWiseWebUserRow) {
  const isActive = isProjectWiseWebUserActiveWithin180Days(row);
  const style = isActive
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {isActive ? 'Ativo 180d' : 'Inativo 180d'}
    </span>
  );
}

function getFullName(row: ProjectWiseWebUserRow): string {
  return [row.FirstName, row.MiddleName, row.LastName]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function getSearchFields(row: ProjectWiseWebUserRow) {
  return [
    row.Email,
    getFullName(row),
    row['EntitlementGroup(s)'],
    row.ProfileCreationDate,
    formatProjectWiseDate(row.ProfileCreationDate),
    row.LastLoginDate,
    formatProjectWiseDate(row.LastLoginDate),
    isProjectWiseWebUserActiveWithin180Days(row) ? 'Ativo 180d' : 'Inativo 180d',
    row.Locked,
    normalizeSearchValue(row.Locked) === 'true' ? 'Sim' : 'Nao',
    row.MFA,
    normalizeSearchValue(row.MFA) === 'true' ? 'Ativo' : 'Inativo',
  ];
}

function matchesSearchTerm(row: ProjectWiseWebUserRow, searchTerm: string, exactMatch: boolean) {
  const normalizedTerm = normalizeSearchValue(searchTerm);

  if (!normalizedTerm) {
    return true;
  }

  return getSearchFields(row).some((field) => {
    const normalizedField = normalizeSearchValue(field);
    return exactMatch
      ? normalizedField === normalizedTerm
      : normalizedField.includes(normalizedTerm);
  });
}

export function ProjectWiseWebUsersTable({ rows }: ProjectWiseWebUsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [exactMatch, setExactMatch] = useState(false);

  const sortedRows = useMemo(() => {
    const visibleRows = rows.filter((row) => matchesSearchTerm(row, searchTerm, exactMatch));

    return visibleRows.sort((a, b) => {
      const aInactive = isProjectWiseWebUserActiveWithin180Days(a) ? 1 : 0;
      const bInactive = isProjectWiseWebUserActiveWithin180Days(b) ? 1 : 0;

      if (aInactive !== bInactive) {
        return aInactive - bInactive;
      }

      return String(a.Email ?? '').localeCompare(String(b.Email ?? ''), 'pt-BR');
    });
  }, [exactMatch, rows, searchTerm]);

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 px-4 py-12 text-center text-sm text-surface-700">
        Nenhum usuário do Portal Bentley carregado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border bg-white shadow-soft">
      <div className="border-b border-brand-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Lista Portal Bentley
        </p>
        <p className="mt-2 text-sm text-surface-700">
          Usuários sem login recente nos últimos 180 dias aparecem primeiro para validação.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Pesquisar
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Email, nome, entitlement ou situacao"
              className="h-11 rounded-2xl border border-brand-100 bg-brand-50/40 px-3 text-sm text-surface-900 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <button
            type="button"
            onClick={() => setExactMatch((current) => !current)}
            aria-pressed={exactMatch}
            className={`h-11 rounded-2xl border px-4 text-sm font-semibold transition ${
              exactMatch
                ? 'border-brand-700 bg-brand-700 text-white shadow-soft'
                : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'
            }`}
          >
            Termo exato
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setExactMatch(false);
            }}
            disabled={!searchTerm && !exactMatch}
            className="h-11 rounded-2xl border border-brand-100 bg-white px-4 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Limpar
          </button>
        </div>
        {searchTerm ? (
          <p className="mt-3 text-xs font-medium text-surface-600">
            {sortedRows.length} de {rows.length} registros encontrados
          </p>
        ) : null}
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1180px] divide-y divide-brand-100 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-brand-50">
            <tr>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 first:pl-6">
                Email
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Nome
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Entitlement
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Criação
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Último login
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Situação
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Bloqueado
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 last:pr-6">
                MFA
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {sortedRows.map((row, index) => (
              <tr key={`${row.Email}-${index}`} className="transition hover:bg-brand-50/60">
                <td className="max-w-[260px] px-4 py-4 font-medium text-surface-900 first:pl-6">
                  <span className="line-clamp-2">{row.Email || '-'}</span>
                </td>
                <td className="max-w-[240px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{getFullName(row) || '-'}</span>
                </td>
                <td className="max-w-[260px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row['EntitlementGroup(s)'] || '-'}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-surface-900">
                  {formatProjectWiseDate(row.ProfileCreationDate)}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-surface-900">
                  {formatProjectWiseDate(row.LastLoginDate)}
                </td>
                <td className="px-4 py-4">{getLoginStatusBadge(row)}</td>
                <td className="px-4 py-4">{getBooleanBadge(row.Locked, 'Sim', 'Não')}</td>
                <td className="px-4 py-4 last:pr-6">
                  {getBooleanBadge(row.MFA, 'Ativo', 'Inativo')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
