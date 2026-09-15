export const MIN_TRIP_DISTANCE_METERS = 200;
export const MIN_TRIP_DURATION_SECONDS = 30;

// Anything below this is a mis-tap or GPS jitter; saving it would pollute
// stats and hand out a free 100 score (no events recorded = perfect score).
export function isTripTooShort(distanceMeters: number, durationSeconds: number): boolean {
  return distanceMeters < MIN_TRIP_DISTANCE_METERS || durationSeconds < MIN_TRIP_DURATION_SECONDS;
}
