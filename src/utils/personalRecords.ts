// Récords personales: marcas propias en lugar de una nota. Se calculan con los
// trayectos del usuario; no hay récord de velocidad máxima a propósito.
import { supabase } from '../lib/supabase';
import type { Units } from '../types/database';
import { formatDistance, formatDuration } from './geo';
import { formatLaunchTime } from './launchTimer';

export type RecordKey = 'longest_distance' | 'longest_duration' | 'most_km_day' | 'best_0_100' | 'smoothest';

export interface RecordRow {
  id: string;
  started_at: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  zero_to_100_s: number | null;
  trip_metrics:
    | { hard_accelerations: number; hard_brakes: number; sharp_turns: number }
    | { hard_accelerations: number; hard_brakes: number; sharp_turns: number }[]
    | null;
}

export const RECORD_INFO: Record<RecordKey, { emoji: string; label: string; short: string; better: 'higher' | 'lower' }> = {
  longest_distance: { emoji: '🛣️', label: 'Trayecto más largo', short: 'Más largo', better: 'higher' },
  longest_duration: { emoji: '⏱️', label: 'Más tiempo al volante', short: 'Más tiempo', better: 'higher' },
  most_km_day: { emoji: '📅', label: 'Más km en un día', short: 'Más km en un día', better: 'higher' },
  best_0_100: { emoji: '🚀', label: 'Mejor 0-100 km/h', short: 'Mejor 0-100', better: 'lower' },
  smoothest: { emoji: '🧈', label: 'Trayecto más suave', short: 'Más suave', better: 'lower' },
};

export function formatRecordValue(key: RecordKey, value: number, units: Units): string {
  switch (key) {
    case 'longest_distance':
    case 'most_km_day':
      return formatDistance(value, units);
    case 'longest_duration':
      return formatDuration(value);
    case 'best_0_100':
      return formatLaunchTime(value);
    case 'smoothest':
      return `${value.toFixed(1).replace('.', ',')} bruscos/100 km`;
  }
}

/** Para "más suave" solo cuentan trayectos con algo de recorrido. */
const SMOOTH_MIN_METERS = 5000;

export function localDayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Acelerones + frenazos + curvas bruscas cada 100 km. */
export function eventsPer100Km(row: RecordRow): number | null {
  const m = Array.isArray(row.trip_metrics) ? row.trip_metrics[0] : row.trip_metrics;
  if (!m || (row.distance_meters ?? 0) < SMOOTH_MIN_METERS) return null;
  const events = m.hard_accelerations + m.hard_brakes + m.sharp_turns;
  return (events / (row.distance_meters as number)) * 100_000;
}

function valueOf(key: RecordKey, row: RecordRow, dayTotals: Map<string, number>): number | null {
  switch (key) {
    case 'longest_distance':
      return row.distance_meters || null;
    case 'longest_duration':
      return row.duration_seconds || null;
    case 'most_km_day':
      return dayTotals.get(localDayKey(row.started_at)) ?? null;
    case 'best_0_100':
      return row.zero_to_100_s;
    case 'smoothest':
      return eventsPer100Km(row);
  }
}

export interface PersonalRecord {
  key: RecordKey;
  value: number;
  tripId: string;
  previous: number | null;
}

export async function fetchRecordRows(userId: string): Promise<RecordRow[]> {
  const { data } = await supabase
    .from('trips')
    .select('id, started_at, distance_meters, duration_seconds, zero_to_100_s, trip_metrics(hard_accelerations, hard_brakes, sharp_turns)')
    .eq('user_id', userId)
    .order('started_at', { ascending: true });
  return (data ?? []) as RecordRow[];
}

function bests(rows: RecordRow[]): Map<RecordKey, PersonalRecord> {
  const dayTotals = new Map<string, number>();
  const out = new Map<RecordKey, PersonalRecord>();
  for (const row of rows) {
    const day = localDayKey(row.started_at);
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (row.distance_meters ?? 0));
    for (const key of Object.keys(RECORD_INFO) as RecordKey[]) {
      const value = valueOf(key, row, dayTotals);
      if (value == null) continue;
      const current = out.get(key);
      const better = RECORD_INFO[key].better === 'higher' ? value > (current?.value ?? -Infinity) : value < (current?.value ?? Infinity);
      if (better) out.set(key, { key, value, tripId: row.id, previous: current?.value ?? null });
    }
  }
  return out;
}

/** Mejores marcas actuales del usuario. */
export function currentRecords(rows: RecordRow[]): PersonalRecord[] {
  return [...bests(rows).values()];
}

/**
 * Récords que batió un trayecto frente a los anteriores. El primer trayecto no
 * cuenta: todo sería récord.
 */
export function recordsBrokenBy(rows: RecordRow[], tripId: string): PersonalRecord[] {
  const index = rows.findIndex((r) => r.id === tripId);
  if (index <= 0) return [];
  const before = bests(rows.slice(0, index));
  const after = bests(rows.slice(0, index + 1));
  const broken: PersonalRecord[] = [];
  for (const [key, record] of after) {
    const prev = before.get(key);
    if (record.tripId === tripId && prev) broken.push({ ...record, previous: prev.value });
  }
  return broken;
}
