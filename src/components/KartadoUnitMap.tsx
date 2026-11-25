import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchMapList,
  fetchMapPoints,
  fetchMapSummary,
  initialMapDates,
  requestMapRefresh,
  searchMapClasses,
  type MapFilters,
  type MapList,
  type MapSummary,
  type MapSync,
} from '@/services/kartadoMapService';
import type { LoadPoints } from './KartadoUnitMapCanvas';
import { KartadoReportingDialog } from './KartadoReportingDialog';
const MapCanvas = lazy(() => import('./KartadoUnitMapCanvas'));
const field = 'min-w-0 w-full rounded-xl border border-brand-100 bg-white px-3 py-2.5 text-xs';
const button =
  'rounded-xl border border-brand-200 px-4 py-2.5 text-xs font-semibold text-brand-700 disabled:opacity-40';
const number = (value: number) => value.toLocaleString('pt-BR');
const dateTime = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function syncText(sync: MapSync) {
  const progress = sync.paginasTotal
    ? ` ${number(sync.paginas)} de ${number(sync.paginasTotal)} páginas coletadas.`
    : ' Iniciando a coleta.';
  if (sync.estado === 'em_andamento')
    return sync.atualizadoEm
      ? `Atualizando a base do mapa.${progress} Enquanto isso, o mapa mostra a base de ${dateTime(sync.atualizadoEm)}.`
      : `Preparando a base do mapa pela primeira vez.${progress} As unidades maiores podem levar até meia hora.`;
  if (sync.estado === 'aguardando')
    return 'A base do mapa desta unidade ainda não foi coletada. Ela passou à frente da fila e a coleta começa em até 1 minuto.';
  const next = sync.proximaEm ? ` Próxima atualização automática: ${dateTime(sync.proximaEm)}.` : '';
  if (!sync.atualizadoEm) return `${sync.erro || 'Não foi possível preparar a base do mapa.'}${next}`;
  return `Base do mapa atualizada em ${dateTime(sync.atualizadoEm)}.${next}${sync.erro ? ` ${sync.erro}` : ''}`;
}

