import type original from '@/data/kartado-eco/acompanhamento.json';

export type EcoData = Omit<typeof original, 'Reunioes'> & {
  Reunioes: Array<typeof original.Reunioes[number] & { Formato?: string; Evidencia?: string }>;
  Marcos?: Array<{ Unidade: string; Data: string; Marco: string; Situacao: string; Fonte: string }>;
};

export function ecoAgenda(data: EcoData) {
  // Separate milestones supersede legacy "Marco" entries when the new sheet exists.
  const meetings = data.Reunioes.filter(item => !(data.Marcos && item.Tipo === 'Marco')).map(item => ({
    Unidade: item.Unidade, Data: item.Data, Evento: item.Tipo, Situacao: item.Status,
    Formato: item.Formato || 'Não informado', Evidencia: item.Evidencia || item.Fonte,
    kind: item.Tipo === 'Marco' ? 'Marco' : 'Reunião', scheduled: item.Status === 'Agendada',
  }));
  const milestones = (data.Marcos ?? []).map(item => ({
    Unidade: item.Unidade, Data: item.Data, Evento: item.Marco, Situacao: item.Situacao,
    Formato: '—', Evidencia: item.Fonte, kind: 'Marco',
    scheduled: !['concluido', 'concluida', 'realizado', 'realizada', 'cancelado', 'cancelada'].includes(item.Situacao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()),
  }));
  return [...meetings, ...milestones].sort((a, b) => a.Data.localeCompare(b.Data) || a.Unidade.localeCompare(b.Unidade));
}
