import { supabase } from '../lib/supabase';
import { computeStreak } from './homeInsights';

export interface AggregateTripStats {
  tripCount: number;
  totalDistanceMeters: number;
  avgDrivingScore: number | null;
  bestDrivingScore: number | null;
  maxSpeedKmh: number;
  longestTripMeters: number;
  best0to100Seconds: number | null;
  streak: number;
}

const EMPTY: AggregateTripStats = {
  tripCount: 0,
  totalDistanceMeters: 0,
  avgDrivingScore: null,
  bestDrivingScore: null,
  maxSpeedKmh: 0,
  longestTripMeters: 0,
  best0to100Seconds: null,
  streak: 0,
};

/** One shared aggregation used by both the own profile and public profile screens, so "best marks" always mean the same thing everywhere. */
export async function fetchAggregateTripStats(userId: string): Promise<AggregateTripStats> {
  const { data } = await supabase
    .from('trips')
    .select('distance_meters, driving_score, max_speed_kmh, zero_to_100_s, started_at')
    .eq('user_id', userId);

  const trips = data ?? [];
  if (trips.length === 0) return EMPTY;

  const scored = trips.filter((t) => t.driving_score != null);
  const launches = trips.map((t) => t.zero_to_100_s).filter((s): s is number => s != null);

  return {
    tripCount: trips.length,
    totalDistanceMeters: trips.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
    avgDrivingScore: scored.length
      ? Math.round(scored.reduce((sum, t) => sum + (t.driving_score ?? 0), 0) / scored.length)
      : null,
    bestDrivingScore: scored.length ? Math.max(...scored.map((t) => t.driving_score ?? 0)) : null,
    maxSpeedKmh: trips.reduce((max, t) => Math.max(max, t.max_speed_kmh ?? 0), 0),
    longestTripMeters: trips.reduce((max, t) => Math.max(max, t.distance_meters ?? 0), 0),
    best0to100Seconds: launches.length ? Math.min(...launches) : null,
    streak: computeStreak(trips.map((t) => t.started_at)),
  };
}
