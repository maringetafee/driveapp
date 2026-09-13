import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../lib/supabase';
import { haversineMeters, msToKmh, toLineString, type TripPoint } from '../utils/geo';

export const AUTO_TRIP_TASK = 'driverank-auto-trip';
const STATE_KEY = 'driverank-auto-trip-state';

// Umbrales del detector automático: por debajo de START_SPEED_KMH no arrancamos
// trayecto (evita crear trayectos al caminar); por debajo de STOP_SPEED_KMH
// durante STOP_DURATION_MS seguidos, asumimos que el trayecto terminó (semáforo,
// atasco corto no lo corta; parking sí).
const START_SPEED_KMH = 15;
const STOP_SPEED_KMH = 5;
const STOP_DURATION_MS = 3 * 60 * 1000;

interface AutoTripState {
  status: 'idle' | 'tracking';
  points: TripPoint[];
  startedAt: number | null;
  belowStopThresholdSince: number | null;
}

const idleState: AutoTripState = {
  status: 'idle',
  points: [],
  startedAt: null,
  belowStopThresholdSince: null,
};

async function loadState(): Promise<AutoTripState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  return raw ? (JSON.parse(raw) as AutoTripState) : idleState;
}

async function saveState(state: AutoTripState): Promise<void> {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

async function saveTrip(state: AutoTripState) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId || !state.startedAt || state.points.length < 2) return;

  const endedAt = Date.now();
  const durationSeconds = Math.max(1, Math.round((endedAt - state.startedAt) / 1000));

  let distanceMeters = 0;
  let maxSpeedKmh = 0;
  for (let i = 1; i < state.points.length; i++) {
    distanceMeters += haversineMeters(state.points[i - 1], state.points[i]);
    const speedKmh = state.points[i].speedMs ? msToKmh(state.points[i].speedMs as number) : 0;
    maxSpeedKmh = Math.max(maxSpeedKmh, speedKmh);
  }
  const avgSpeedKmh = distanceMeters / 1000 / (durationSeconds / 3600);

  await supabase.from('trips').insert({
    user_id: userId,
    started_at: new Date(state.startedAt).toISOString(),
    ended_at: new Date(endedAt).toISOString(),
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters,
    avg_speed_kmh: Number.isFinite(avgSpeedKmh) ? avgSpeedKmh : 0,
    max_speed_kmh: maxSpeedKmh,
    route_geojson: toLineString(state.points),
  });
}

TaskManager.defineTask(AUTO_TRIP_TASK, async ({ data, error }) => {
  if (error || !data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations?.length) return;

  let state = await loadState();

  for (const location of locations) {
    const point: TripPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: location.timestamp,
      speedMs: location.coords.speed,
    };
    const speedKmh = point.speedMs && point.speedMs > 0 ? msToKmh(point.speedMs) : 0;

    if (state.status === 'idle') {
      if (speedKmh >= START_SPEED_KMH) {
        state = { status: 'tracking', points: [point], startedAt: point.timestamp, belowStopThresholdSince: null };
      }
      continue;
    }

    // status === 'tracking'
    state.points.push(point);

    if (speedKmh < STOP_SPEED_KMH) {
      if (!state.belowStopThresholdSince) {
        state.belowStopThresholdSince = point.timestamp;
      } else if (point.timestamp - state.belowStopThresholdSince >= STOP_DURATION_MS) {
        await saveTrip(state);
        state = { ...idleState };
      }
    } else {
      state.belowStopThresholdSince = null;
    }
  }

  await saveState(state);
});

export async function isAutoTrackingEnabled(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(AUTO_TRIP_TASK);
}

export async function enableAutoTracking(): Promise<{ ok: boolean; error?: string }> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { ok: false, error: 'Permiso de ubicación denegado.' };
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    return { ok: false, error: 'DriveRank necesita ubicación "Siempre" para detectar trayectos en segundo plano.' };
  }

  await saveState(idleState);
  try {
    await Location.startLocationUpdatesAsync(AUTO_TRIP_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 25,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'DriveRank está detectando trayectos',
        notificationBody: 'Se detendrá automáticamente cuando pares el coche.',
      },
      pausesUpdatesAutomatically: false,
    });
  } catch {
    return { ok: false, error: 'No se pudo acceder al GPS. Comprueba que la ubicación de alta precisión esté activada.' };
  }
  return { ok: true };
}

export async function disableAutoTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(AUTO_TRIP_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(AUTO_TRIP_TASK);
  }
}
