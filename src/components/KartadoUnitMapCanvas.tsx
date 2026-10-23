import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type {} from 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { mapStatus, type MapReporting } from '@/services/kartadoMapService';

const colors = { completed: '#15803d', progress: '#2563eb', pending: '#d97706', other: '#64748b' };
export default function KartadoUnitMapCanvas({ items, onOpen }: { items: MapReporting[]; onOpen: (uuid: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const onOpenRef = useRef(onOpen); onOpenRef.current = onOpen;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    (window as Window & { L: typeof L }).L = L;
    void import('leaflet.markercluster').then(() => {
      if (cancelled || !element.current) return;
      const map = L.map(element.current, { maxZoom: 19, scrollWheelZoom: false }).setView([-15.8, -47.9], 4);
      mapRef.current = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map).on('tileerror', () => { if (!cancelled) setError('A camada do mapa está indisponível. Os registros continuam acessíveis na lista abaixo.'); });
      resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(element.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setError('Não foi possível iniciar o mapa. Consulte os registros na lista abaixo.'); });
    return () => { cancelled = true; resize?.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);
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
  return <div className="space-y-2">{error && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}<div ref={element} className="relative isolate z-0 h-[420px] w-full rounded-xl sm:h-[500px]" aria-label="Mapa interativo dos apontamentos da unidade" /></div>;
}
