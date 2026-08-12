const DEFAULT_TEAMS_AGENT_URL =
  'https://teams.microsoft.com/l/app/?source=agent-details-page&sharedAppResource=TaosSharedApp&titleId=T_2a558888-08cb-4cfa-dc1d-4089d17e6e39';

export function FloatingAgentButton() {
  const teamsAgentUrl =
    import.meta.env.VITE_TEAMS_AGENT_URL?.trim() || DEFAULT_TEAMS_AGENT_URL;

  return (
    <a
      href={teamsAgentUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Conversar com Pedro no Microsoft Teams"
      title="Conversar com Pedro"
      className="group fixed bottom-5 right-4 z-50 flex items-center gap-2 rounded-full border border-brand-200 bg-white p-1.5 pr-2 shadow-panel transition duration-200 hover:-translate-y-1 hover:border-brand-400 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-brand-200 sm:bottom-7 sm:right-7 sm:p-2 sm:pr-4"
    >
      <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-50 sm:h-20 sm:w-20">
        <img
          src="/images/agente-engenharia.png"
          alt=""
          className="h-[115%] w-[115%] object-contain transition duration-200 group-hover:scale-105"
        />
      </span>
      <span className="hidden pr-1 text-left sm:block">
        <strong className="block text-sm font-semibold text-surface-900">Pedro</strong>
        <span className="block text-xs text-surface-700">Conversar no Teams</span>
      </span>
    </a>
  );
}
