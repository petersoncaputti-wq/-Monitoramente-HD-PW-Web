import { useState } from 'react';
import { PanelShell } from '@/components/PanelShell';
import { ProjectWiseUserKpiCard } from '@/components/ProjectWiseUserKpiCard';
import { ProjectWiseUsersTable } from '@/components/ProjectWiseUsersTable';
import { ProjectWiseWebUsersTable } from '@/components/ProjectWiseWebUsersTable';
import type { ProjectWiseUserRow, ProjectWiseWebUserRow } from '@/types/monitoring';
import {
  getProjectWiseUsersComparison,
  getProjectWiseUsersSummary,
  getProjectWiseWebUsersSummary,
} from '@/utils/projectWiseUsersKpis';

type UsersSubtab = 'overview' | 'explorer' | 'web' | 'comparison';

interface ProjectWiseUsersTabProps {
  explorerRows: ProjectWiseUserRow[];
  webRows: ProjectWiseWebUserRow[];
  explorerFileName?: string;
  webFileName?: string;
}

function SourceBadge({ label, fileName }: { label: string; fileName?: string }) {
  return (
    <span className="max-w-[280px] truncate rounded-2xl border border-brand-100 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
      {label}: {fileName ?? 'não carregado'}
    </span>
  );
}

function SubtabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? 'bg-brand-700 text-white shadow-soft'
          : 'text-surface-700 hover:bg-brand-50 hover:text-brand-700'
      }`}
    >
      {label}
    </button>
  );
}

function EmptySourceNotice({ source }: { source: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-brand-100 bg-white px-6 py-12 text-center text-sm text-surface-700 shadow-soft">
      Importe a planilha de {source} para visualizar estes indicadores.
    </div>
  );
}

export function ProjectWiseUsersTab({
  explorerRows,
  webRows,
  explorerFileName,
  webFileName,
}: ProjectWiseUsersTabProps) {
  const [activeSubtab, setActiveSubtab] = useState<UsersSubtab>('overview');
  const explorerSummary = getProjectWiseUsersSummary(explorerRows);
  const webSummary = getProjectWiseWebUsersSummary(webRows);
  const comparison = getProjectWiseUsersComparison(explorerRows, webRows);

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Usuários ProjectWise"
        description="Análise separada para PW Explorer e Portal Bentley, com comparativo por email quando as duas fontes estão carregadas."
        actions={
          <div className="flex flex-col gap-2 xl:flex-row">
            <SourceBadge fileName={explorerFileName} label="PW Explorer" />
            <SourceBadge fileName={webFileName} label="Portal Bentley" />
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 rounded-[24px] border border-brand-100 bg-white p-2">
          <SubtabButton
            active={activeSubtab === 'overview'}
            label="Visão geral"
            onClick={() => setActiveSubtab('overview')}
          />
          <SubtabButton
            active={activeSubtab === 'explorer'}
            label="PW Explorer"
            onClick={() => setActiveSubtab('explorer')}
          />
          <SubtabButton
            active={activeSubtab === 'web'}
            label="Portal Bentley"
            onClick={() => setActiveSubtab('web')}
          />
          <SubtabButton
            active={activeSubtab === 'comparison'}
            label="Comparativo"
            onClick={() => setActiveSubtab('comparison')}
          />
        </div>
      </PanelShell>

      {activeSubtab === 'overview' ? (
        <>
          <PanelShell
            title="Resumo das fontes"
            description="Totais, usuários ativos e usuários inativos por fonte importada."
          >
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ProjectWiseUserKpiCard
                title="PW Explorer total"
                value={String(explorerSummary.totalUsers)}
                helperText="Usuários no PW Explorer"
              />
              <ProjectWiseUserKpiCard
                title="PW Explorer ativos"
                value={String(explorerSummary.activeUsers)}
                helperText={`${explorerSummary.activePercentage} da base Explorer`}
                tone="good"
              />
              <ProjectWiseUserKpiCard
                title="PW Explorer inativos"
                value={String(explorerSummary.inactiveUsers)}
                helperText={`${explorerSummary.inactivePercentage} da base Explorer`}
                tone="attention"
              />
              <ProjectWiseUserKpiCard
                title="Portal total"
                value={String(webSummary.totalUsers)}
                helperText="Usuários importados do Portal Bentley"
              />
              <ProjectWiseUserKpiCard
                title="Portal ativos"
                value={String(webSummary.recentLastLogin)}
                helperText={`${webSummary.recentLoginPercentage} com login em 180 dias`}
                tone="good"
              />
              <ProjectWiseUserKpiCard
                title="Portal inativos"
                value={String(webSummary.inactiveOver180Days)}
                helperText={`${webSummary.inactiveOver180Percentage} sem login em 180 dias`}
                tone="warning"
              />
            </div>
          </PanelShell>

          <PanelShell
            title="Comparativo rápido"
            description="Cruzamento por email entre PW Explorer e Portal Bentley."
            tone="soft"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ProjectWiseUserKpiCard
                title="Nas duas bases"
                value={String(comparison.inBoth)}
                helperText="Emails encontrados no Explorer e no Portal"
                tone="good"
              />
              <ProjectWiseUserKpiCard
                title="Só no Explorer"
                value={String(comparison.explorerOnly)}
                helperText="Emails não encontrados no Portal"
                tone="attention"
              />
              <ProjectWiseUserKpiCard
                title="Só no Portal"
                value={String(comparison.webOnly)}
                helperText="Emails não encontrados no Explorer"
                tone="attention"
              />
              <ProjectWiseUserKpiCard
                title="Elegível e no Portal"
                value={String(comparison.eligibleInExplorerAndPresentOnWeb)}
                helperText="Elegíveis para exclusão ainda presentes no Portal"
                tone="warning"
              />
            </div>
          </PanelShell>
        </>
      ) : null}

      {activeSubtab === 'explorer' ? (
        explorerRows.length > 0 ? (
          <>
            <PanelShell
              title="PW Explorer nativo"
              description="Status, inatividade e elegibilidade para exclusão na base PW Explorer."
            >
              <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ProjectWiseUserKpiCard
                  title="Total de usuários"
                  value={String(explorerSummary.totalUsers)}
                  helperText="Registros lidos na planilha"
                />
                <ProjectWiseUserKpiCard
                  title="Usuários ativos"
                  value={String(explorerSummary.activeUsers)}
                  helperText={`${explorerSummary.activePercentage} da base importada`}
                  tone="good"
                />
                <ProjectWiseUserKpiCard
                  title="Usuários inativos"
                  value={String(explorerSummary.inactiveUsers)}
                  helperText={`${explorerSummary.inactivePercentage} da base importada`}
                  tone="attention"
                />
                <ProjectWiseUserKpiCard
                  title="Elegíveis exclusão"
                  value={String(explorerSummary.eligibleForRemoval)}
                  helperText={`${explorerSummary.removalPercentage} sem uso há 180 dias`}
                  tone="warning"
                />
              </div>
            </PanelShell>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
              <PanelShell
                title="Motivos de elegibilidade"
                description="Principais justificativas registradas para orientar a limpeza de acessos."
                tone="soft"
              >
                {explorerSummary.topReasons.length > 0 ? (
                  <div className="space-y-3">
                    {explorerSummary.topReasons.slice(0, 5).map((item) => (
                      <div
                        key={item.reason}
                        className="rounded-3xl border border-brand-100 bg-white px-5 py-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-medium text-surface-900">{item.reason}</p>
                          <span className="shrink-0 text-lg font-semibold text-brand-700">
                            {item.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-brand-100 bg-white px-4 py-10 text-center text-sm text-surface-700">
                    Nenhum motivo informado na planilha.
                  </div>
                )}
              </PanelShell>

              <PanelShell
                title="Sinais de atenção"
                description="Leituras rápidas para priorizar validações e ações de saneamento."
                tone="soft"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-brand-100 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                      Sem registro de acesso
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-surface-900">
                      {explorerSummary.withoutAccessRecord}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-surface-700">
                      Usuários que nunca tiveram acesso registrado na base importada.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-brand-100 bg-white p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                      Sem email
                    </p>
                    <p className="mt-3 text-3xl font-semibold text-surface-900">
                      {comparison.explorerWithoutEmail}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-surface-700">
                      Registros que não entram no comparativo por email.
                    </p>
                  </div>
                </div>
              </PanelShell>
            </div>

            <ProjectWiseUsersTable rows={explorerRows} />
          </>
        ) : (
          <EmptySourceNotice source="PW Explorer" />
        )
      ) : null}

      {activeSubtab === 'web' ? (
        webRows.length > 0 ? (
          <>
            <PanelShell
              title="Portal Bentley"
              description="Dados de perfil, login, entitlement, bloqueio e MFA do CSV exportado."
            >
              <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <ProjectWiseUserKpiCard
                  title="Total Portal"
                  value={String(webSummary.totalUsers)}
                  helperText="Usuários lidos no CSV"
                />
                <ProjectWiseUserKpiCard
                  title="Usuários ativos"
                  value={String(webSummary.recentLastLogin)}
                  helperText={`${webSummary.recentLoginPercentage} com login recente`}
                  tone="good"
                />
                <ProjectWiseUserKpiCard
                  title="Usuários inativos"
                  value={String(webSummary.inactiveOver180Days)}
                  helperText="Sem LastLoginDate ou acima de 180 dias"
                  tone="warning"
                />
                <ProjectWiseUserKpiCard
                  title="Bloqueados"
                  value={String(webSummary.lockedUsers)}
                  helperText={`${webSummary.mfaEnabled} usuários com MFA ativo`}
                  tone="attention"
                />
              </div>
            </PanelShell>

            <PanelShell
              title="Entitlements"
              description="Leitura rápida dos usuários com entitlement ProjectWise Explorer no Portal Bentley."
              tone="soft"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <ProjectWiseUserKpiCard
                  title="ProjectWise Explorer"
                  value={String(webSummary.explorerEntitlements)}
                  helperText="Usuários com entitlement preenchido para Explorer"
                />
                <ProjectWiseUserKpiCard
                  title="Sem entitlement"
                  value={String(webSummary.totalUsers - webSummary.explorerEntitlements)}
                  helperText="Usuários sem grupo ProjectWise Explorer no CSV"
                  tone="attention"
                />
              </div>
            </PanelShell>

            <ProjectWiseWebUsersTable rows={webRows} />
          </>
        ) : (
          <EmptySourceNotice source="Portal Bentley" />
        )
      ) : null}

      {activeSubtab === 'comparison' ? (
        <PanelShell
          title="Comparativo PW Explorer x Portal Bentley"
          description="Divergências de cadastro identificadas por email entre as duas planilhas."
        >
          <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProjectWiseUserKpiCard
              title="Nas duas bases"
              value={String(comparison.inBoth)}
              helperText="Emails encontrados nas duas fontes"
              tone="good"
            />
            <ProjectWiseUserKpiCard
              title="Só Explorer"
              value={String(comparison.explorerOnly)}
              helperText="Pode indicar ausência no Portal Bentley"
              tone="attention"
            />
            <ProjectWiseUserKpiCard
              title="Só Portal"
              value={String(comparison.webOnly)}
              helperText="Pode indicar ausência no Explorer"
              tone="attention"
            />
            <ProjectWiseUserKpiCard
              title="Elegível no Explorer"
              value={String(comparison.eligibleInExplorerAndPresentOnWeb)}
              helperText="Ainda localizado no Portal Bentley"
              tone="warning"
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-brand-100 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                Só no Explorer
              </p>
              <div className="mt-4 space-y-3">
                {comparison.explorerOnlyRows.slice(0, 6).map((row) => (
                  <p key={`${row.ID}-${row.Email}`} className="truncate text-sm text-surface-700">
                    {row.Email || row.Nome || '-'}
                  </p>
                ))}
                {comparison.explorerOnlyRows.length === 0 ? (
                  <p className="text-sm text-surface-700">Nenhum registro.</p>
                ) : null}
              </div>
            </div>
            <div className="rounded-3xl border border-brand-100 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                Só no Portal
              </p>
              <div className="mt-4 space-y-3">
                {comparison.webOnlyRows.slice(0, 6).map((row) => (
                  <p key={row.Email} className="truncate text-sm text-surface-700">
                    {row.Email || '-'}
                  </p>
                ))}
                {comparison.webOnlyRows.length === 0 ? (
                  <p className="text-sm text-surface-700">Nenhum registro.</p>
                ) : null}
              </div>
            </div>
            <div className="rounded-3xl border border-brand-100 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
                Elegível e no Portal
              </p>
              <div className="mt-4 space-y-3">
                {comparison.eligibleStillOnWebRows.slice(0, 6).map((row) => (
                  <p key={`${row.ID}-${row.Email}`} className="truncate text-sm text-surface-700">
                    {row.Email || row.Nome || '-'}
                  </p>
                ))}
                {comparison.eligibleStillOnWebRows.length === 0 ? (
                  <p className="text-sm text-surface-700">Nenhum registro.</p>
                ) : null}
              </div>
            </div>
          </div>
        </PanelShell>
      ) : null}
    </div>
  );
}
