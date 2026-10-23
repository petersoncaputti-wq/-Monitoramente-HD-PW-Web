export function KartadoReportingMap({ coordinates, numero }: { coordinates: number[] | null; numero: string | null }) {
  // GeoJSON usa longitude primeiro. A camada padrão usa projeção Web Mercator.
  const longitude = coordinates?.[0];
  const latitude = coordinates?.[1];
  if (longitude == null || latitude == null || !Number.isFinite(longitude) || !Number.isFinite(latitude)
    || Math.abs(longitude) > 180 || Math.abs(latitude) > 85.05112878) {
    return <p className="rounded-xl bg-brand-50 p-4 text-sm text-surface-600">Mapa indisponível: este apontamento não possui coordenadas válidas para exibição.</p>;
  }
  const deltaLatitude = 0.003;
  const deltaLongitude = deltaLatitude / Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  const bbox = [Math.max(-180, longitude - deltaLongitude), Math.max(-85.05112878, latitude - deltaLatitude),
    Math.min(180, longitude + deltaLongitude), Math.min(85.05112878, latitude + deltaLatitude)].join(',');
  const params = new URLSearchParams({ bbox, layer: 'mapnik', marker: `${latitude},${longitude}` });
  return <div className="space-y-3">
    <div className="overflow-hidden rounded-2xl border border-brand-100 bg-brand-50">
      <iframe title={`Mapa da localização do apontamento ${numero || ''}`} src={`https://www.openstreetmap.org/export/embed.html?${params}`}
        loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-80 w-full border-0 sm:h-96" />
    </div>
    <p className="text-xs leading-5 text-surface-600">O marcador indica as coordenadas registradas no apontamento: {latitude.toFixed(6)}, {longitude.toFixed(6)}. Use os controles do mapa para ajustar o zoom.</p>
    <p className="text-[11px] text-surface-500">Mapa: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">© colaboradores do OpenStreetMap</a>.</p>
  </div>;
}
