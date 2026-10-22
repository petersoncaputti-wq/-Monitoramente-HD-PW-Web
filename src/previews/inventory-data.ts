export type Scenario = 'complete' | 'partial' | 'stale' | 'updating' | 'failed' | 'processing' | 'empty';
export type Status = 'Executado' | 'Programado' | 'Em andamento';
export interface DemoReporting { numero: string; classe: string; status: Status; data: string }
export interface DemoAsset {
  uuid: string; numero: string; classe: string; rodovia: string; km: number;
  fotos: number; sentido: string; apontamentos: DemoReporting[];
}
export const demoUnits = ['Ecovias Raposo Castello', 'Ecovias Rio Minas'];
export const scenarios: Array<{ id: Scenario; label: string }> = [
  { id: 'complete', label: 'Dados completos' },
  { id: 'partial', label: 'Coleta parcial' },
  { id: 'stale', label: 'Dados desatualizados' },
  { id: 'updating', label: 'Atualização em andamento' },
  { id: 'failed', label: 'Falha na atualização' },
  { id: 'processing', label: 'Primeira coleta em andamento' },
  { id: 'empty', label: 'Inventário vazio' },
];
const classes = ['Sinalização Vertical', 'Ponte', 'Defensa metálica', 'Dispositivo de drenagem'];
export function makeAssets(unit: number): DemoAsset[] {
  return Array.from({ length: unit === 0 ? 48 : 36 }, (_, i) => {
    const apontamentos: DemoReporting[] = [];
    if (i % 4 !== 0) apontamentos.push({ numero: `AP-2026.${String(1041 + i).padStart(5, '0')}`, classe: 'Inspeção rotineira', status: i % 3 === 0 ? 'Programado' : i % 5 === 0 ? 'Em andamento' : 'Executado', data: `2026-${String(6 + i % 4).padStart(2, '0')}-${String(1 + i % 27).padStart(2, '0')}` });
    if (i % 7 === 0) apontamentos.push({ numero: `AP-2026.${2200 + i}`, classe: 'Conservação de ativos', status: 'Programado', data: '2026-10-08' });
    if (i % 3 === 0) apontamentos.push({ numero: `AP-2024.${3100 + i}`, classe: 'Inspeção rotineira', status: 'Executado', data: '2024-08-14' });
    return { uuid: `demo-${unit}-${i}`, numero: `${unit === 0 ? 'ERC' : 'ERM'}-INV-2026.${String(13800 + i)}`, classe: classes[Math.floor(i / 3) % 4], rodovia: (unit === 0 ? ['SP-280', 'SP-270', 'SP-029'] : ['BR-116', 'BR-465', 'BR-493'])[i % 3], km: Math.round((12 + i * 2.37) * 10) / 10, fotos: i % 5 === 0 ? 0 : 1 + i % 3, sentido: i % 2 === 0 ? 'Crescente' : 'Decrescente', apontamentos };
  });
}
export function reportingsInPeriod(asset: DemoAsset, period: string) {
  return asset.apontamentos.filter(r => period === 'completo' || r.data >= '2025-10-22');
}
