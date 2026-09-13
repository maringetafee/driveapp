import type { LineString } from 'geojson';

export interface TripPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  speedMs: number | null;
}

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: TripPoint, b: TripPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function msToKmh(ms: number): number {
  return ms * 3.6;
}

export function kmhToMph(kmh: number): number {
  return kmh * 0.621371;
}

export function formatSpeed(kmh: number, units: 'kmh' | 'mph'): string {
  const value = units === 'mph' ? kmhToMph(kmh) : kmh;
  return `${value.toFixed(0)} ${units === 'mph' ? 'mph' : 'km/h'}`;
}

export function formatDistance(meters: number, units: 'kmh' | 'mph'): string {
  const value = units === 'mph' ? meters / 1609.34 : meters / 1000;
  return `${value.toFixed(2)} ${units === 'mph' ? 'mi' : 'km'}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function toLineString(points: TripPoint[]): LineString {
  return {
    type: 'LineString',
    coordinates: points.map((p) => [p.longitude, p.latitude]),
  };
}
