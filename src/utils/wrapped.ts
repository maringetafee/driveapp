// Resumen tipo "Wrapped" de un mes o un año: kilómetros, dinero, lugares,
// hábitos y marcas del periodo.
import type { LineString } from 'geojson';
import { supabase } from '../lib/supabase';
import type { Trip } from '../types/database';
import { fetchConqueredPlaces } from './places';
import { eventsPer100Km, localDayKey, type RecordRow } from './personalRecords';

export type WrappedPeriod = { kind: 'month'; year: number; month: number } | { kind: 'year'; year: number };

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MADRID_BARCELONA_KM = 620;

export function periodRange(period: WrappedPeriod): { since: Date; until: Date } {
  if (period.kind === 'year') return { since: new Date(period.year, 0, 1), until: new Date(period.year + 1, 0, 1) };
  return { since: new Date(period.year, period.month, 1), until: new Date(period.year, period.month + 1, 1) };
}

export function periodLabel(period: WrappedPeriod): string {
  return period.kind === 'year' ? String(period.year) : `${MONTHS[period.month]} ${period.year}`;
}

/** El mes anterior al actual, que es el que se propone ver al empezar un mes. */
export function previousMonth(now = new Date()): WrappedPeriod {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() };
}

export function shiftPeriod(period: WrappedPeriod, delta: number): WrappedPeriod {
  if (period.kind === 'year') return { kind: 'year', year: period.year + delta };
  const d = new Date(period.year, period.month + delta, 1);
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() };
}

function partOfDay(hour: number) {
  if (hour < 6) return { label: 'de madrugada', emoji: '🌌' };
  if (hour < 12) return { label: 'por la mañana', emoji: '🌅' };
  if (hour < 16) return { label: 'a mediodía', emoji: '☀️' };
  if (hour < 21) return { label: 'por la tarde', emoji: '🌇' };
  return { label: 'por la noche', emoji: '🌙' };
}

export interface WrappedData {
  tripCount: number;
  distanceMeters: number;
  durationSeconds: number;
  madridBarcelonaTimes: number;
  activeDays: number;
  energyCostEur: number;
  costedDistanceMeters: number;
  favouritePartOfDay: { label: string; emoji: string; share: number } | null;
  favouriteWeekday: { label: string; distanceMeters: number } | null;
  longestTrip: Pick<Trip, 'id' | 'distance_meters' | 'started_at'> | null;
  bestDay: { day: string; distanceMeters: number } | null;
  smoothestTrip: { id: string; eventsPer100Km: number } | null;
  municipalities: number;
  provinces: number;
  newMunicipalities: number;
  newProvinces: string[];
  segmentEfforts: number;
  segmentPersonalBests: number;
  routes: LineString[];
}

export async function fetchWrapped(userId: string, period: WrappedPeriod): Promise<WrappedData> {
  const { since, until } = periodRange(period);
  const [{ data: tripRows }, placesInPeriod, allPlaces, { data: effortRows }] = await Promise.all([
    supabase
      .from('trips')
      .select('*, trip_metrics(hard_accelerations, hard_brakes, sharp_turns)')
      .eq('user_id', userId)
      .gte('started_at', since.toISOString())
      .lt('started_at', until.toISOString())
      .order('started_at', { ascending: true }),
    fetchConqueredPlaces(userId, since, until),
    fetchConqueredPlaces(userId),
    supabase.from('segment_efforts').select('segment_id, speed_stddev_kmh, started_at').eq('user_id', userId),
  ]);

  const trips = (tripRows ?? []) as (Trip & Pick<RecordRow, 'trip_metrics'>)[];
  const distanceMeters = trips.reduce((s, t) => s + (t.distance_meters ?? 0), 0);

  const dayTotals = new Map<string, number>();
  const partTotals = new Map<string, { label: string; emoji: string; meters: number }>();
  const weekdayTotals = new Map<number, number>();
  let smoothest: WrappedData['smoothestTrip'] = null;
  for (const t of trips) {
    const meters = t.distance_meters ?? 0;
    const start = new Date(t.started_at);
    const day = localDayKey(t.started_at);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + meters);
    const part = partOfDay(start.getHours());
    const prev = partTotals.get(part.label) ?? { ...part, meters: 0 };
    prev.meters += meters;
    partTotals.set(part.label, prev);
    weekdayTotals.set(start.getDay(), (weekdayTotals.get(start.getDay()) ?? 0) + meters);
    const events = eventsPer100Km(t as unknown as RecordRow);
    if (events != null && (!smoothest || events < smoothest.eventsPer100Km)) smoothest = { id: t.id, eventsPer100Km: events };
  }

  const topPart = [...partTotals.values()].sort((a, b) => b.meters - a.meters)[0];
  const topWeekday = [...weekdayTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDay = [...dayTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  const longest = [...trips].sort((a, b) => (b.distance_meters ?? 0) - (a.distance_meters ?? 0))[0];

  // Lugares nuevos: los que se visitaron por primera vez dentro del periodo.
  const inPeriod = (iso: string) => new Date(iso) >= since && new Date(iso) < until;
  const newMunicipalities = allPlaces.municipalities.filter((m) => inPeriod(m.firstVisit));
  const firstProvinceVisit = new Map<string, string>();
  for (const m of allPlaces.municipalities) {
    const prev = firstProvinceVisit.get(m.provinceCode);
    if (!prev || m.firstVisit < prev) firstProvinceVisit.set(m.provinceCode, m.firstVisit);
  }
  const newProvinces = allPlaces.provinces.filter((p) => inPeriod(firstProvinceVisit.get(p.code) ?? '')).map((p) => p.name);

  // Mejores marcas en tramos logradas dentro del periodo.
  const efforts = (effortRows ?? []).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const bestSoFar = new Map<string, number>();
  let segmentEfforts = 0;
  let segmentPersonalBests = 0;
  for (const e of efforts) {
    const prev = bestSoFar.get(e.segment_id);
    const improved = prev == null || e.speed_stddev_kmh < prev;
    if (improved) bestSoFar.set(e.segment_id, e.speed_stddev_kmh);
    if (inPeriod(e.started_at)) {
      segmentEfforts++;
      if (improved && prev != null) segmentPersonalBests++;
    }
  }

  return {
    tripCount: trips.length,
    distanceMeters,
    durationSeconds: trips.reduce((s, t) => s + (t.duration_seconds ?? 0), 0),
    madridBarcelonaTimes: distanceMeters / 1000 / MADRID_BARCELONA_KM,
    activeDays: dayTotals.size,
    energyCostEur: trips.reduce((s, t) => s + (t.energy_cost_eur ?? 0), 0),
    costedDistanceMeters: trips.filter((t) => t.energy_cost_eur != null).reduce((s, t) => s + (t.distance_meters ?? 0), 0),
    favouritePartOfDay: topPart
      ? { label: topPart.label, emoji: topPart.emoji, share: distanceMeters ? topPart.meters / distanceMeters : 0 }
      : null,
    favouriteWeekday: topWeekday ? { label: WEEKDAYS[topWeekday[0]], distanceMeters: topWeekday[1] } : null,
    longestTrip: longest ?? null,
    bestDay: topDay ? { day: topDay[0], distanceMeters: topDay[1] } : null,
    smoothestTrip: smoothest,
    municipalities: placesInPeriod.municipalities.length,
    provinces: placesInPeriod.provinces.length,
    newMunicipalities: newMunicipalities.length,
    newProvinces,
    segmentEfforts,
    segmentPersonalBests,
    routes: trips.map((t) => t.route_geojson).filter((r): r is LineString => !!r && r.coordinates.length > 1),
  };
}
