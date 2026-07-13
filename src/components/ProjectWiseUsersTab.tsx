import { PanelShell } from '@/components/PanelShell';
import { ProjectWiseUserKpiCard } from '@/components/ProjectWiseUserKpiCard';
import type { ProjectWiseUserRow, ProjectWiseWebUserRow } from '@/types/monitoring';
import {
  getProjectWiseUsersSummary,
  getProjectWiseWebUsersSummary,
} from '@/utils/projectWiseUsersKpis';

interface ProjectWiseUsersTabProps {
  explorerRows: ProjectWiseUserRow[];
  webRows: ProjectWiseWebUserRow[];
}

export function ProjectWiseUsersTab({
  explorerRows,
  webRows,
}: ProjectWiseUsersTabProps) {
  const explorerSummary = getProjectWiseUsersSummary(explorerRows);
  const webSummary = getProjectWiseWebUsersSummary(webRows);
  const portalActiveUsers = webSummary.totalUsers - webSummary.inactiveOver180Days;

  return (
    <div className="flex flex-col gap-6">
      <PanelShell
        title="Resumo das fontes"
        description="Totais, usuários ativos e usuários inativos por fonte importada."
      >
        <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            title="Explorer criados 30 dias"
            value={String(explorerSummary.recentlyCreatedUsers)}
            helperText={`${explorerSummary.recentlyCreatedUsersPercentage} da base Explorer`}
            tone="good"
          />
          <ProjectWiseUserKpiCard
            title="Portal total"
            value={String(webSummary.totalUsers)}
            helperText="Usuários importados do Portal Bentley"
          />
          <ProjectWiseUserKpiCard
            title="Portal ativos"
            value={String(portalActiveUsers)}
            helperText={`${webSummary.recentLoginPercentage} com login em 180 dias ou criado em 30 dias`}
            tone="good"
          />
          <ProjectWiseUserKpiCard
            title="Portal inativos"
            value={String(webSummary.inactiveOver180Days)}
            helperText={`${webSummary.inactiveOver180Percentage} sem login em 180 dias e fora da exceção de 30 dias`}
            tone="warning"
          />
          <ProjectWiseUserKpiCard
            title="PW Web criados 30 dias"
            value={String(webSummary.recentlyCreatedUsers)}
            helperText={`${webSummary.recentlyCreatedUsersPercentage} da base Portal`}
            tone="good"
          />
        </div>
      </PanelShell>
    </div>
  );
}
