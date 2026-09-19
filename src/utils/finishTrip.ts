import { Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTripStore, type TripSummary } from '../state/tripStore';
import { processNewTrip } from './tripPostProcess';
import { isTripTooShort, MIN_TRIP_DISTANCE_METERS, MIN_TRIP_DURATION_SECONDS } from './tripRules';

interface FinishOptions {
  onSavingChange?: (saving: boolean) => void;
  /** Sustituye la pantalla actual por el resumen (p. ej. desde el navegador). */
  replace?: boolean;
}

async function insertTrip(userId: string, summary: TripSummary): Promise<string | null> {
  const { data: defaultVehicle } = await supabase
    .from('vehicles')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  const { data, error } = await supabase
    .from('trips')
    .insert({
      user_id: userId,
      vehicle_id: defaultVehicle?.id ?? null,
      started_at: new Date(summary.startedAt).toISOString(),
      ended_at: new Date(summary.endedAt).toISOString(),
      duration_seconds: summary.durationSeconds,
      distance_meters: summary.distanceMeters,
      avg_speed_kmh: summary.avgSpeedKmh,
      max_speed_kmh: summary.maxSpeedKmh,
      route_geojson: summary.route,
      ...(summary.zeroTo50Seconds != null ? { zero_to_50_s: summary.zeroTo50Seconds } : {}),
      ...(summary.zeroTo100Seconds != null ? { zero_to_100_s: summary.zeroTo100Seconds } : {}),
    })
    .select('id, started_at')
    .single();
  if (error || !data) return null;

  processNewTrip({
    id: data.id,
    user_id: userId,
    started_at: data.started_at,
    route: summary.route,
    times: summary.routeTimes,
  });

  await supabase.from('trip_metrics').insert({
    trip_id: data.id,
    hard_accelerations: summary.hardAccelerations,
    hard_brakes: summary.hardBrakes,
    sharp_turns: summary.sharpTurns,
    g_force_series: summary.gForceSeries,
  });
  return data.id;
}

async function saveWithRetry(userId: string, summary: TripSummary, options: FinishOptions) {
  options.onSavingChange?.(true);
  const id = await insertTrip(userId, summary);
  options.onSavingChange?.(false);

  if (!id) {
    Alert.alert('No se pudo guardar el trayecto', 'Comprueba tu conexión e inténtalo de nuevo.', [
      { text: 'Descartar', style: 'destructive' },
      { text: 'Reintentar', onPress: () => saveWithRetry(userId, summary, options) },
    ]);
    return;
  }
  if (options.replace) router.replace(`/trip/${id}`);
  else router.push(`/trip/${id}`);
}

/** Termina el trayecto en curso y lo guarda; si falla, ofrece reintentar sin perderlo. */
export async function finishTrip(userId: string, options: FinishOptions = {}) {
  const summary = useTripStore.getState().stop();
  if (!summary) return;
  if (isTripTooShort(summary.distanceMeters, summary.durationSeconds)) {
    Alert.alert(
      'Trayecto demasiado corto',
      `No lo hemos guardado. Para contar, un trayecto debe durar al menos ${MIN_TRIP_DURATION_SECONDS} segundos y recorrer ${MIN_TRIP_DISTANCE_METERS} metros.`
    );
    return;
  }
  await saveWithRetry(userId, summary, options);
}
