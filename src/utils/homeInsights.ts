export function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 13) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Consecutive-day streak ending today or yesterday, from a set of trip timestamps (most-recent-first is fine, order-independent). */
export function computeStreak(startedAtList: string[]): number {
  if (startedAtList.length === 0) return 0;
  const uniqueDates = Array.from(new Set(startedAtList.map(toDateKey))).sort().reverse();

  const oneDayMs = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mostRecent = new Date(uniqueDates[0]).getTime();
  const diffFromToday = (today.getTime() - mostRecent) / oneDayMs;
  if (diffFromToday > 1) return 0;

  let streak = 1;
  let cursor = mostRecent;
  for (let i = 1; i < uniqueDates.length; i++) {
    const t = new Date(uniqueDates[i]).getTime();
    if (cursor - t === oneDayMs) {
      streak++;
      cursor = t;
    } else {
      break;
    }
  }
  return streak;
}
