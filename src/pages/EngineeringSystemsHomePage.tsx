import { Link } from 'react-router-dom';

export function EngineeringSystemsHomePage() {
  return (
    <section className="mt-6">
      <div className="rounded-[28px] border border-brand-100 bg-white px-6 py-7 shadow-soft md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">
          Sistemas de Engenharia
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-surface-900 md:text-3xl">
          Selecione um sistema
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-700 md:text-base">
          Acesse os indicadores operacionais e gerenciais de cada plataforma.
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            to="/projectwise/armazenamento"
            className="group flex min-h-56 flex-col rounded-[26px] border border-brand-100 bg-brand-50/50 p-6 transition hover:-translate-y-1 hover:border-brand-300 hover:bg-white hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-lg font-bold text-white shadow-soft">
              PW
            </div>
            <h3 className="mt-6 text-xl font-semibold text-surface-900">ProjectWise</h3>
            <p className="mt-2 text-sm leading-6 text-surface-700">
              Armazenamento, usuários, chamados e indicadores operacionais do ProjectWise.
            </p>
            <span className="mt-auto pt-5 text-sm font-semibold text-brand-700 transition group-hover:text-brand-900">
              Acessar indicadores →
            </span>
          </Link>

          <Link
            to="/kartado"
            className="group flex min-h-56 flex-col rounded-[26px] border border-brand-100 bg-brand-50/50 p-6 transition hover:-translate-y-1 hover:border-brand-300 hover:bg-white hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-700 text-lg font-bold text-white shadow-soft">
              KA
            </div>
            <h3 className="mt-6 text-xl font-semibold text-surface-900">Kartado</h3>
            <p className="mt-2 text-sm leading-6 text-surface-700">
              Auditoria de usuários, concessões, apontamentos, saúde e integrações do Kartado.
            </p>
            <span className="mt-auto pt-5 text-sm font-semibold text-brand-700 transition group-hover:text-brand-900">
              Acessar painel →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
