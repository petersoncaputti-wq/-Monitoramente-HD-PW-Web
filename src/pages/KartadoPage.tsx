export function KartadoPage() {
  return (
    <section className="mt-6 rounded-[28px] border border-brand-100 bg-white px-6 py-7 shadow-soft md:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
        Sistema Kartado
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-surface-900 md:text-3xl">
        Painel de auditoria Kartado
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-surface-700 md:text-base">
        Esta área receberá, de forma integrada ao portal, os indicadores de usuários,
        concessões, apontamentos, saúde, score, Data Lake e Agente IA.
      </p>

      <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/70 p-5">
        <p className="text-sm font-semibold text-surface-900">Integração em preparação</p>
        <p className="mt-2 text-sm leading-6 text-surface-700">
          O acesso já utiliza a sessão autenticada do portal. As conexões do Kartado serão
          incorporadas ao backend existente nas próximas etapas, sem expor credenciais no navegador.
        </p>
      </div>
    </section>
  );
}
