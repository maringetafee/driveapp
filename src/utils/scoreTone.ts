import { semantic } from '../theme/colors';

/** Maps a driving score to its semantic color tier. Shared so the same score always reads the same way anywhere in the app. */
export function scoreTone(score: number | null | undefined): string {
  if (score == null) return semantic.neutral;
  if (score >= 85) return semantic.success;
  if (score >= 60) return semantic.warning;
  return semantic.danger;
}
