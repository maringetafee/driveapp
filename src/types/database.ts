import type { LineString } from 'geojson';

// Tipos alineados a mano con supabase/migrations/0001_init.sql.
// Cuando el proyecto Supabase exista, sustituir por:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Units = 'kmh' | 'mph';
export type LeaderboardMetric = 'max_speed' | 'total_distance' | 'driving_score' | 'trip_count' | 'zero_to_100';
export type LeaderboardScope = 'friends' | 'city' | 'country' | 'global';
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'all_time';

export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  country: string | null;
  city: string | null;
  units: Units;
  is_private: boolean;
  onboarded_at: string | null;
  created_at: string;
}

export type TripTag = 'commute' | 'road_trip' | 'night' | 'other';
export type FollowStatus = 'pending' | 'accepted';
export type NotificationType = 'like' | 'comment' | 'follow' | 'follow_request' | 'follow_accept' | 'badge' | 'live_share';

export interface AppNotification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  trip_id: string | null;
  badge_id: string | null;
  read: boolean;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export type FuelType = 'gasoline' | 'diesel' | 'hybrid' | 'electric' | 'lpg';

export interface Vehicle {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number | null;
  image_url: string | null;
  is_default: boolean;
  /** Columnas de 0010_trip_energy_cost.sql: pueden faltar si no se ha aplicado. */
  fuel_type?: FuelType | null;
  /** Litros (o kWh si es eléctrico) cada 100 km. */
  consumption_per_100km?: number | null;
  /** Precio fijo por litro/kWh; si es null se usa el precio medio de la zona. */
  energy_price?: number | null;
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
  zero_to_50_s: number | null;
  zero_to_100_s: number | null;
  fuel_type?: FuelType | null;
  energy_used?: number | null;
  energy_price?: number | null;
  energy_cost_eur?: number | null;
  /** Segundos desde el inicio de cada punto de route_geojson (0011). */
  route_times?: number[] | null;
  places_scanned_at?: string | null;
  route_geojson: LineString | null;
  road_type: string | null;
  tag: TripTag | null;
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

export interface Segment {
  id: string;
  created_by: string;
  name: string;
  geometry: LineString;
  distance_meters: number;
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  created_at: string;
}

export interface SegmentEffort {
  id: string;
  segment_id: string;
  trip_id: string;
  user_id: string;
  started_at: string;
  duration_seconds: number;
  avg_speed_kmh: number;
  speed_stddev_kmh: number;
  stops: number;
  created_at: string;
}

export interface TripPlace {
  trip_id: string;
  user_id: string;
  municipality_id: string;
  municipality: string;
  province_code: string;
  lat: number;
  lon: number;
  visited_at: string;
}
