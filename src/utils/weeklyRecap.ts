import { supabase } from '../lib/supabase';

export interface WeeklyRecap {
  tripCount: number;
  distanceMeters: number;
  avgDrivingScore: number | null;
  prevDistanceMeters: number;
}

/** Monday 00:00 local — the same window the "Semana" leaderboard uses. */
export function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export async function fetchWeeklyRecap(userId: string): Promise<WeeklyRecap> {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  // Compare against the same elapsed slice of last week, so Monday morning
  // isn't measured against a full previous week.
  const prevSameMoment = new Date(now);
  prevSameMoment.setDate(prevSameMoment.getDate() - 7);

  const [{ data: thisWeek }, { data: lastWeek }] = await Promise.all([
    supabase
      .from('trips')
      .select('distance_meters, driving_score')
      .eq('user_id', userId)
      .gte('started_at', weekStart.toISOString()),
    supabase
      .from('trips')
      .select('distance_meters')
      .eq('user_id', userId)
      .gte('started_at', prevWeekStart.toISOString())
      .lt('started_at', prevSameMoment.toISOString()),
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

/** Best friend by distance this week, among accepted follows — a lightweight social nudge on Home. */
export async function fetchTopFriendThisWeek(userId: string): Promise<FriendComparison | null> {
  const { data: follows } = await supabase.from('follows').select('followed_id').eq('follower_id', userId).eq('status', 'accepted');
  const friendIds = (follows ?? []).map((f) => f.followed_id);
  if (friendIds.length === 0) return null;

  const { data: trips } = await supabase
    .from('trips')
    .select('user_id, distance_meters, profiles!trips_user_id_fkey(username)')
    .in('user_id', friendIds)
    .gte('started_at', startOfWeek().toISOString());

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
