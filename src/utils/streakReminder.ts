// Aviso local (sin servidor) para no perder la racha: si a última hora del
// día todavía no ha habido trayecto, se avisa. Se reprograma cada vez que se
// abre la pantalla de inicio, así siempre refleja el estado real.
import * as Notifications from 'expo-notifications';

const NOTIFICATION_ID = 'streak-reminder';
const REMINDER_HOUR = 21;
/** Por debajo de esto no merece la pena avisar: perder una racha de 1 día no es gran cosa. */
const MIN_STREAK_TO_PROTECT = 2;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

/** `lastTripStartedAt`: fecha ISO del trayecto más reciente, o null si no hay ninguno. */
export async function syncStreakReminder(lastTripStartedAt: string | null, streak: number): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {});

  const todayKey = new Date().toISOString().slice(0, 10);
  const drovetoday = lastTripStartedAt?.slice(0, 10) === todayKey;
  if (drovetoday || streak < MIN_STREAK_TO_PROTECT) return;

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const now = new Date();
  const trigger = new Date(now.getFullYear(), now.getMonth(), now.getDate(), REMINDER_HOUR, 0, 0);
  if (trigger.getTime() <= now.getTime()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: '🔥 No pierdas tu racha',
      body: `Llevas ${streak} días seguidos conduciendo. Sal a rodar hoy para no perderla.`,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
  });
}
