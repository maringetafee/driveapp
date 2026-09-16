// Tramos tipo Strava. No se compite por tiempo sino por regularidad: la
// desviación típica de la velocidad dentro del tramo (menos = conducción más
// fluida, sin acelerones ni frenazos).
import type { LineString, Position } from 'geojson';
import { supabase } from '../lib/supabase';
import type { Segment, SegmentEffort } from '../types/database';
import { boundsOf, cumulativeDistances, distanceM, lineLength, pointToLineM, resample } from './routeGeo';

export const MIN_SEGMENT_METERS = 500;
const ENDPOINT_RADIUS_M = 35;
const COVERAGE_STEP_M = 50;
const COVERAGE_TOLERANCE_M = 40;
const MIN_COVERAGE = 0.9;
const SPEED_WINDOW_S = 5;
const STOP_SPEED_KMH = 5;

export interface EffortStats {
  startIndex: number;
  endIndex: number;
  durationSeconds: number;
  avgSpeedKmh: number;
  speedStddevKmh: number;
  stops: number;
}

export function formatRegularity(stddevKmh: number): string {
  return `±${stddevKmh.toFixed(1).replace('.', ',')} km/h`;
}

/** Índice del punto más cercano a `target` dentro del radio, empezando en `from`. */
function nextNear(coords: Position[], target: Position, from: number, radius: number): number {
  for (let i = from; i < coords.length; i++) {
    if (distanceM(coords[i], target) >= radius) continue;
    // Avanza mientras el siguiente punto esté aún más cerca.
    let best = i;
    while (best + 1 < coords.length && distanceM(coords[best + 1], target) < distanceM(coords[best], target)) best++;
    return best;
  }
  return -1;
}

function statsBetween(coords: Position[], times: number[], i: number, j: number, distance: number): EffortStats {
  const speeds: number[] = [];
  let windowDist = 0;
  let windowStart = times[i];
  for (let k = i + 1; k <= j; k++) {
    windowDist += distanceM(coords[k - 1], coords[k]);
    const dt = times[k] - windowStart;
    if (dt >= SPEED_WINDOW_S) {
      speeds.push((windowDist / dt) * 3.6);
      windowDist = 0;
      windowStart = times[k];
    }
  }
  const durationSeconds = Math.max(1, times[j] - times[i]);
  const mean = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const variance = speeds.length ? speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length : 0;
  let stops = 0;
  for (let k = 0; k < speeds.length; k++) {
    if (speeds[k] < STOP_SPEED_KMH && (k === 0 || speeds[k - 1] >= STOP_SPEED_KMH)) stops++;
  }
  return {
    startIndex: i,
    endIndex: j,
    durationSeconds,
    avgSpeedKmh: (distance / durationSeconds) * 3.6,
    speedStddevKmh: Math.sqrt(variance),
    stops,
  };
}

/** Primera pasada completa del recorrido por el tramo, o null si no lo recorre entero. */
export function matchSegment(segment: LineString, coords: Position[], times: number[]): EffortStats | null {
  const seg = segment.coordinates;
  if (seg.length < 2 || coords.length < 2 || times.length !== coords.length) return null;
  const segLength = lineLength(seg);
  const start = seg[0];
  const end = seg[seg.length - 1];
  const samples = resample(seg, COVERAGE_STEP_M);
  const cum = cumulativeDistances(coords);

  let from = 0;
  while (from < coords.length) {
    const i = nextNear(coords, start, from, ENDPOINT_RADIUS_M);
    if (i < 0) return null;

    let j = nextNear(coords, end, i + 1, ENDPOINT_RADIUS_M);
    while (j >= 0 && cum[j] - cum[i] < segLength * 0.8) j = nextNear(coords, end, j + 1, ENDPOINT_RADIUS_M);

    if (j >= 0 && cum[j] - cum[i] <= segLength * 1.3) {
      const covered = samples.filter((p) => pointToLineM(p, coords, i, j) <= COVERAGE_TOLERANCE_M).length;
      if (covered / samples.length >= MIN_COVERAGE) {
        return statsBetween(coords, times, i, j, cum[j] - cum[i]);
      }
    }
    // Sal del radio del inicio antes de buscar otra pasada.
    from = i + 1;
    while (from < coords.length && distanceM(coords[from], start) < ENDPOINT_RADIUS_M) from++;
  }
  return null;
}

