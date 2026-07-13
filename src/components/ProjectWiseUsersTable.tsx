import { useMemo, useState } from 'react';
import type { ProjectWiseUserRow } from '@/types/monitoring';
import { formatProjectWiseDate } from '@/utils/projectWiseUsersKpis';

interface ProjectWiseUsersTableProps {
  rows: ProjectWiseUserRow[];
}

function getStatusBadge(status: unknown) {
  const value = String(status ?? '').trim() || '-';
  const style =
    value === 'Ativo'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === 'Inativo'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-surface-200 bg-surface-100 text-surface-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {value}
    </span>
  );
}

function getEligibilityBadge(value: unknown) {
  const label = String(value ?? '').trim() || '-';
  const style =
    label === 'Sim'
      ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
      : 'border-brand-100 bg-brand-50 text-brand-700';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function getSearchFields(row: ProjectWiseUserRow) {
  return [
    row.ID,
    row.Nome,
    row.Email,
    row.Datacriacao,
    row.Descricao,
    row.Ultimoacesso,
    formatProjectWiseDate(row.Ultimoacesso),
    row.Status,
    row.Elegivelexclusao,
    row.Motivo,
    row.Resultado,
  ];
}

function matchesSearchTerm(row: ProjectWiseUserRow, searchTerm: string, exactMatch: boolean) {
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

export function ProjectWiseUsersTable({ rows }: ProjectWiseUsersTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [exactMatch, setExactMatch] = useState(false);

  const sortedRows = useMemo(() => {
    const visibleRows = rows.filter((row) => matchesSearchTerm(row, searchTerm, exactMatch));

    return visibleRows.sort((a, b) => {
      const aEligible = String(a.Elegivelexclusao ?? '').trim() === 'Sim' ? 0 : 1;
      const bEligible = String(b.Elegivelexclusao ?? '').trim() === 'Sim' ? 0 : 1;

      if (aEligible !== bEligible) {
        return aEligible - bEligible;
      }

      return String(a.Nome ?? '').localeCompare(String(b.Nome ?? ''), 'pt-BR');
    });
  }, [exactMatch, rows, searchTerm]);

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-brand-100 bg-brand-50/50 px-4 py-12 text-center text-sm text-surface-700">
        Nenhum usuário ProjectWise carregado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[28px] border bg-white shadow-soft">
      <div className="border-b border-brand-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Lista operacional
        </p>
        <p className="mt-2 text-sm text-surface-700">
          Usuários elegíveis para exclusão aparecem primeiro para facilitar a tratativa.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
          <label className="flex flex-col gap-2 text-sm font-medium text-surface-700">
            Pesquisar
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Nome, email, status ou motivo"
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
                Nome
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Email
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Criado em
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Descrição
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Último acesso
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Status
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Elegível
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                Motivo
              </th>
              <th className="px-4 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700 last:pr-6">
                Resultado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-50">
            {sortedRows.map((row, index) => (
              <tr key={`${row.ID}-${row.Email}-${index}`} className="transition hover:bg-brand-50/60">
                <td className="max-w-[220px] px-4 py-4 font-medium text-surface-900 first:pl-6">
                  <span className="line-clamp-2">{row.Nome || '-'}</span>
                </td>
                <td className="max-w-[260px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row.Email || '-'}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-surface-900">
                  {formatProjectWiseDate(row.Datacriacao)}
                </td>
                <td className="max-w-[220px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row.Descricao || '-'}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-surface-900">
                  {formatProjectWiseDate(row.Ultimoacesso)}
                </td>
                <td className="px-4 py-4">{getStatusBadge(row.Status)}</td>
                <td className="px-4 py-4">{getEligibilityBadge(row.Elegivelexclusao)}</td>
                <td className="max-w-[300px] px-4 py-4 text-surface-700">
                  <span className="line-clamp-2">{row.Motivo || '-'}</span>
                </td>
                <td className="max-w-[220px] px-4 py-4 text-surface-700 last:pr-6">
                  <span className="line-clamp-2">{row.Resultado || '-'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

