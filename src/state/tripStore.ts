import { create } from 'zustand';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import type { LineString } from 'geojson';
import { haversineMeters, msToKmh, toLineString, type TripPoint } from '../utils/geo';
import { computeDrivingScore, DrivingMetricsTracker } from '../utils/drivingMetrics';

export interface TripSummary {
  startedAt: number;
  endedAt: number;
  distanceMeters: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  durationSeconds: number;
  route: LineString;
  drivingScore: number;
  hardAccelerations: number;
  hardBrakes: number;
  sharpTurns: number;
  gForceSeries: { t: number; x: number; y: number; z: number }[];
}

interface TripState {
  status: 'idle' | 'requesting' | 'tracking';
  points: TripPoint[];
  startedAt: number | null;
  distanceMeters: number;
  currentSpeedKmh: number;
  maxSpeedKmh: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => TripSummary | null;
}

let locationSubscription: Location.LocationSubscription | null = null;
let accelSubscription: { remove: () => void } | null = null;
let gyroSubscription: { remove: () => void } | null = null;
const metrics = new DrivingMetricsTracker();

export const useTripStore = create<TripState>((set, get) => ({
  status: 'idle',
  points: [],
  startedAt: null,
  distanceMeters: 0,
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
  error: null,

  start: async () => {
    set({ status: 'requesting', error: null });
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      set({ status: 'idle', error: 'Permiso de ubicación denegado.' });
      return;
    }

    metrics.reset();
    set({
      status: 'tracking',
      points: [],
      startedAt: Date.now(),
      distanceMeters: 0,
      currentSpeedKmh: 0,
      maxSpeedKmh: 0,
    });

    try {
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 3,
        },
        (location) => {
          const point: TripPoint = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
            speedMs: location.coords.speed,
          };
          const speedKmh = point.speedMs && point.speedMs > 0 ? msToKmh(point.speedMs) : 0;
          metrics.onSpeedSample(speedKmh, point.timestamp);

          set((state) => {
            const points = [...state.points, point];
            const prev = state.points[state.points.length - 1];
            const addedDistance = prev ? haversineMeters(prev, point) : 0;

            return {
              points,
              distanceMeters: state.distanceMeters + addedDistance,
              currentSpeedKmh: speedKmh,
              maxSpeedKmh: Math.max(state.maxSpeedKmh, speedKmh),
            };
          });
        }
      );
    } catch {
      set({ status: 'idle', error: 'No se pudo acceder al GPS. Comprueba que la ubicación de alta precisión esté activada.' });
      return;
    }

    Accelerometer.setUpdateInterval(200);
    accelSubscription = Accelerometer.addListener((sample) => {
      metrics.onAccelSample({ x: sample.x, y: sample.y, z: sample.z, timestamp: sample.timestamp * 1000 });
    });

    Gyroscope.setUpdateInterval(200);
    gyroSubscription = Gyroscope.addListener((sample) => {
      metrics.onGyroSample({ z: sample.z, timestamp: sample.timestamp * 1000 });
    });
  },

  stop: () => {
    locationSubscription?.remove();
    locationSubscription = null;
    accelSubscription?.remove();
    accelSubscription = null;
    gyroSubscription?.remove();
    gyroSubscription = null;

    const state = get();
    if (state.status !== 'tracking' || !state.startedAt) {
      set({ status: 'idle' });
      return null;
    }

    const endedAt = Date.now();
    const durationSeconds = Math.max(1, Math.round((endedAt - state.startedAt) / 1000));
    const avgSpeedKmh = state.distanceMeters / 1000 / (durationSeconds / 3600);

    const summary: TripSummary = {
      startedAt: state.startedAt,
      endedAt,
      distanceMeters: state.distanceMeters,
      maxSpeedKmh: state.maxSpeedKmh,
      avgSpeedKmh: Number.isFinite(avgSpeedKmh) ? avgSpeedKmh : 0,
      durationSeconds,
      route: toLineString(state.points),
      hardAccelerations: metrics.hardAccelerations,
      hardBrakes: metrics.hardBrakes,
      sharpTurns: metrics.sharpTurns,
      gForceSeries: metrics.gForceSeries,
      drivingScore: computeDrivingScore({
        hardAccelerations: metrics.hardAccelerations,
        hardBrakes: metrics.hardBrakes,
        sharpTurns: metrics.sharpTurns,
        durationSeconds,
      }),
    };

    set({ status: 'idle', points: [], startedAt: null, distanceMeters: 0, currentSpeedKmh: 0, maxSpeedKmh: 0 });
    return summary;
  },
}));
