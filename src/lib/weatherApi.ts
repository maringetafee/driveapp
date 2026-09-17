// Aviso meteorológico antes de salir: Open-Meteo, gratis y sin clave.
import type { Ionicons } from '@expo/vector-icons';

export interface WeatherAlert {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
}

// Códigos WMO (weather_code de Open-Meteo).
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STRONG_WIND_KMH = 50;
const ICE_RISK_C = 2;

export async function weatherAlertAt(lat: number, lon: number, signal?: AbortSignal): Promise<WeatherAlert | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,wind_speed_10m,weather_code',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
  if (!res.ok) return null;
  const json = await res.json();
  const c = json.current;
  if (!c) return null;

  if (SNOW_CODES.has(c.weather_code)) return { text: 'Nieve en la zona: conduce con precaución.', icon: 'snow' };
  if (RAIN_CODES.has(c.weather_code)) return { text: 'Lluvia en la zona: puede haber menos adherencia.', icon: 'rainy' };
  if (c.wind_speed_10m >= STRONG_WIND_KMH) return { text: `Viento fuerte, ${Math.round(c.wind_speed_10m)} km/h.`, icon: 'flag' };
  if (c.temperature_2m <= ICE_RISK_C) return { text: 'Riesgo de hielo en la carretera.', icon: 'thermometer' };
  return null;
}
