import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type {} from 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { mapStatus, type MapReporting } from '@/services/kartadoMapService';

const colors = { completed: '#15803d', progress: '#2563eb', pending: '#d97706', other: '#64748b' };
type Basemap = 'map' | 'satellite' | 'hybrid';
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
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    (window as Window & { L: typeof L }).L = L;
    void import('leaflet.markercluster').then(() => {
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
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const group = L.markerClusterGroup({ chunkedLoading: false, maxClusterRadius: 55, showCoverageOnHover: false });
    group.addTo(map);
    const points = items.filter(item => item.coordinates);
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
        return L.marker([lat, lng], { title: `${item.numero || 'Apontamento'} · ${item.status}`, keyboard: true,
          icon: L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: `<span style="display:block;width:20px;height:20px;border:3px solid white;border-radius:50%;background:${colors[mapStatus(item.status)]};box-shadow:0 1px 5px #0008"></span>` }),
        }).bindPopup(popup);
      });
      group.addLayers(markers); index += 300;
      if (index < points.length) timer = setTimeout(addChunk, 20);
    };
    addChunk();
    if (points.length) map.fitBounds(L.latLngBounds(points.map(item => [item.coordinates![1], item.coordinates![0]] as L.LatLngTuple)), { padding: [30, 30], maxZoom: 16, animate: false });
    return () => { cancelled = true; clearTimeout(timer); map.removeLayer(group); };
  }, [items, ready]);
  return <div className="space-y-2">
    <div role="group" aria-label="Camada de fundo do mapa" className="flex flex-wrap items-center gap-2">{([['map', 'Mapa'], ['satellite', 'Satélite'], ['hybrid', 'Híbrido']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={basemap === value} onClick={() => setBasemap(value)} className={`rounded-xl border px-4 py-2 text-xs font-semibold ${basemap === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'}`}>{label}</button>)}{labelsLoading && <span role="status" className="text-xs text-surface-600">Carregando referências…</span>}</div>
    {(error || layerError) && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error || layerError}</p>}
    <div ref={element} className="relative isolate z-0 h-[420px] w-full rounded-xl sm:h-[500px]" aria-label="Mapa interativo dos apontamentos da unidade" />
    {basemap !== 'map' && <p className="text-[11px] leading-5 text-surface-500">As imagens podem ter data diferente da ocorrência e são usadas como referência de localização.</p>}
  </div>;
}
