import { useState, type ReactNode } from 'react';
import data from '@/data/kartado-eco/acompanhamento.json';

const percent = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const card = 'rounded-[24px] border border-brand-100 bg-white p-5 shadow-soft';
const control = 'rounded-xl border border-brand-100 bg-white px-4 py-3 text-sm text-surface-900';

function CompleteReport({ units }: { units: typeof data.Unidades }) {
  return <div className="mt-6 space-y-8">
    <div><h3 className="text-xl font-semibold text-surface-900">Relatório de acompanhamento</h3><p className="mt-2 text-sm text-surface-600">Consolidação dos dados da planilha para as unidades selecionadas. Datas e situações correspondem à referência de cada unidade.</p></div>
    <section aria-label="Resumo das unidades">
      <h4 className="mb-3 text-lg font-semibold text-surface-900">Resumo das unidades</h4>
      <Table headers={['Unidade', 'Referência', 'Etapa', 'Entrada', 'Virada', 'Inventário', 'Objetivos', 'Presença média', 'Cadência']} rows={units.map(item => [item.Unidade, date(item.DataReferencia), item.Etapa, date(item.EntradaNaEtapa), date(item.DataVirada), item.ItensInventario.toLocaleString('pt-BR'), percent(item.ObjetivosCumpridos), percent(item.PresencaMedia), item.Cadencia])} />
    </section>
    {units.map(unit => {
      const objectives = data.Objetivos.filter(item => item.Unidade === unit.Unidade);
      const meetings = data.Reunioes.filter(item => item.Unidade === unit.Unidade).sort((a, b) => a.Data.localeCompare(b.Data));
      const people = data.Pessoas.filter(item => item.Unidade === unit.Unidade);
      return <article key={unit.Unidade} className="space-y-6 border-t border-brand-100 pt-6">
        <header><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{unit.Orgao} · {unit.Produto}</p><h4 className="mt-2 text-xl font-semibold text-surface-900">{unit.Unidade}</h4><p className="mt-2 text-sm text-surface-600">Referência: {date(unit.DataReferencia)} · {objectives.length} objetivos · {meetings.filter(item => item.Status === 'Realizada').length} reuniões realizadas · {people.length} registros de pessoas</p></header>
        <section aria-label={`Objetivos de ${unit.Unidade}`}><h5 className="mb-3 font-semibold text-surface-900">Objetivos</h5><Table headers={['Categoria', 'Objetivo', 'Prazo', 'Cumprimento', 'Situação']} rows={objectives.map(item => [item.Categoria, item.Objetivo, item.Prazo, percent(item.Cumprimento), item.Situacao])} /></section>
        <section aria-label={`Reuniões de ${unit.Unidade}`}><h5 className="mb-3 font-semibold text-surface-900">Reuniões e marcos</h5><Table headers={['Data', 'Tipo', 'Status', 'Convocados', 'Presentes', 'Participação', 'Entra na média', 'Fonte']} rows={meetings.map(item => [date(item.Data), item.Tipo, item.Status, item.Convocados, item.Presentes, item.Convocados !== null && item.Convocados > 0 && item.Presentes !== null ? percent(item.Presentes / item.Convocados) : null, item.EntraNaMediaDePresenca, item.Fonte])} /></section>
        <section aria-label={`Pessoas de ${unit.Unidade}`}><h5 className="mb-3 font-semibold text-surface-900">Pessoas</h5><Table headers={['Nome', 'Vínculo', 'Frente', 'Presenças / convocações', 'Frequência', 'Treinamento 21/09']} rows={people.map(item => [item.Nome, item.Vinculo, item.Frente || 'Não informada', `${item.Presencas} / ${item.Convocacoes}`, item.Frequencia, item.NoTreinamento21_09 || 'Não informado'])} /></section>
      </article>;
    })}
  </div>;
}

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr>{headers.map(header => <th key={header} className="border-b border-brand-100 p-3 text-xs uppercase tracking-wide text-surface-600">{header}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i} className="border-b border-brand-50">{row.map((cell, j) => <td key={j} className="p-3 align-top text-surface-800">{cell ?? 'Não apurado'}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="py-8 text-center text-sm text-surface-600">Nenhum registro corresponde aos filtros.</p>}</div>;
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div><div className="mb-2 flex justify-between gap-3 text-sm"><span>{label}</span><strong>{percent(value)}</strong></div><div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} className="h-2 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} /></div></div>;
}

