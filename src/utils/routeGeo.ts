// Geometría sobre rutas [lon, lat]: distancias, tramos y remuestreo. Usa una
// proyección equirectangular local, de sobra precisa para tramos de pocos km.
import type { LineString, Position } from 'geojson';

const EARTH_RADIUS_M = 6371000;
const RAD = Math.PI / 180;

export function distanceM(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Distancia acumulada en metros hasta cada punto. */
export function cumulativeDistances(coords: Position[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distanceM(coords[i - 1], coords[i]));
  return out;
}

export function lineLength(coords: Position[]): number {
  const cum = cumulativeDistances(coords);
  return cum[cum.length - 1] ?? 0;
}

/** Distancia de un punto al segmento a-b, en metros. */
function pointToSegmentM(p: Position, a: Position, b: Position): number {
  const cos = Math.cos(p[1] * RAD);
  const ax = (a[0] - p[0]) * cos * RAD * EARTH_RADIUS_M;
  const ay = (a[1] - p[1]) * RAD * EARTH_RADIUS_M;
  const bx = (b[0] - p[0]) * cos * RAD * EARTH_RADIUS_M;
  const by = (b[1] - p[1]) * RAD * EARTH_RADIUS_M;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function pointToLineM(p: Position, coords: Position[], from = 0, to = coords.length - 1): number {
  let best = Infinity;
  for (let i = Math.max(0, from); i < Math.min(to, coords.length - 1); i++) {
    best = Math.min(best, pointToSegmentM(p, coords[i], coords[i + 1]));
  }
  return best;
}

/** Puntos cada `stepM` metros a lo largo de la línea (incluye el primero y el último). */
export function resample(coords: Position[], stepM: number): Position[] {
  if (coords.length < 2) return coords;
  const cum = cumulativeDistances(coords);
  const total = cum[cum.length - 1];
  const out: Position[] = [];
  let seg = 0;
  for (let d = 0; d < total; d += stepM) {
    while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
    const span = cum[seg + 1] - cum[seg] || 1;
    const t = (d - cum[seg]) / span;
    const a = coords[seg];
    const b = coords[seg + 1];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  out.push(coords[coords.length - 1]);
  return out;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function boundsOf(coords: Position[]): Bounds {
  const b = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const [lon, lat] of coords) {
    b.minLat = Math.min(b.minLat, lat);
    b.maxLat = Math.max(b.maxLat, lat);
    b.minLon = Math.min(b.minLon, lon);
    b.maxLon = Math.max(b.maxLon, lon);
  }
  return b;
}

/** Tramo de la línea entre dos distancias a lo largo de ella. */
export function sliceByDistance(coords: Position[], fromM: number, toM: number): LineString {
  const cum = cumulativeDistances(coords);
  const pointAt = (d: number): Position => {
    let i = 0;
    while (i < cum.length - 2 && cum[i + 1] < d) i++;
    const span = cum[i + 1] - cum[i] || 1;
    const t = Math.max(0, Math.min(1, (d - cum[i]) / span));
    return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
  };
  const inner = coords.filter((_, i) => cum[i] > fromM && cum[i] < toM);
  return { type: 'LineString', coordinates: [pointAt(fromM), ...inner, pointAt(toM)] };
}
