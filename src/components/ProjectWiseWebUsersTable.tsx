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

export function ProjectWiseWebUsersTable({ rows }: ProjectWiseWebUsersTableProps) {
  const sortedRows = [...rows].sort((a, b) => {
    const aInactive = isProjectWiseWebUserActiveWithin180Days(a) ? 1 : 0;
    const bInactive = isProjectWiseWebUserActiveWithin180Days(b) ? 1 : 0;

    if (aInactive !== bInactive) {
      return aInactive - bInactive;
    }

    return String(a.Email ?? '').localeCompare(String(b.Email ?? ''), 'pt-BR');
  });

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
