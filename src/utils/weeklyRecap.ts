import { supabase } from '../lib/supabase';

export interface WeeklyRecap {
  tripCount: number;
  distanceMeters: number;
  avgDrivingScore: number | null;
  prevDistanceMeters: number;
}

const DAY_MS = 86400000;

/** Rolling 7-day recap (not calendar week) so it's meaningful any day you open the app. */
export async function fetchWeeklyRecap(userId: string): Promise<WeeklyRecap> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
  const twoWeeksAgo = new Date(now - 14 * DAY_MS).toISOString();

  const [{ data: thisWeek }, { data: lastWeek }] = await Promise.all([
    supabase.from('trips').select('distance_meters, driving_score').eq('user_id', userId).gte('started_at', weekAgo),
    supabase
      .from('trips')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', twoWeeksAgo)
      .lt('started_at', weekAgo),
  ]);

  const trips = thisWeek ?? [];
  const scored = trips.filter((t) => t.driving_score != null);

  return {
    tripCount: trips.length,
    distanceMeters: trips.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
    avgDrivingScore: scored.length
      ? Math.round(scored.reduce((sum, t) => sum + (t.driving_score ?? 0), 0) / scored.length)
      : null,
    prevDistanceMeters: (lastWeek ?? []).reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
  };
}

export interface FriendComparison {
  username: string;
  distanceMeters: number;
}

/** Best friend by distance in the last 7 days, among accepted follows — used for a lightweight social nudge on Home. */
export async function fetchTopFriendThisWeek(userId: string): Promise<FriendComparison | null> {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const { data: follows } = await supabase.from('follows').select('followed_id').eq('follower_id', userId).eq('status', 'accepted');
  const friendIds = (follows ?? []).map((f) => f.followed_id);
  if (friendIds.length === 0) return null;

  const { data: trips } = await supabase
    .from('trips')
    .select('user_id, distance_meters, profiles!trips_user_id_fkey(username)')
    .in('user_id', friendIds)
    .gte('started_at', weekAgo);

  const totals = new Map<string, { username: string; distance: number }>();
  for (const t of trips ?? []) {
    const username = (t as unknown as { profiles: { username: string } | null }).profiles?.username;
    if (!username) continue;
    const prev = totals.get(t.user_id) ?? { username, distance: 0 };
    prev.distance += t.distance_meters ?? 0;
    totals.set(t.user_id, prev);
  }

  const best = Array.from(totals.values()).sort((a, b) => b.distance - a.distance)[0];
  return best ? { username: best.username, distanceMeters: best.distance } : null;
}
