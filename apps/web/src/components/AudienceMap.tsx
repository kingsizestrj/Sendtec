import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { Area } from '../lib/types';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  color: string;
  radius?: number;
  popup?: () => HTMLElement | string;
}

const AREA_STYLE = { color: '#f0abfc', weight: 2, fillColor: '#d946ef', fillOpacity: 0.12, dashArray: '6 6' };

/** Camada de pontos desenhada em canvas (aguenta dezenas de milhares de clientes). */
function PointsLayer({ points, fit }: { points: MapPoint[]; fit: boolean }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup();
    for (const p of points) {
      const m = L.circleMarker([p.lat, p.lng], {
        renderer,
        radius: p.radius ?? 5,
        color: '#0d0b18',
        weight: 1,
        fillColor: p.color,
        fillOpacity: 0.95,
        pmIgnore: true,
      } as L.CircleMarkerOptions);
      if (p.popup) m.bindPopup(() => p.popup!());
      group.addLayer(m);
    }
    group.addTo(map);
    if (fit && !fitted.current && points.length) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
      fitted.current = true;
    }
    return () => {
      group.remove();
    };
  }, [points, map, fit]);
  return null;
}

function toArea(layer: L.Layer): Area | null {
  if (layer instanceof L.Circle) {
    const c = layer.getLatLng();
    return { type: 'Circle', center: [c.lng, c.lat], radius: layer.getRadius() };
  }
  if (layer instanceof L.Polygon) {
    const geom = layer.toGeoJSON().geometry;
    if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.coordinates as number[][][] };
  }
  return null;
}

/** Ferramentas de desenho (polígono, retângulo, círculo) com edição e remoção. */
function DrawTools({ initial, onChange }: { initial: Area[]; onChange: (areas: Area[]) => void }) {
  const map = useMap();
  const layers = useRef(new Set<L.Layer>());
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    const emit = () => cb.current([...layers.current].map(toArea).filter(Boolean) as Area[]);
    const watch = (layer: L.Layer) => {
      layers.current.add(layer);
      layer.on('pm:edit pm:dragend', emit);
    };

    map.pm.setLang('pt_br');
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      drawPolygon: true,
      drawRectangle: true,
      drawCircle: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
    });
    map.pm.setPathOptions(AREA_STYLE);

    // áreas já salvas (edição de campanha)
    for (const a of initial) {
      const layer =
        a.type === 'Circle'
          ? L.circle([a.center[1], a.center[0]], { radius: a.radius, ...AREA_STYLE })
          : L.polygon(a.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]), AREA_STYLE);
      layer.addTo(map);
      watch(layer);
    }
    if (initial.length) {
      const b = L.featureGroup([...layers.current] as L.Layer[]).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
    }

    const onCreate = (e: { layer: L.Layer }) => {
      watch(e.layer);
      emit();
    };
    const onRemove = (e: { layer: L.Layer }) => {
      layers.current.delete(e.layer);
      emit();
    };
    map.on('pm:create', onCreate as any);
    map.on('pm:remove', onRemove as any);
    return () => {
      map.off('pm:create', onCreate as any);
      map.off('pm:remove', onRemove as any);
      map.pm.removeControls();
      layers.current.forEach((l) => l.remove());
      layers.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

export function AudienceMap({
  center,
  points,
  areas,
  onAreasChange,
  height = 520,
  fitToPoints = true,
}: {
  center: [number, number];
  points: MapPoint[];
  areas?: Area[];
  onAreasChange?: (areas: Area[]) => void;
  height?: number;
  fitToPoints?: boolean;
}) {
  return (
    <div style={{ height }} className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <MapContainer center={center} zoom={12} style={{ height: '100%' }} preferCanvas>
        <TileLayer
          className="dark-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PointsLayer points={points} fit={fitToPoints && !(areas && areas.length)} />
        {onAreasChange && <DrawTools initial={areas ?? []} onChange={onAreasChange} />}
      </MapContainer>
    </div>
  );
}
