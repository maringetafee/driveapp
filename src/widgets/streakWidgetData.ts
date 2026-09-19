// Caché para el widget: el widget corre en un proceso aparte (sin la app
// abierta) y no puede leer el store de Zustand ni Supabase directamente, así
// que la app guarda aquí el último dato conocido cada vez que lo calcula.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'widget-streak-cache:v1';

export interface WidgetStreakData {
  streak: number;
  lastDistanceMeters: number | null;
}

const EMPTY: WidgetStreakData = { streak: 0, lastDistanceMeters: null };

export async function saveWidgetStreakData(data: WidgetStreakData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Sin caché, el widget mostrará el estado vacío la próxima vez.
  }
}

export async function loadWidgetStreakData(): Promise<WidgetStreakData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as WidgetStreakData;
  } catch {
    // Caché corrupta: se trata como vacía.
  }
  return EMPTY;
}
