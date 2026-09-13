import type { LineString } from 'geojson';

// Tipos alineados a mano con supabase/migrations/0001_init.sql.
// Cuando el proyecto Supabase exista, sustituir por:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Units = 'kmh' | 'mph';
export type LeaderboardMetric = 'max_speed' | 'total_distance' | 'driving_score' | 'trip_count';
export type LeaderboardScope = 'friends' | 'city' | 'country' | 'global';
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
  units: Units;
  onboarded_at: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  image_url: string | null;
  is_default: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  driving_score: number | null;
  route_geojson: LineString | null;
  road_type: string | null;
  is_public: boolean;
  created_at: string;
}

export interface TripMetrics {
  id: string;
  trip_id: string;
  hard_accelerations: number;
  hard_brakes: number;
  sharp_turns: number;
  stops: number;
  lane_changes: number;
  g_force_series: Array<{ t: number; x: number; y: number; z: number }> | null;
  created_at: string;
}

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon_url: string | null;
}
