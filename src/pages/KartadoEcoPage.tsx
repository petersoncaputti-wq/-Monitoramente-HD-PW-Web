import { useState, type ReactNode } from 'react';
import { ecoAgenda, type EcoData } from '@/types/kartadoEco';
import './KartadoEcoPage.css';
import { EcoBar, EcoGroupCharts, EcoAttendanceChart, EcoMilestoneTimeline } from './KartadoEcoCharts';
import { KartadoEcoImport } from './KartadoEcoImport';

const percent = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const card = 'rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft';
const control = 'rounded-xl border border-brand-100 bg-white px-4 py-2 text-sm text-surface-900';
type Objective = EcoData['Objetivos'][number];
type Filter = 'pending' | 'stopped' | 'overdue' | 'all';
const stopped = (item: Objective) => ['parado', 'aguardando'].includes(normalize(item.Situacao));

// Do not infer a year for partial dates or interpret narrative deadlines as exact dates.
function overdue(item: Objective, reference: string) {
  if (item.Cumprimento >= 1 || !/^\d{4}-\d{2}-\d{2}$/.test(item.Prazo)) return false;
  const parsed = new Date(`${item.Prazo}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === item.Prazo && item.Prazo < reference;
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="eco-table overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr>{headers.map(header => <th scope="col" key={header} className="border-b border-brand-100 p-3 text-xs uppercase tracking-wide text-surface-600">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-brand-50">{row.map((cell, j) => <td key={j} className="p-3 align-top text-surface-800">{cell ?? 'Não apurado'}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="py-6 text-sm text-surface-600">Nenhum registro nesta seleção.</p>}</div>;
}

export function KartadoEcoPage() {
  return <KartadoEcoImport>{current => <EcoView key={JSON.stringify(current)} data={current} />}</KartadoEcoImport>;
}

function EcoView({ data }: { data: EcoData }) {
  const [unitName, setUnitName] = useState('group');
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const unit = data.Unidades.find(item => item.Unidade === unitName) ?? data.Unidades[0];
  const tabs = [{ id: 'group', label: 'Visão do grupo' }, ...data.Unidades.map(item => ({ id: item.Unidade, label: item.Unidade.replace(/^Ecovias /, '') }))];
  const agenda = ecoAgenda(data);
  const groupAgenda = agenda.filter(item => item.scheduled && data.Unidades.some(unit => unit.Unidade === item.Unidade && item.Data >= unit.DataReferencia)).sort((a, b) => a.Data.localeCompare(b.Data) || a.Unidade.localeCompare(b.Unidade));
  const objectives = data.Objetivos.filter(item => item.Unidade === unitName);
  const meetings = data.Reunioes.filter(item => item.Unidade === unitName).sort((a, b) => a.Data.localeCompare(b.Data));
  const people = data.Pessoas.filter(item => item.Unidade === unitName);
  const pending = objectives.filter(item => item.Cumprimento < 1);
  const blocked = pending.filter(stopped);
  const expired = pending.filter(item => overdue(item, unit.DataReferencia) || normalize(item.Situacao) === 'prazo vencido');
  const eligible = meetings.filter(item => item.Status === 'Realizada' && item.EntraNaMediaDePresenca === 'Sim');
  const measured = eligible.filter(item => item.Convocados !== null && item.Convocados > 0 && item.Presentes !== null);
  const calculatedPresence = measured.length ? measured.reduce((sum, item) => sum + item.Presentes! / item.Convocados!, 0) / measured.length : null;
  const upcoming = groupAgenda.filter(item => item.Unidade === unitName);
  const history = meetings.filter(item => item.Tipo !== 'Marco' && (item.Status !== 'Agendada' || item.Data < unit.DataReferencia));
  const pastMilestones = agenda.filter(item => item.Unidade === unitName && item.kind === 'Marco' && !upcoming.includes(item));
  const visible = filter === 'all' ? objectives : filter === 'stopped' ? blocked : filter === 'overdue' ? expired : pending;
  const filters = [['pending', `Pendentes (${pending.length})`], ['stopped', `Parados ou aguardando (${blocked.length})`], ['overdue', `Prazo vencido (${expired.length})`], ['all', `Todos (${objectives.length})`]] as const;

  function selectUnit(name: string, nextFilter: Filter = 'pending') { setUnitName(name); setFilter(nextFilter); setSearch(''); }

  return <section id="eco-acompanhamento" className="mt-6 space-y-5">
    <header className={card}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Kartado · Grupo EcoRodovias</p><h2 className="mt-2 text-2xl font-semibold text-surface-900">Acompanhamento Eco</h2><p className="mt-2 text-sm text-surface-600">Compare as unidades e consulte o que precisa de acompanhamento.</p></div><button type="button" onClick={() => window.print()} className={`${control} eco-no-print font-semibold text-brand-700`}>Imprimir / salvar PDF</button></div>
      <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Referência dos dados: {[...new Set(data.Unidades.map(item => date(item.DataReferencia)))].join(', ')}.</strong> As situações e a agenda representam essa referência, não a data de hoje.</p>
    </header>

    <nav role="tablist" aria-label="Visões do acompanhamento Eco" className="eco-no-print flex flex-wrap gap-2 rounded-2xl border border-brand-100 bg-white p-2">
      {tabs.map((tab, index) => <button key={tab.id} id={`eco-tab-${index}`} role="tab" type="button" aria-selected={unitName === tab.id} aria-controls="eco-active-panel" tabIndex={unitName === tab.id ? 0 : -1} onClick={() => selectUnit(tab.id)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
        if (next !== null) { event.preventDefault(); selectUnit(tabs[next].id); document.getElementById(`eco-tab-${next}`)?.focus(); }
      }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${unitName === tab.id ? 'bg-brand-700 text-white' : 'text-surface-700 hover:bg-brand-50'}`}>{tab.label}</button>)}
    </nav>
    <div id="eco-active-panel" role="tabpanel" aria-labelledby={`eco-tab-${tabs.findIndex(tab => tab.id === unitName)}`} className="space-y-5">
    {unitName === 'group' ? <>
    <h3 className="text-xl font-semibold text-surface-900">Visão do grupo</h3>
    <section className={card} aria-label="Comparativo das unidades">
      <h3 className="text-lg font-semibold text-surface-900">Comparativo das unidades</h3><p className="mt-1 mb-3 text-sm text-surface-600">Selecione uma unidade para consultar suas pendências e agenda.</p>
      <Table headers={['Unidade', 'Etapa', 'Virada prevista', 'Presença média', 'Inventário']} rows={data.Unidades.map(item => [<button type="button" aria-pressed={unitName === item.Unidade} onClick={() => selectUnit(item.Unidade)} className={`rounded-xl px-3 py-2 text-left font-semibold ${unitName === item.Unidade ? 'bg-brand-700 text-white' : 'text-brand-700 hover:bg-brand-50'}`}>{item.Unidade}</button>, item.Etapa, date(item.DataVirada), percent(item.PresencaMedia), item.ItensInventario.toLocaleString('pt-BR')])} />
    </section>

    <EcoGroupCharts data={data} onSelect={selectUnit} />
    <section className={card} aria-label="Agenda consolidada">
      <h3 className="text-lg font-semibold text-surface-900">Agenda do grupo</h3><p className="mt-1 mb-3 text-sm text-surface-600">Próximas reuniões a partir da referência de cada unidade, em ordem cronológica.</p>
      <Table headers={['Data', 'Unidade', 'Evento', 'Situação', 'Formato', 'Evidência']} rows={groupAgenda.filter(item => item.kind === 'Reunião').map(item => [date(item.Data), item.Unidade, item.Evento, item.Situacao, item.Formato, item.Evidencia])} />
    </section>
    <section className={card}><h3 className="text-lg font-semibold text-surface-900">Linha do tempo dos marcos</h3><EcoMilestoneTimeline events={groupAgenda.filter(item => item.kind === 'Marco')} showUnit /></section>
    </> : <section key={unitName} className="space-y-5" aria-label={`Acompanhamento de ${unitName}`}>
      <p className="text-sm font-semibold text-brand-700">{unit.Etapa} · Virada prevista: {date(unit.DataVirada)}</p>
      <div><h3 className="text-xl font-semibold text-surface-900">{unitName}</h3><p className="mt-1 text-sm text-surface-600">{unit.Orgao} · {unit.Produto} · Entrada na etapa: {date(unit.EntradaNaEtapa)} · Cadência: {unit.Cadencia}</p><p className="mt-1 text-xs text-surface-600">Referência da unidade: {date(unit.DataReferencia)}</p></div>
      <section className={card} aria-label="Pendências e próximos passos">
        <h4 className="text-lg font-semibold text-surface-900">Cumprimento por objetivo</h4>
        <p className="mt-1 text-sm text-surface-600">{pending.length} de {objectives.length} objetivos abaixo de 100%. Abra cada objetivo para consultar seu prazo e sua categoria.</p>
        <div className="eco-no-print my-4 flex flex-wrap gap-2" aria-label="Filtrar objetivos">{filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-xl border px-3 py-2 text-sm ${filter === id ? 'border-brand-700 bg-brand-50 font-semibold text-brand-700' : 'border-brand-100 text-surface-700'}`}>{label}</button>)}</div>
        <p className="eco-print-only">Filtro: {filters.find(([id]) => id === filter)?.[1]}.</p>
        <div className="space-y-3">{visible.map(item => <details key={item.Objetivo} className="rounded-xl border border-brand-100 p-4"><summary className="cursor-pointer text-sm font-medium text-surface-900"><span>{item.Objetivo}</span><span className="ml-3 inline-block rounded-lg bg-brand-50 px-2 py-1 text-xs text-brand-700">{percent(item.Cumprimento)}</span><span className="ml-2 text-xs text-surface-600">{item.Situacao}</span><EcoBar value={item.Cumprimento} label={item.Objetivo} /></summary><div className="mt-3 space-y-2 text-sm text-surface-700"><p><strong>Categoria:</strong> {item.Categoria}</p><p><strong>Prazo registrado:</strong> {date(item.Prazo)}</p>{overdue(item, unit.DataReferencia) ? <p className="text-amber-800">Prazo anterior à referência, com cumprimento abaixo de 100%.</p> : normalize(item.Situacao) === 'prazo vencido' ? <p className="text-amber-800">“Prazo vencido” é a situação informada na planilha.</p> : null}</div></details>)}</div>
        {!visible.length && <p className="py-5 text-sm text-surface-600">Nenhum objetivo neste filtro.</p>}
        <p className="mt-4 text-xs leading-5 text-surface-600">Parados e aguardando seguem a situação registrada. Prazos sem ano ou expressões como “na virada” não geram atraso automático. Datas completas são comparadas à referência da unidade.</p>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className={card} aria-label="Agenda da unidade"><h4 className="text-lg font-semibold text-surface-900">Agenda a partir de {date(unit.DataReferencia)}</h4><p className="mt-1 mb-4 text-sm text-surface-600">Próximas reuniões registradas na fonte.</p>{!upcoming.some(item => item.kind === 'Reunião') && <p className="mb-3 text-sm text-surface-600">Nenhuma próxima reunião registrada para esta unidade.</p>}<Table headers={['Data', 'Evento', 'Situação', 'Formato', 'Evidência']} rows={upcoming.filter(item => item.kind === 'Reunião').map(item => [date(item.Data), item.Evento, item.Situacao, item.Formato, item.Evidencia])} /></section>
        <section className={card} aria-label="Cobertura da participação"><h4 className="text-lg font-semibold text-surface-900">Participação: cobertura da apuração</h4><p className="mt-4 text-3xl font-semibold text-brand-700">{measured.length} <span className="text-base font-normal text-surface-600">de {eligible.length} reuniões elegíveis</span></p><p className="mt-3 text-sm text-surface-700">{eligible.length - measured.length} sem dados suficientes para calcular participação.</p><p className="mt-3 text-xs leading-5 text-surface-600">Considera reuniões realizadas marcadas para entrar na média. A apuração exige presentes informados e convocados maior que zero. Presença zero é válida; campo vazio não significa ausência. A média do comparativo é a publicada na planilha.</p>
        {calculatedPresence !== null && Math.round(calculatedPresence * 100) !== Math.round(unit.PresencaMedia * 100) && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Conferir presença: média das reuniões apuradas {new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 }).format(calculatedPresence)}; indicador informado na planilha {percent(unit.PresencaMedia)}. O valor da fonte foi preservado.</p>}<EcoAttendanceChart meetings={meetings} /><details className="mt-5 border-t border-brand-100 pt-4"><summary className="cursor-pointer text-sm font-semibold text-brand-700">Histórico de reuniões ({history.length})</summary><div className="mt-3"><Table headers={['Data', 'Tipo', 'Formato', 'Evidência', 'Status', 'Presentes / convocados', 'Participação']} rows={history.map(item => [date(item.Data), item.Tipo, item.Formato || 'Não informado', item.Evidencia || item.Fonte, item.Status, `${item.Presentes ?? 'n/d'} / ${item.Convocados ?? 'n/d'}`, item.Convocados !== null && item.Convocados > 0 && item.Presentes !== null ? percent(item.Presentes / item.Convocados) : null])} /></div></details></section>
      </div>

      <section className={card}><h4 className="text-lg font-semibold text-surface-900">Linha do tempo dos marcos</h4><EcoMilestoneTimeline events={upcoming.filter(item => item.kind === 'Marco')} /></section>
      {pastMilestones.length > 0 && <details className={card}><summary className="cursor-pointer font-semibold">Histórico de marcos ({pastMilestones.length})</summary><Table headers={['Data', 'Marco', 'Situação', 'Fonte']} rows={pastMilestones.map(item => [date(item.Data), item.Evento, item.Situacao, item.Evidencia])} /></details>}
      <details className={card}><summary className="cursor-pointer text-base font-semibold text-surface-900">Participantes e frequência ({people.length})</summary><div className="mt-4"><label className="eco-no-print mb-4 flex flex-col gap-2 text-sm text-surface-700">Buscar participante<input value={search} onChange={event => setSearch(event.target.value)} className={control} placeholder="Nome, vínculo ou frente" /></label>{search && <p className="mb-2 text-xs text-surface-600">Busca: {search}</p>}<Table headers={['Nome', 'Vínculo', 'Frente', 'Presenças / convocações', 'Frequência', 'Treinamento 21/09']} rows={people.filter(item => normalize([item.Nome, item.Vinculo, item.Frente].join(' ')).includes(normalize(search.trim()))).map(item => [item.Nome, item.Vinculo, item.Frente || 'Não informada', `${item.Presencas} / ${item.Convocacoes}`, item.Frequencia, item.NoTreinamento21_09 || 'Não informado'])} /></div></details>
    </section>}
    </div>
    <p className="text-xs leading-5 text-surface-600">Fonte: planilha de acompanhamento Eco importada manualmente. Sem sincronização automática. A impressão usa a aba e os filtros selecionados; expanda os detalhes que deseja incluir.</p>
  </section>;
}