export function KartadoUnitMap({ company, name }: { company: string; name: string }) {
  const [initial] = useState(initialMapDates);
  const [dates, setDates] = useState(initial);
  // O mapa abre com o histórico completo, para o calor refletir todos os apontamentos.
  const [allHistory, setAllHistory] = useState(true);
  const [period, setPeriod] = useState({ from: '', to: '' });
  const [status, setStatus] = useState('');
  const [classe, setClasse] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [road, setRoad] = useState('');
  const [summary, setSummary] = useState<MapSummary | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [poll, setPoll] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [list, setList] = useState<MapList | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const filters = useMemo<MapFilters>(
    () => ({ from: period.from, to: period.to, status, classe, rodovia: road }),
    [period.from, period.to, status, classe, road],
  );
  const viewKey = JSON.stringify([company, filters]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    fetchMapSummary(company, filters, controller.signal)
      .then((value) => {
        setSummary(value);
        setError('');
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Mapa indisponível.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [company, filters, poll]);
  // Enquanto a base é coletada, consulta o progresso a cada 10 segundos.
  const collecting = summary?.coleta.estado === 'em_andamento' || summary?.coleta.estado === 'aguardando';
  useEffect(() => {
    if (!collecting) return;
    const timer = setTimeout(() => setPoll((value) => value + 1), 10_000);
    return () => clearTimeout(timer);
  }, [collecting, summary]);
  useEffect(() => {
    setPage(1);
  }, [viewKey]);
  useEffect(() => {
    if (!listOpen) return;
    const controller = new AbortController();
    fetchMapList(company, filters, page, controller.signal)
      .then(setList)
      .catch(() => {
        if (!controller.signal.aborted) setList(null);
      });
    return () => controller.abort();
  }, [company, filters, page, listOpen, summary?.coleta.atualizadoEm]);
  const loadPoints = useCallback<LoadPoints>(
    (bounds, options, signal) => fetchMapPoints(company, filters, bounds, options, signal),
    [company, filters],
  );
  const searchedClasses = searchMapClasses(summary?.options.classes || [], classSearch);
  const classOptions = [...searchedClasses];
  if (classe && !classOptions.includes(classe)) classOptions.unshift(classe);
  const pages = list?.pages || 1;
  const dirty = !allHistory && (dates.from !== period.from || dates.to !== period.to);
  const mapped = summary?.mapped || 0;
  return (
    <section
      className="space-y-4 rounded-2xl border border-brand-100 bg-white p-4 sm:p-5"
      aria-label={`Mapa de apontamentos de ${name}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Mapa dos apontamentos</h3>
          <p className="mt-1 text-xs text-surface-600">
            {name} · use o mapa de calor para localizar concentrações e clique para consultar os apontamentos.
          </p>
        </div>
        <button
          type="button"
          className={button}
          disabled={!summary || collecting}
          onClick={() => {
            setNotice('');
            requestMapRefresh(company)
              .then((value) => {
                setNotice(
                  value.aceito
                    ? 'Atualização da base iniciada. O mapa mostra os dados atuais até a coleta terminar.'
                    : 'A base foi atualizada há poucos minutos ou já está sendo atualizada.',
                );
                setPoll((current) => current + 1);
              })
              .catch((reason) => setNotice(reason instanceof Error ? reason.message : 'Não foi possível atualizar.'));
          }}
        >
          Atualizar mapa
        </button>
      </header>
      {summary ? (
        <p
          aria-live="polite"
          className={`rounded-xl p-3 text-xs leading-5 ${summary.coleta.estado === 'falhou' || summary.coleta.estado === 'incompleta' ? 'bg-amber-50 text-amber-800' : 'bg-brand-50 text-surface-700'}`}
        >
          {syncText(summary.coleta)}
          {notice ? ` ${notice}` : ''}
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-surface-700">
        <input
          type="checkbox"
          checked={allHistory}
          onChange={(event) => {
            const checked = event.target.checked;
            setAllHistory(checked);
            setDates(initial);
            setPeriod(checked ? { from: '', to: '' } : { ...initial });
          }}
        />
        Histórico completo (todas as datas)
      </label>
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (allHistory || dates.from > dates.to) {
            setError('Selecione um período com início anterior ao fim.');
            return;
          }
          setPeriod({ ...dates });
        }}
      >
        <label className="grid gap-1 text-xs text-surface-700">
          Encontrado de
          <input
            type="date"
            disabled={allHistory}
            required
            max={dates.to}
            value={dates.from}
            onChange={(event) => setDates((value) => ({ ...value, from: event.target.value }))}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-surface-700">
          Encontrado até
          <input
            type="date"
            disabled={allHistory}
            required
            min={dates.from}
            value={dates.to}
            onChange={(event) => setDates((value) => ({ ...value, to: event.target.value }))}
            className={field}
          />
        </label>
        <button className={button} type="submit" disabled={!dirty}>
          Aplicar período
        </button>
      </form>
      <p className="text-[11px] text-surface-600">
        Período do mapa:{' '}
        {period.from
          ? `${period.from.split('-').reverse().join('/')} a ${period.to.split('-').reverse().join('/')}`
          : 'histórico completo, sem filtro de data'}{' '}
        · data em que o apontamento foi encontrado. Desmarque o histórico completo para escolher um período.
      </p>
      <div className="grid gap-3 sm:grid-cols-3 sm:items-start">
        <label className="grid gap-1 text-xs text-surface-700">
          Status
          <select className={field} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {(summary?.options.status || []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-surface-700">
            Pesquisar classe
            <input
              type="search"
              className={field}
              value={classSearch}
              onChange={(event) => setClassSearch(event.target.value)}
              placeholder="Digite parte do nome da classe"
            />
          </label>
          <label className="grid gap-1 text-xs text-surface-700">
            Classe
            <select className={field} value={classe} onChange={(event) => setClasse(event.target.value)}>
              <option value="">Todas as classes</option>
              {classOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {!searchedClasses.length && classSearch ? (
            <p className="text-[11px] text-surface-600">Nenhuma classe encontrada para a pesquisa.</p>
          ) : null}
        </div>
        <label className="grid gap-1 text-xs text-surface-700">
          Rodovia
          <select className={field} value={road} onChange={(event) => setRoad(event.target.value)}>
            <option value="">Todas</option>
            {(summary?.options.rodovias || []).map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="rounded-xl bg-brand-50 p-3 text-xs leading-6" aria-live="polite">
        {busy && !summary
          ? 'Carregando o mapa…'
          : `Com os filtros selecionados: ${number(summary?.total || 0)} apontamentos · ${number(mapped)} com coordenadas · ${number((summary?.total || 0) - mapped)} sem coordenadas válidas.`}
      </div>
      {summary && mapped ? (
        <Suspense
          fallback={
            <p role="status" className="rounded-xl bg-brand-50 p-8 text-sm">
              Preparando mapa…
            </p>
          }
        >
          <MapCanvas cells={summary.cells} loadPoints={loadPoints} onOpen={setSelected} viewKey={viewKey} />
        </Suspense>
      ) : (
        <p className="rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-surface-600">
          {!summary || collecting
            ? 'Aguardando a base do mapa…'
            : summary.total
              ? 'Os apontamentos encontrados não possuem coordenadas válidas para exibição no mapa.'
              : 'Nenhum apontamento para os filtros selecionados. Amplie o período ou limpe os filtros.'}
        </p>
      )}
      <details
        className="rounded-xl border border-brand-100 p-3"
        onToggle={(event) => setListOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-brand-700">
          Ver registros em lista ({number(summary?.total || 0)})
        </summary>
        <div className="mt-3 space-y-2">
          {!list ? <p className="text-xs text-surface-600">Carregando registros…</p> : null}
          {list?.items.map((item) => (
            <button
              key={item.uuid}
              type="button"
              onClick={() => setSelected(item.uuid)}
              className="block w-full rounded-xl border border-brand-100 p-3 text-left text-xs hover:bg-brand-50"
            >
              <strong>{item.numero || item.uuid}</strong> · {item.status}
              <span className="mt-1 block text-surface-600">
                {item.classe} · {item.rodovia || 'Rodovia não informada'} · km {item.km ?? '—'}
                {item.encontradoEm ? ` · encontrado em ${item.encontradoEm.split('-').reverse().join('/')}` : ''}
                {!item.coordinates ? ' · Sem coordenadas' : ''}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-3">
          <button className={button} type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span className="text-xs">
            {page} / {pages}
          </span>
          <button className={button} type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Próxima
          </button>
        </div>
      </details>
      {selected && <KartadoReportingDialog company={company} uuid={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
