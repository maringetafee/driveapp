// Trabajo tras guardar un trayecto: tiempos de la ruta, tramos recorridos y
// lugares visitados. Va en segundo plano para no retrasar el resumen; la
// pantalla del trayecto puede esperar a que termine con `tripProcessing`.
import type { LineString } from 'geojson';
import { supabase } from '../lib/supabase';
import { scanTripPlaces } from './places';
import { recordSegmentEfforts } from './segments';

export interface SavedTrip {
  id: string;
  user_id: string;
  started_at: string;
  route: LineString;
  /** Segundos desde el inicio de cada punto de la ruta. */
  times: number[];
}

const pending = new Map<string, Promise<void>>();

async function run(trip: SavedTrip) {
  // Por separado del insert: si la migración 0011 no está aplicada, el trayecto
  // ya está guardado y esto simplemente falla.
  const { error } = await supabase.from('trips').update({ route_times: trip.times }).eq('id', trip.id);
  if (error) return;
  await Promise.all([
    recordSegmentEfforts(trip).catch(() => {}),
    scanTripPlaces({ ...trip, route_geojson: trip.route }).catch(() => {}),
  ]);
}

export function processNewTrip(trip: SavedTrip): Promise<void> {
  const promise = run(trip).catch(() => {});
  pending.set(trip.id, promise);
  promise.finally(() => pending.delete(trip.id));
  return promise;
}

/** Resuelve cuando el procesado del trayecto (si lo hay en curso) termina. */
export function tripProcessing(tripId: string): Promise<void> {
  return pending.get(tripId) ?? Promise.resolve();
}

export function routeTimesFrom(points: { timestamp: number }[], startedAt: number): number[] {
  return points.map((p) => Math.round((p.timestamp - startedAt) / 100) / 10);
}
