import { useEffect, useId, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type {} from 'leaflet.markercluster';
import type {} from 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './KartadoUnitMapCanvas.css';
import {
  heatCells,
  MAP_POINTS_LIMIT,
  mapStatus,
  type MapBounds,
  type MapCell,
  type MapPoints,
  type MapReporting,
} from '@/services/kartadoMapService';

const colors = { completed: '#15803d', progress: '#2563eb', pending: '#d97706', other: '#64748b' };
type Basemap = 'map' | 'satellite';
type DisplayMode = 'heat' | 'pending' | 'points';
const displayModes = [
  {
    value: 'heat',
    label: 'Concentração',
    help: 'Mostra onde se concentram todos os apontamentos filtrados, incluindo os concluídos. Cores mais quentes indicam maior concentração, sem indicar gravidade ou atraso.',
  },
  {
    value: 'pending',
    label: 'Calor de pendências',
    help: 'Mostra a concentração de apontamentos identificados, abertos, pendentes, programados e em andamento ou execução. Ajuda a localizar demandas ainda por concluir.',
  },
  {
    value: 'points',
    label: 'Pontos',
    help: 'Mostra cada localização com cores por status: verde para concluídos, azul para em andamento, laranja para pendentes ou programados e cinza para outros. Clique em um ponto para consultar sua ficha; grupos numerados indicam a quantidade de apontamentos.',
  },
] as const;
const imageryService = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
// Ficha resumida de um apontamento, usada nos marcadores e no clique sobre o calor.
function reportingPopup(item: MapReporting, open: { current: (uuid: string) => void }) {
  const popup = document.createElement('div');
  for (const value of [
    item.numero || 'Apontamento',
    item.classe,
    item.status,
    `${item.rodovia || 'Rodovia não informada'} · km ${item.km ?? '—'}`,
  ]) {
    const line = document.createElement('p');
    line.textContent = value;
    popup.append(line);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Ver ficha completa';
  button.className = 'mt-2 rounded-lg bg-brand-700 px-3 py-2 text-xs font-semibold text-white';
  button.onclick = () => open.current(item.uuid);
  popup.append(button);
  return popup;
}
export type LoadPoints = (
  bounds: MapBounds,
  options: { pendingOnly?: boolean; limit?: number; center?: { lat: number; lon: number } },
  signal: AbortSignal,
) => Promise<MapPoints>;
const boundsOf = (value: L.LatLngBounds): MapBounds => ({
  west: Math.max(-180, value.getWest()),
  south: Math.max(-90, value.getSouth()),
  east: Math.min(180, value.getEast()),
  north: Math.min(90, value.getNorth()),
});
export default function KartadoUnitMapCanvas({
  cells,
  loadPoints,
  onOpen,
  viewKey = '',
}: {
  cells: MapCell[];
  /** Pontos individuais de uma área, lidos da base do mapa no servidor. */
  loadPoints: LoadPoints;
  onOpen: (uuid: string) => void;
  viewKey?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userNavigated = useRef(false);
  const automaticView = useRef(false);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState<Basemap>('map');
  const [layerError, setLayerError] = useState('');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('heat');
  const [tooltip, setTooltip] = useState<DisplayMode | null>(null);
  const tooltipId = useId();
  const [areaPoints, setAreaPoints] = useState<{ total: number; items: MapReporting[] } | null>(null);
  const [areaError, setAreaError] = useState('');
  const [viewport, setViewport] = useState(0);
  const heat = useMemo(() => heatCells(cells, displayMode === 'pending'), [cells, displayMode]);
  const heatTotal = useMemo(() => heat.reduce((sum, cell) => sum + cell[2], 0), [heat]);
  function fitVisiblePoints() {
    const map = mapRef.current;
    if (!map || !heat.length) return;
    automaticView.current = true;
    try {
      map.fitBounds(L.latLngBounds(heat.map(([lat, lon]) => [lat, lon] as L.LatLngTuple)), {
        padding: [35, 35],
        maxZoom: 16,
        animate: false,
      });
    } finally {
      automaticView.current = false;
    }
    // A partir daqui, novas páginas não devem desfazer a escolha do usuário.
    userNavigated.current = true;
  }
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    (window as Window & { L: typeof L }).L = L;
    void Promise.all([import('leaflet.markercluster'), import('leaflet.heat')])
      .then(() => {
        if (cancelled || !element.current) return;
        const map = L.map(element.current, {
          maxZoom: 19,
          scrollWheelZoom: true,
          wheelPxPerZoomLevel: 100,
          wheelDebounceTime: 60,
          zoomSnap: 0.5,
          zoomDelta: 0.5,
          zoomControl: false,
        }).setView([-15.8, -47.9], 4);
        mapRef.current = map;
        map.attributionControl.setPrefix(false);
        L.control.zoom({ zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' }).addTo(map);
        L.control.scale({ imperial: false, metric: true, maxWidth: 140 }).addTo(map);
        const rememberNavigation = () => {
          if (!automaticView.current) userNavigated.current = true;
        };
        map.on('dragstart zoomstart popupopen keydown', rememberNavigation);
        map.on('moveend', () => setViewport((value) => value + 1));
        resize = new ResizeObserver(() => map.invalidateSize());
        resize.observe(element.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível iniciar o mapa. Consulte os registros na lista abaixo.');
      });
    return () => {
      cancelled = true;
      resize?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    setLayerError('');
    const background = L.tileLayer(
      basemap === 'map' ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : `${imageryService}/tile/{z}/{y}/{x}`,
      {
        maxZoom: 19,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution:
          basemap === 'map'
            ? '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            : 'Imagens: <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics e GIS User Community',
      },
    )
      .on('tileerror', () => {
        if (!cancelled)
          setLayerError(
            'Não foi possível carregar parte da camada de fundo. Você pode selecionar Mapa ou consultar os registros em lista.',
          );
      })
      .addTo(map);
    return () => {
      cancelled = true;
      background.remove();
    };
  }, [basemap, ready]);
  // Com muitos registros na área, os pontos individuais não são carregados: o calor dá o contexto.
  const tooMany = Boolean(areaPoints && areaPoints.total > MAP_POINTS_LIMIT);
  const showHeat = displayMode !== 'points' || tooMany;
  useEffect(() => {
    if (!ready || !mapRef.current || !showHeat) return;
    const map = mapRef.current;
    const layer = L.heatLayer(heat, {
      radius: 28,
      blur: 22,
      minOpacity: 0.2,
      maxZoom: 17,
      max: 8,
      gradient: { 0.15: '#fde047', 0.45: '#fb923c', 0.75: '#f97316', 1: '#ef4444' },
    }).addTo(map);
    const selectRegion = (event: L.LeafletMouseEvent) => {
      const controller = new AbortController();
      const { x, y } = event.containerPoint;
      const area = L.latLngBounds(
        map.containerPointToLatLng([x - 50, y + 50]),
        map.containerPointToLatLng([x + 50, y - 50]),
      );
      const popup = document.createElement('div');
      popup.textContent = 'Consultando apontamentos próximos…';
      const bubble = L.popup({ maxWidth: 340, maxHeight: 320 }).setLatLng(event.latlng).setContent(popup).openOn(map);
      bubble.on('remove', () => controller.abort());
      loadPoints(
        boundsOf(area),
        {
          pendingOnly: displayMode === 'pending',
          limit: 5,
          center: { lat: event.latlng.lat, lon: event.latlng.lng },
        },
        controller.signal,
      )
        .then(({ total, items }) => {
          if (!total) {
            map.closePopup(bubble);
            return;
          }
          popup.textContent = '';
          const title = document.createElement('strong');
          title.textContent = `${total.toLocaleString('pt-BR')} apontamento(s) próximos ao clique`;
          popup.append(title);
          for (const item of items) {
            const block = reportingPopup(item, onOpenRef);
            block.className = 'mt-3 border-t border-brand-100 pt-2';
            popup.append(block);
          }
          if (total > items.length) {
            const note = document.createElement('p');
            note.textContent = `Exibindo os ${items.length} mais próximos. Aproxime o zoom ou use Pontos para selecionar os demais.`;
            popup.append(note);
          }
          bubble.update();
        })
        .catch(() => {
          if (!controller.signal.aborted) popup.textContent = 'Não foi possível consultar os apontamentos desta área.';
        });
    };
    map.on('click', selectRegion);
    return () => {
      map.off('click', selectRegion);
      map.closePopup();
      // O plugin mantém um redesenho agendado; cancela antes de remover o canvas.
      const pendingFrame = (layer as L.HeatLayer & { _frame?: number })._frame;
      if (pendingFrame) L.Util.cancelAnimFrame(pendingFrame);
      if (map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [heat, ready, displayMode, showHeat, loadPoints]);
  // Pontos individuais da área visível. Carrega uma área maior que a tela e só recarrega
  // ao sair dela ou ao aproximar com muitos registros, para não fechar balões abertos.
  const loaded = useRef<{ key: string; bounds: L.LatLngBounds; total: number } | null>(null);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const pendingOnly = displayMode === 'pending';
    const key = `${viewKey}|${pendingOnly}|${cells.length}`;
    const current = loaded.current;
    if (current && current.key === key && current.total <= MAP_POINTS_LIMIT && current.bounds.contains(map.getBounds()))
      return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const bounds = map.getBounds().pad(0.5);
      loadPoints(boundsOf(bounds), { pendingOnly }, controller.signal)
        .then((value) => {
          loaded.current = { key, bounds, total: value.total };
          setAreaPoints(value);
          setAreaError('');
        })
        .catch(() => {
          if (!controller.signal.aborted) setAreaError('Não foi possível carregar os pontos desta área do mapa.');
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, viewport, displayMode, viewKey, cells, loadPoints]);
  useEffect(() => {
    if (!ready || !mapRef.current || !areaPoints || areaPoints.total > MAP_POINTS_LIMIT) return;
    const map = mapRef.current;
    const overHeat = displayMode !== 'points';
    const group = L.markerClusterGroup({
      chunkedLoading: false,
      maxClusterRadius: overHeat ? 30 : 55,
      showCoverageOnHover: false,
      ...(overHeat && {
        iconCreateFunction: (cluster: L.MarkerCluster) =>
          L.divIcon({
            className: '',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border:2px solid white;border-radius:50%;background:#0f172a;color:white;font-size:11px;font-weight:700;box-shadow:0 1px 5px #0006">${cluster.getChildCount()}</span>`,
          }),
      }),
    });
    group.addTo(map);
    const size = overHeat ? 14 : 20;
    group.addLayers(
      areaPoints.items
        .filter((item) => item.coordinates)
        .map((item) => {
          const [lng, lat] = item.coordinates!;
          const popup = reportingPopup(item, onOpenRef);
          popup.style.minWidth = '180px';
          return L.marker([lat, lng], {
            title: `${item.numero || 'Apontamento'} · ${item.status}`,
            keyboard: true,
            bubblingMouseEvents: false,
            icon: L.divIcon({
              className: '',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              html: `<span style="display:block;margin:${(24 - size) / 2}px;width:${size}px;height:${size}px;border:2px solid white;border-radius:50%;background:${overHeat ? '#0f172a' : colors[mapStatus(item.status)]};box-shadow:0 1px 5px #0008"></span>`,
            }),
          }).bindPopup(popup);
        }),
    );
    return () => {
      if (map.hasLayer(group)) map.removeLayer(group);
    };
  }, [areaPoints, ready, displayMode]);
  useEffect(() => {
    userNavigated.current = false;
  }, [viewKey, displayMode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !heat.length || userNavigated.current) return;
    automaticView.current = true;
    try {
      map.fitBounds(L.latLngBounds(heat.map(([lat, lon]) => [lat, lon] as L.LatLngTuple)), {
        padding: [35, 35],
        maxZoom: 16,
        animate: false,
      });
    } finally {
      automaticView.current = false;
    }
  }, [heat, ready, viewKey, displayMode]);
  return (
    <div className="space-y-2">
      <div role="group" aria-label="Camada de fundo do mapa" className="flex flex-wrap items-center gap-2">
        {(
          [
            ['map', 'Mapa'],
            ['satellite', 'Satélite'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={basemap === value}
            onClick={() => setBasemap(value)}
            className={`rounded-xl border px-4 py-2 text-xs font-semibold ${basemap === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Visualização dos apontamentos" className="flex flex-wrap items-center gap-2">
        {displayModes.map(({ value, label, help }) => (
          <div
            key={value}
            className="relative"
            onMouseEnter={() => setTooltip(value)}
            onMouseLeave={() => setTooltip(null)}
          >
            <button
              type="button"
              aria-pressed={displayMode === value}
              aria-describedby={tooltip === value ? `${tooltipId}-${value}` : undefined}
              onFocus={() => setTooltip(value)}
              onBlur={() => setTooltip(null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setTooltip(null);
              }}
              onClick={() => {
                setDisplayMode(value);
                setTooltip(value);
              }}
              className={`rounded-xl border px-4 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${displayMode === value ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-brand-100 bg-white text-brand-700 hover:bg-brand-50'}`}
            >
              {label}
            </button>
            {tooltip === value && (
              <div className="absolute bottom-full left-0 z-[1000] w-64 max-w-[calc(100vw-3rem)] pb-2">
                <div
                  id={`${tooltipId}-${value}`}
                  role="tooltip"
                  className="rounded-xl bg-surface-900 px-3 py-2 text-xs leading-5 text-white shadow-lg"
                >
                  {help}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-surface-600">
          Arraste para mover. Use a roda do mouse, os botões +/− ou dois dedos para ajustar o zoom.
        </p>
        <button
          type="button"
          disabled={!ready || !heat.length}
          onClick={fitVisiblePoints}
          className="rounded-xl border border-brand-100 bg-white px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40"
        >
          Enquadrar pontos
        </button>
      </div>
      {tooMany ? (
        <p role="status" className="rounded-xl bg-brand-50 p-3 text-xs text-surface-700">
          {areaPoints!.total.toLocaleString('pt-BR')} apontamentos nesta área do mapa. Aproxime o zoom para ver e clicar
          nos pontos individuais (até {MAP_POINTS_LIMIT.toLocaleString('pt-BR')} por área)
          {displayMode === 'points' ? '; até lá, o mapa mostra a concentração.' : '.'}
        </p>
      ) : null}
      {(error || layerError || areaError) && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          {error || layerError || areaError}
        </p>
      )}
      <div
        ref={element}
        className="kartado-unit-map relative isolate z-0 h-[420px] w-full rounded-xl sm:h-[500px]"
        aria-label="Mapa interativo dos apontamentos da unidade"
      />
      {displayMode !== 'points' ? (
        <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs leading-5 text-surface-700">
          <div className="flex flex-wrap items-center gap-2">
            <span>Menor concentração</span>
            <span
              aria-hidden="true"
              className="h-2 w-28 rounded-full"
              style={{ background: 'linear-gradient(to right,#fde047,#fb923c,#ef4444)' }}
            />
            <span>Maior concentração</span>
            <strong className="sm:ml-auto">
              {heatTotal.toLocaleString('pt-BR')} {displayMode === 'pending' ? 'pendências' : 'apontamentos'} com
              coordenadas
            </strong>
          </div>
          <p className="mt-1">
            Intensidade relativa ao zoom e aos filtros; não indica gravidade. Clique num ponto para selecionar o
            apontamento ou numa área para consultar registros próximos. Grupos numerados indicam a quantidade de pontos.
            {displayMode === 'pending' ? ' Inclui identificados, abertos, pendentes, programados e em andamento.' : ''}
          </p>
          {!heat.length && (
            <p className="mt-1 font-medium">Nenhum registro para esta visualização nos dados carregados.</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-surface-700" aria-label="Legenda dos pontos">
          {[
            ['Executado / concluído', '#15803d'],
            ['Em andamento', '#2563eb'],
            ['Pendente / programado', '#d97706'],
            ['Outros status', '#64748b'],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
          <span>Grupos numerados: quantidade de pontos</span>
        </div>
      )}
      {basemap !== 'map' && (
        <p className="text-[11px] leading-5 text-surface-500">
          As imagens podem ter data diferente da ocorrência e são usadas como referência de localização.
        </p>
      )}
    </div>
  );
}
