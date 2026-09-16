// Lugares conquistados: municipios y provincias por los que pasa cada trayecto.
// Se muestrea la ruta cada pocos km y se geocodifica al revés con Mapbox; el
// código postal da la provincia (sus dos primeros dígitos son el código INE).
import type { LineString, Position } from 'geojson';
import { supabase } from '../lib/supabase';
import type { TripPlace } from '../types/database';
import { resample } from './routeGeo';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const SAMPLE_EVERY_M = 2000;
const MAX_SAMPLES = 40;
const CONCURRENCY = 4;

export const PROVINCES: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila', '06': 'Badajoz',
  '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres', '11': 'Cádiz', '12': 'Castellón',
  '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña', '16': 'Cuenca', '17': 'Girona', '18': 'Granada',
  '19': 'Guadalajara', '20': 'Gipuzkoa', '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León',
  '25': 'Lleida', '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas', '36': 'Pontevedra',
  '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia', '41': 'Sevilla',
  '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid',
  '48': 'Bizkaia', '49': 'Zamora', '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

export const PROVINCE_COUNT = Object.keys(PROVINCES).length;

interface Hit {
  municipalityId: string;
  municipality: string;
  provinceCode: string;
  point: Position;
}

async function reverse(point: Position): Promise<Hit | null> {
  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${point[0]}&latitude=${point[1]}&types=postcode&country=es&language=es&access_token=${MAPBOX_TOKEN}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  const props = json.features?.[0]?.properties;
  const postcode: string | undefined = props?.name;
  const place = props?.context?.place;
  if (!postcode || !/^\d{5}$/.test(postcode) || !place?.mapbox_id) return null;
  const provinceCode = postcode.slice(0, 2);
  if (!PROVINCES[provinceCode]) return null;
  return { municipalityId: place.mapbox_id, municipality: place.name, provinceCode, point };
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Calcula y guarda los municipios de un trayecto. */
export async function scanTripPlaces(trip: {
  id: string;
  user_id: string;
  started_at: string;
  route_geojson: LineString | null;
}): Promise<void> {
  const coords = trip.route_geojson?.coordinates ?? [];
  if (coords.length >= 2) {
    let samples = resample(coords, SAMPLE_EVERY_M);
    if (samples.length > MAX_SAMPLES) {
      const step = samples.length / MAX_SAMPLES;
      samples = Array.from({ length: MAX_SAMPLES }, (_, i) => samples[Math.floor(i * step)]).concat([coords[coords.length - 1]]);
    }
    const hits = await mapLimited(samples, CONCURRENCY, (p) => reverse(p).catch(() => null));

    const unique = new Map<string, Hit>();
    for (const hit of hits) if (hit && !unique.has(hit.municipalityId)) unique.set(hit.municipalityId, hit);
    if (unique.size) {
      const { error } = await supabase.from('trip_places').upsert(
        [...unique.values()].map((h) => ({
          trip_id: trip.id,
          user_id: trip.user_id,
          municipality_id: h.municipalityId,
          municipality: h.municipality,
          province_code: h.provinceCode,
          lat: h.point[1],
          lon: h.point[0],
          visited_at: trip.started_at,
        })),
        { onConflict: 'trip_id,municipality_id', ignoreDuplicates: true }
      );
      if (error) return;
    }
  }
  await supabase.from('trips').update({ places_scanned_at: new Date().toISOString() }).eq('id', trip.id);
}

/** Procesa trayectos antiguos que aún no tienen lugares (pocos cada vez). */
export async function scanPendingTrips(userId: string, limit = 8): Promise<number> {
  const { data, error } = await supabase
    .from('trips')
    .select('id, user_id, started_at, route_geojson')
    .eq('user_id', userId)
    .is('places_scanned_at', null)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error || !data?.length) return 0;
  for (const trip of data) await scanTripPlaces(trip as Parameters<typeof scanTripPlaces>[0]);
  return data.length;
}

export interface ConqueredPlaces {
  municipalities: { id: string; name: string; provinceCode: string; lat: number; lon: number; firstVisit: string; visits: number }[];
  provinces: { code: string; name: string; municipalities: number }[];
}

export async function fetchConqueredPlaces(userId: string, since?: Date, until?: Date): Promise<ConqueredPlaces> {
  let query = supabase.from('trip_places').select('*').eq('user_id', userId);
  if (since) query = query.gte('visited_at', since.toISOString());
  if (until) query = query.lt('visited_at', until.toISOString());
  const { data } = await query.order('visited_at', { ascending: true }).limit(5000);

  const byId = new Map<string, ConqueredPlaces['municipalities'][number]>();
  for (const row of (data ?? []) as TripPlace[]) {
    const prev = byId.get(row.municipality_id);
    if (prev) prev.visits++;
    else {
      byId.set(row.municipality_id, {
        id: row.municipality_id,
        name: row.municipality,
        provinceCode: row.province_code,
        lat: row.lat,
        lon: row.lon,
        firstVisit: row.visited_at,
        visits: 1,
      });
    }
  }
  const municipalities = [...byId.values()];
  const provinceCounts = new Map<string, number>();
  for (const m of municipalities) provinceCounts.set(m.provinceCode, (provinceCounts.get(m.provinceCode) ?? 0) + 1);
  const provinces = [...provinceCounts.entries()]
    .map(([code, count]) => ({ code, name: PROVINCES[code], municipalities: count }))
    .sort((a, b) => b.municipalities - a.municipalities);
  return { municipalities, provinces };
}
