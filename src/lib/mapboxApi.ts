// Llamadas REST a Mapbox: búsqueda de destinos (Search Box) y rutas (Directions).
import type { LineString } from 'geojson';
import type { LatLon } from '../utils/speedCameras';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

export interface Place {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

export interface ApiManeuver {
  type: string;
  modifier?: string;
  exit?: number;
  instruction: string;
}

export interface ApiBannerComponent {
  /** text | icon (escudo de carretera) | delimiter | exit | exit-number | lane | guidance-view */
  type: string;
  text: string;
  abbr?: string;
  mapbox_shield?: { name?: string; display_ref?: string; text_color?: string };
  directions?: string[];
  active?: boolean;
  active_direction?: string;
}

export interface ApiBannerText {
  text: string;
  type?: string;
  modifier?: string;
  degrees?: number;
  driving_side?: string;
  components?: ApiBannerComponent[];
}

export interface ApiStep {
  distance: number;
  duration: number;
  name: string;
  ref?: string;
  maneuver: ApiManeuver;
  voiceInstructions?: { distanceAlongGeometry: number; announcement: string }[];
  bannerInstructions?: {
    distanceAlongGeometry: number;
    primary: ApiBannerText;
    secondary?: ApiBannerText | null;
    sub?: ApiBannerText | null;
  }[];
}

export interface ApiMaxspeed {
  speed?: number;
  unit?: string;
  unknown?: boolean;
  none?: boolean;
}

export interface DirectionsRoute {
  distance: number;
  duration: number;
  geometry: LineString;
  legs: { steps: ApiStep[]; annotation?: { maxspeed?: ApiMaxspeed[]; congestion?: string[] } }[];
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function searchPlaces(text: string, near: LatLon | null, signal?: AbortSignal): Promise<Place[]> {
  const params: Record<string, string> = {
    q: text,
    country: 'es',
    language: 'es',
    limit: '6',
    access_token: TOKEN,
  };
  if (near) params.proximity = `${near.lon},${near.lat}`;
  const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/forward?${query(params)}`, { signal });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const json = await res.json();
  return (json.features ?? []).map((f: any, i: number) => ({
    id: f.properties?.mapbox_id ?? `${i}`,
    name: f.properties?.name ?? text,
    address: f.properties?.full_address ?? f.properties?.place_formatted ?? '',
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

export async function fetchDirections(
  origin: LatLon,
  destination: LatLon,
  headingDeg: number | null,
  signal?: AbortSignal
): Promise<DirectionsRoute> {
  const params: Record<string, string> = {
    alternatives: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    voice_instructions: 'true',
    banner_instructions: 'true',
    voice_units: 'metric',
    language: 'es',
    annotations: 'maxspeed,congestion',
    access_token: TOKEN,
  };
  // Con rumbo, la ruta sale hacia donde ya vamos en vez de pedir un cambio de sentido.
  if (headingDeg != null) params.bearings = `${Math.round(headingDeg)},60;`;
  const coords = `${origin.lon},${origin.lat};${destination.lon},${destination.lat}`;
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?${query(params)}`,
    { signal }
  );
  const json = await res.json();
  if (!res.ok || json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(json.message ?? json.code ?? `directions ${res.status}`);
  }
  return json.routes[0];
}