export interface MatchedEffort {
  segment: Segment;
  effort: SegmentEffort;
  /** Es el intento más regular del usuario en ese tramo. */
  personalBest: boolean;
  previousBest: number | null;
}

function effortRow(
  segmentId: string,
  trip: { id: string; user_id: string; started_at: string },
  times: number[],
  stats: EffortStats
) {
  return {
    segment_id: segmentId,
    trip_id: trip.id,
    user_id: trip.user_id,
    started_at: new Date(new Date(trip.started_at).getTime() + times[stats.startIndex] * 1000).toISOString(),
    duration_seconds: Math.round(stats.durationSeconds),
    avg_speed_kmh: Math.round(stats.avgSpeedKmh * 10) / 10,
    speed_stddev_kmh: Math.round(stats.speedStddevKmh * 10) / 10,
    stops: stats.stops,
  };
}

/** Busca los tramos que recorre un trayecto y guarda cada intento. */
export async function recordSegmentEfforts(trip: {
  id: string;
  user_id: string;
  started_at: string;
  route: LineString;
  times: number[];
}): Promise<void> {
  const coords = trip.route.coordinates;
  if (coords.length < 2) return;
  const b = boundsOf(coords);
  const { data: segments } = await supabase
    .from('segments')
    .select('*')
    .lte('min_lat', b.maxLat)
    .gte('max_lat', b.minLat)
    .lte('min_lon', b.maxLon)
    .gte('max_lon', b.minLon)
    .limit(200);

  const rows = [];
  for (const segment of (segments ?? []) as Segment[]) {
    const stats = matchSegment(segment.geometry, coords, trip.times);
    if (stats) rows.push(effortRow(segment.id, trip, trip.times, stats));
  }
  if (rows.length) await supabase.from('segment_efforts').upsert(rows, { onConflict: 'segment_id,trip_id', ignoreDuplicates: true });
}

/** Al crear un tramo, busca intentos en los trayectos anteriores del usuario. */
export async function backfillSegment(segment: Segment, userId: string): Promise<number> {
  const { data: trips } = await supabase
    .from('trips')
    .select('id, user_id, started_at, route_geojson, route_times')
    .eq('user_id', userId)
    .not('route_times', 'is', null)
    .order('started_at', { ascending: false })
    .limit(150);

  const rows = [];
  for (const trip of trips ?? []) {
    const route = trip.route_geojson as LineString | null;
    const times = trip.route_times as number[] | null;
    if (!route || !times) continue;
    const b = boundsOf(route.coordinates);
    if (b.maxLat < segment.min_lat || b.minLat > segment.max_lat || b.maxLon < segment.min_lon || b.minLon > segment.max_lon) {
      continue;
    }
    const stats = matchSegment(segment.geometry, route.coordinates, times);
    if (stats) rows.push(effortRow(segment.id, trip, times, stats));
  }
  if (rows.length) await supabase.from('segment_efforts').upsert(rows, { onConflict: 'segment_id,trip_id', ignoreDuplicates: true });
  return rows.length;
}

/** Intentos de un trayecto con su tramo y si mejoran la marca personal. */
export async function effortsForTrip(tripId: string, userId: string): Promise<MatchedEffort[]> {
  const { data } = await supabase.from('segment_efforts').select('*, segments(*)').eq('trip_id', tripId);
  const efforts = (data ?? []) as (SegmentEffort & { segments: Segment })[];
  if (!efforts.length) return [];

  const { data: previous } = await supabase
    .from('segment_efforts')
    .select('segment_id, speed_stddev_kmh, started_at')
    .eq('user_id', userId)
    .in(
      'segment_id',
      efforts.map((e) => e.segment_id)
    );

  return efforts.map(({ segments, ...effort }) => {
    const earlier = (previous ?? []).filter(
      (p) => p.segment_id === effort.segment_id && new Date(p.started_at) < new Date(effort.started_at)
    );
    const previousBest = earlier.length ? Math.min(...earlier.map((p) => p.speed_stddev_kmh)) : null;
    return {
      segment: segments,
      effort,
      previousBest,
      personalBest: previousBest == null || effort.speed_stddev_kmh < previousBest,
    };
  });
}