export function KartadoEcoPage() {
  const [unit, setUnit] = useState('all');
  const [view, setView] = useState('objectives');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const units = data.Unidades.filter(item => unit === 'all' || item.Unidade === unit);
  const matches = (item: { Unidade: string }) => unit === 'all' || item.Unidade === unit;
  const objectives = data.Objetivos.filter(matches);
  const meetings = data.Reunioes.filter(matches);
  const people = data.Pessoas.filter(matches);
  const referenceDates = [...new Set(units.map(item => date(item.DataReferencia)))].join(', ');
  const searched = (item: object) => !query.trim() || normalize(Object.values(item).join(' ')).includes(normalize(query.trim()));

  return <section className="mt-6 space-y-5">
    <header className={card}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Sistema Kartado · Grupo EcoRodovias</p>
      <h2 className="mt-3 text-2xl font-semibold text-surface-900 md:text-3xl">Acompanhamento Eco</h2>
      <p className="mt-2 text-sm text-surface-700">Etapas, objetivos e participação das unidades do Grupo EcoRodovias.</p>
      <p className="mt-3 text-xs text-surface-600">Referência: {referenceDates} · Dados importados de Acompanhamento_Grupo_Eco_1.xlsx. Sem sincronização automática com o SharePoint.</p>
      <label className="mt-5 flex max-w-md flex-col gap-2 text-sm font-medium">Unidade<select value={unit} onChange={event => setUnit(event.target.value)} className={control}><option value="all">Todas as unidades</option>{data.Unidades.map(item => <option key={item.Unidade}>{item.Unidade}</option>)}</select></label>
    </header>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Unidades', units.length], ['Itens de inventário', units.reduce((sum, item) => sum + item.ItensInventario, 0)], ['Objetivos acompanhados', objectives.length], ['Reuniões realizadas', meetings.filter(item => item.Status === 'Realizada').length],
    ].map(([label, value]) => <article key={label} className={card}><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{label}</p><p className="mt-3 text-3xl font-semibold text-surface-900">{Number(value).toLocaleString('pt-BR')}</p></article>)}</div>

    <div className="grid gap-5 xl:grid-cols-3">{units.map(item => {
      const elapsed = (Date.parse(item.DataReferencia) - Date.parse(item.EntradaNaEtapa)) / (Date.parse(item.DataVirada) - Date.parse(item.EntradaNaEtapa));
      return <article key={item.Unidade} className={card}><p className="text-xs font-semibold text-brand-700">{item.Orgao} · {item.Produto}</p><h3 className="mt-2 text-lg font-semibold text-surface-900">{item.Unidade}</h3><p className="mt-2 text-sm text-surface-600">{item.Etapa}: {date(item.EntradaNaEtapa)} a {date(item.DataVirada)}</p><div className="mt-5 space-y-4"><Progress label="Objetivos cumpridos" value={item.ObjetivosCumpridos} /><Progress label="Prazo consumido na referência" value={elapsed} /><Progress label="Presença média informada" value={item.PresencaMedia} /></div><div className="mt-5 border-t border-brand-100 pt-4 text-sm"><p><strong>Cadência:</strong> {item.Cadencia}</p><p className="mt-2"><strong>Risco regulatório informado:</strong> {item.RiscoRegulatorio}</p></div></article>;
    })}</div>

    <div className={card}>
      <nav aria-label="Detalhes do acompanhamento Eco" className="flex flex-wrap gap-2">{[['objectives', 'Objetivos'], ['meetings', 'Reuniões e marcos'], ['people', 'Pessoas'], ['report', 'Relatório completo']].map(([id, label]) => <button type="button" key={id} aria-pressed={view === id} onClick={() => { setView(id); setQuery(''); setStatus('all'); }} className={`rounded-xl px-4 py-3 text-sm font-semibold ${view === id ? 'bg-brand-700 text-white' : 'text-brand-700 hover:bg-brand-50'}`}>{label}</button>)}</nav>
      {view !== 'report' && <div className="my-5 flex flex-wrap gap-3"><label className="flex flex-1 flex-col gap-2 text-sm">Buscar registros<input value={query} onChange={event => setQuery(event.target.value)} className={control} placeholder="Digite um nome, objetivo, data ou situação" /></label>{view === 'meetings' && <label className="flex flex-col gap-2 text-sm">Status na referência<select className={control} value={status} onChange={event => setStatus(event.target.value)}><option value="all">Todos</option><option>Realizada</option><option>Agendada</option></select></label>}</div>}
      {view === 'objectives' && <><p className="mb-4 text-xs text-surface-600">Cumprimento e situação registrados na planilha. O indicador da unidade é a média simples dos objetivos, arredondada na fonte.</p><Table headers={['Unidade', 'Categoria', 'Objetivo', 'Prazo', 'Cumprimento', 'Situação']} rows={objectives.filter(searched).map(item => [item.Unidade, item.Categoria, item.Objetivo, item.Prazo, percent(item.Cumprimento), item.Situacao])} /></>}
      {view === 'meetings' && <><p className="mb-4 text-xs text-surface-600">Status conforme a referência da unidade. Participação = presentes ÷ convocados. Reuniões sem apuração não entram na média; marcos também estão listados.</p><Table headers={['Unidade', 'Data', 'Tipo', 'Status', 'Convocados', 'Presentes', 'Participação', 'Entra na média', 'Fonte']} rows={meetings.filter(item => (status === 'all' || item.Status === status) && searched(item)).map(item => [item.Unidade, date(item.Data), item.Tipo, item.Status, item.Convocados, item.Presentes, item.Convocados !== null && item.Convocados > 0 && item.Presentes !== null ? percent(item.Presentes / item.Convocados) : null, item.EntraNaMediaDePresenca, item.Fonte])} /></>}
      {view === 'people' && <Table headers={['Unidade', 'Nome', 'Vínculo', 'Frente', 'Presenças / convocações', 'Frequência', 'Treinamento 21/09']} rows={people.filter(searched).map(item => [item.Unidade, item.Nome, item.Vinculo, item.Frente || 'Não informada', `${item.Presencas} / ${item.Convocacoes}`, item.Frequencia, item.NoTreinamento21_09 || 'Não informado'])} />}
      {view === 'report' && <CompleteReport units={units} />}
    </div>
    <p className="text-xs leading-5 text-surface-600">Indicadores de objetivos, presença média e risco regulatório são os informados na planilha. Participação por reunião = presentes ÷ convocados, quando apurados e com convocados maior que zero. Valores não apurados permanecem distintos de zero.</p>
  </section>;
}
