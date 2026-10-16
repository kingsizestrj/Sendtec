import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import distance from '@turf/distance';
import { point } from '@turf/helpers';

/**
 * Área desenhada no mapa. Polígonos/retângulos vêm como GeoJSON Polygon;
 * círculos como { type: 'Circle', center: [lng, lat], radius: metros }.
 */
export type Area =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'Circle'; center: [number, number]; radius: number };

export function parseCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function insideAnyArea(lat: number, lng: number, areas: Area[]): boolean {
  const p = point([lng, lat]);
  return areas.some((a) => {
    if (a.type === 'Circle') return distance(point(a.center), p, { units: 'meters' }) <= a.radius;
    if (a.type === 'Polygon') return booleanPointInPolygon(p, { type: 'Polygon', coordinates: a.coordinates });
    return false;
  });
}
