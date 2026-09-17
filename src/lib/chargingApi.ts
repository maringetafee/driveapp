// Puntos de carga eléctrica cercanos: OpenChargeMap, base de datos abierta y
// gratuita (funciona sin clave; con EXPO_PUBLIC_OPENCHARGEMAP_KEY sube el límite
// de peticiones). El precio depende de si el operador lo ha informado.
import type { LatLon } from '../utils/speedCameras';

const KEY = process.env.EXPO_PUBLIC_OPENCHARGEMAP_KEY;

export interface ChargingPoint {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  maxPowerKw: number | null;
  operator: string | null;
  costText: string | null;
  distanceKm: number | null;
}

interface OcmConnection {
  PowerKW?: number | null;
}

interface OcmPoi {
  ID: number;
  UsageCost?: string | null;
  AddressInfo?: {
    Title?: string;
    AddressLine1?: string;
    Town?: string;
    Latitude?: number;
    Longitude?: number;
    Distance?: number;
  };
  OperatorInfo?: { Title?: string } | null;
  Connections?: OcmConnection[] | null;
}

export async function nearbyChargingPoints(
  point: LatLon,
  radiusKm = 15,
  signal?: AbortSignal
): Promise<ChargingPoint[]> {
  const params = new URLSearchParams({
    output: 'json',
    countrycode: 'ES',
    latitude: String(point.lat),
    longitude: String(point.lon),
    distance: String(radiusKm),
    distanceunit: 'KM',
    maxresults: '50',
    compact: 'true',
    verbose: 'false',
  });
  if (KEY) params.set('key', KEY);

  const res = await fetch(`https://api.openchargemap.io/v3/poi/?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`openchargemap ${res.status}`);
  const json: OcmPoi[] = await res.json();

  return json
    .map((poi): ChargingPoint | null => {
      const a = poi.AddressInfo;
      if (!a?.Latitude || !a?.Longitude) return null;
      const powers = (poi.Connections ?? []).map((c) => c.PowerKW ?? 0).filter((p) => p > 0);
      return {
        id: String(poi.ID),
        name: a.Title ?? 'Punto de carga',
        address: [a.AddressLine1, a.Town].filter(Boolean).join(', '),
        lat: a.Latitude,
        lon: a.Longitude,
        maxPowerKw: powers.length ? Math.max(...powers) : null,
        operator: poi.OperatorInfo?.Title ?? null,
        costText: poi.UsageCost?.trim() || null,
        distanceKm: a.Distance ?? null,
      };
    })
    .filter((p): p is ChargingPoint => p != null)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}
