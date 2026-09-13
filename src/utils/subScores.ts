/** Derives display-only 0-100 sub-scores from raw event counts, for the trip breakdown bars. Purely presentational — does not affect the stored driving_score or tracking logic. */
function countToScore(count: number, penaltyPerEvent: number) {
  return Math.max(0, Math.round(100 - count * penaltyPerEvent));
}

export function accelerationScore(hardAccelerations: number) {
  return countToScore(hardAccelerations, 12);
}

export function brakingScore(hardBrakes: number) {
  return countToScore(hardBrakes, 12);
}

export function corneringScore(sharpTurns: number) {
  return countToScore(sharpTurns, 10);
}
