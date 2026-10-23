import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type {} from 'leaflet.markercluster';
import type {} from 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './KartadoUnitMapCanvas.css';
import { heatMapItems, mapStatus, nearbyMapItems, type MapReporting } from '@/services/kartadoMapService';

const colors = { completed: '#15803d', progress: '#2563eb', pending: '#d97706', other: '#64748b' };
type Basemap = 'map' | 'satellite' | 'hybrid';
type DisplayMode = 'heat' | 'pending' | 'points';
const imageryService = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
const hybridReferenceItem = '89b035a9cb1f4ed8bf638385ab8cebd7';
export default function KartadoUnitMapCanvas({ items, onOpen }: { items: MapReporting[]; onOpen: (uuid: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState<Basemap>('map');
  const [layerError, setLayerError] = useState('');
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('heat');
  const heatItems = useMemo(() => heatMapItems(items, displayMode === 'pending'), [items, displayMode]);
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    (window as Window & { L: typeof L }).L = L;
    void Promise.all([import('leaflet.markercluster'), import('leaflet.heat')]).then(() => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { maxZoom: 19, scrollWheelZoom: false }).setView([-15.8, -47.9], 4);
      mapRef.current = map;
      const pane = map.createPane('hybridLabels');
      pane.style.zIndex = '350'; pane.style.pointerEvents = 'none';
      resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(element.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setError('Não foi possível iniciar o mapa. Consulte os registros na lista abaixo.'); });
    return () => { cancelled = true; resize?.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    let labels: L.Layer | undefined;
    let labelsReady: (() => void) | undefined;
    setLayerError(''); setLabelsLoading(basemap === 'hybrid');
    const background = L.tileLayer(basemap === 'map' ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : `${imageryService}/tile/{z}/{y}/{x}`, {
      maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: basemap === 'map' ? '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        : 'Imagens: <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics e GIS User Community',
    }).on('tileerror', () => { if (!cancelled) setLayerError('Não foi possível carregar parte da camada de fundo. Você pode selecionar Mapa ou consultar os registros em lista.'); }).addTo(map);
    if (basemap === 'hybrid') {
      // O renderizador vetorial só é baixado quando a visão híbrida é solicitada.
      void Promise.all([import('esri-leaflet-vector'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([vector]) => {
        if (cancelled) return;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!context) throw new Error('WebGL indisponível');
        context.getExtension('WEBGL_lose_context')?.loseContext();
        labels = vector.vectorTileLayer(hybridReferenceItem, { pane: 'hybridLabels' }) as L.Layer;
        labelsReady = () => {
          if (cancelled || !labels) return;
          try { labels.addTo(map); setLabelsLoading(false); }
          catch { setLabelsLoading(false); setLayerError('Não foi possível exibir as referências híbridas neste navegador. A imagem de satélite continua disponível.'); }
        };
        // Aguarda a criação interna antes de adicionar, para permitir cancelamento seguro.
        labels.once('ready', labelsReady);
        labels.on('load-error', () => {
          if (!cancelled) { setLabelsLoading(false); setLayerError('Não foi possível carregar os nomes e referências. A imagem de satélite continua disponível.'); }
        });
      }).catch(() => {
        if (!cancelled) { setLabelsLoading(false); setLayerError('As referências híbridas não estão disponíveis neste navegador. Use Satélite ou Mapa.'); }
      });
    }
    return () => {
      cancelled = true;
      background.remove();
      if (labels) {
        if (labelsReady) labels.off('ready', labelsReady);
        labels.off('load-error');
        if (map.hasLayer(labels)) map.removeLayer(labels);
      }
    };
  }, [basemap, ready]);
  useEffect(() => {
    if (!ready || !mapRef.current || displayMode === 'points') return;
    const map = mapRef.current;
    const heat = L.heatLayer(heatItems.map(item => [item.coordinates![1], item.coordinates![0], 1]), {
      radius: 28, blur: 22, minOpacity: 0.2, maxZoom: 17, max: 8,
      gradient: { 0.15: '#fde047', 0.45: '#fb923c', 0.75: '#f97316', 1: '#ef4444' },
    }).addTo(map);
    const selectRegion = (event: L.LeafletMouseEvent) => {
      const nearby = nearbyMapItems(heatItems, event.containerPoint, point => map.latLngToContainerPoint([point[1], point[0]]), 50);
      if (!nearby.length) { map.closePopup(); return; }
      const popup = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = `${nearby.length.toLocaleString('pt-BR')} apontamento(s) próximos ao clique`; popup.append(title);
      for (const item of nearby.slice(0, 5)) {
        const block = document.createElement('div'); block.className = 'mt-3 border-t border-brand-100 pt-2';
        const text = document.createElement('p'); text.textContent = `${item.numero || 'Apontamento'} · ${item.classe} · ${item.status}`; block.append(text);
        const location = document.createElement('p'); location.textContent = `${item.rodovia || 'Rodovia não informada'} · km ${item.km ?? '—'}`; block.append(location);
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Ver ficha completa';
        button.className = 'mt-1 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white';
        button.onclick = () => onOpenRef.current(item.uuid); block.append(button); popup.append(block);
      }
      if (nearby.length > 5) {
        const note = document.createElement('p'); note.textContent = 'Exibindo os 5 mais próximos. Aproxime o zoom ou use Pontos para selecionar os demais.'; popup.append(note);
      }
      L.popup({ maxWidth: 340, maxHeight: 320 }).setLatLng(event.latlng).setContent(popup).openOn(map);
    };
    map.on('click', selectRegion);
    return () => {
      map.off('click', selectRegion); map.closePopup();
      // O plugin mantém um redesenho agendado; cancela antes de remover o canvas.
      const pendingFrame = (heat as L.HeatLayer & { _frame?: number })._frame;
      if (pendingFrame) L.Util.cancelAnimFrame(pendingFrame);
      if (map.hasLayer(heat)) map.removeLayer(heat);
    };
  }, [heatItems, ready, displayMode]);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const overHeat = displayMode !== 'points';
    const group = L.markerClusterGroup({ chunkedLoading: false, maxClusterRadius: overHeat ? 30 : 55, showCoverageOnHover: false,
      ...(overHeat && { iconCreateFunction: (cluster: L.MarkerCluster) => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid white;border-radius:50%;background:#0f172a;color:white;font-size:11px;font-weight:700;box-shadow:0 1px 5px #0006">${cluster.getChildCount()}</span>` }) }),
    });
    group.addTo(map);
    // Os marcadores e o calor usam exatamente o mesmo recorte, inclusive em Pendências.
    const points = heatItems;
    let index = 0, cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const addChunk = () => {
      if (cancelled) return;
      const markers = points.slice(index, index + 300).map(item => {
        const [lng, lat] = item.coordinates!;
        const popup = document.createElement('div');
        popup.style.minWidth = '180px';
        for (const value of [item.numero || 'Apontamento', item.classe, item.status, `${item.rodovia || 'Rodovia não informada'} · km ${item.km ?? '—'}`]) {
          const line = document.createElement('p'); line.textContent = value; popup.append(line);
        }
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Ver ficha completa';
        button.className = 'mt-2 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white';
        button.onclick = () => onOpenRef.current(item.uuid); popup.append(button);
        const size = overHeat ? 14 : 20;
        return L.marker([lat, lng], { title: `${item.numero || 'Apontamento'} · ${item.status}`, keyboard: true, bubblingMouseEvents: false,
          icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12], html: `<span style="display:block;margin:${(24 - size) / 2}px;width:${size}px;height:${size}px;border:2px solid white;border-radius:50%;background:${overHeat ? '#0f172a' : colors[mapStatus(item.status)]};box-shadow:0 1px 5px #0008"></span>` }),
        }).bindPopup(popup);
      });
      group.addLayers(markers); index += 300;
      if (index < points.length) timer = setTimeout(addChunk, 20);
    };
    addChunk();
    return () => { cancelled = true; clearTimeout(timer); map.closePopup(); if (map.hasLayer(group)) map.removeLayer(group); };
  }, [heatItems, ready, displayMode]);
  useEffect(() => {
    const map = mapRef.current;
    const points = items.filter(item => item.coordinates);
    if (!ready || !map || !points.length) return;
    map.fitBounds(L.latLngBounds(points.map(item => [item.coordinates![1], item.coordinates![0]] as L.LatLngTuple)), { padding: [30, 30], maxZoom: 16, animate: false });
  }, [items, ready]);
  return <div className="space-y-2">
    <div role="group" aria-label="Camada de fundo do mapa" className="flex flex-wrap items-center gap-2">{([['map', 'Mapa'], ['satellite', 'Satélite'], ['hybrid', 'Híbrido']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={basemap === value} onClick={() => setBasemap(value)} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${basemap === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'}`}>{label}</button>)}{labelsLoading && <span role="status" className="text-xs text-surface-600">Carregando referências…</span>}</div>
    <div role="group" aria-label="Visualização dos apontamentos" className="flex flex-wrap items-center gap-2">{([['heat', 'Concentração'], ['pending', 'Calor de pendências'], ['points', 'Pontos']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={displayMode === value} onClick={() => setDisplayMode(value)} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${displayMode === value ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'}`}>{label}</button>)}</div>
    {(error || layerError) && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error || layerError}</p>}
    <div ref={element} className="kartado-unit-map relative isolate z-0 h-[420px] w-full rounded-xl sm:h-[500px]" aria-label="Mapa interativo dos apontamentos da unidade" />
    {displayMode !== 'points' ? <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-5 text-surface-700"><div className="flex flex-wrap items-center gap-2"><span>Menor concentração</span><span aria-hidden="true" className="h-2 w-28 rounded-full" style={{ background: 'linear-gradient(to right,#fde047,#fb923c,#ef4444)' }} /><span>Maior concentração</span><strong className="sm:ml-auto">{heatItems.length.toLocaleString('pt-BR')} {displayMode === 'pending' ? 'pendências' : 'apontamentos'} com coordenadas</strong></div><p className="mt-1">Intensidade relativa ao zoom e aos filtros; não indica gravidade. Clique num ponto para selecionar o apontamento ou numa área para consultar registros próximos. Grupos numerados indicam a quantidade de pontos.{displayMode === 'pending' ? ' Inclui identificados, abertos, pendentes, programados e em andamento.' : ''}</p>{!heatItems.length && <p className="mt-1 font-medium">Nenhum registro para esta visualização nos dados carregados.</p>}</div> : <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-surface-700" aria-label="Legenda dos pontos">{[['Executado / concluído', '#15803d'], ['Em andamento', '#2563eb'], ['Pendente / programado', '#d97706'], ['Outros status', '#64748b']].map(([label, color]) => <span key={label} className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: color }} />{label}</span>)}<span>Grupos numerados: quantidade de pontos</span></div>}
    {basemap !== 'map' && <p className="text-[11px] leading-5 text-surface-500">As imagens podem ter data diferente da ocorrência e são usadas como referência de localização.</p>}
  </div>;
}
