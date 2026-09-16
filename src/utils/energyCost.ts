// Gasto en combustible/electricidad de un trayecto a partir del consumo medio
// del coche y del precio medio de las gasolineras cercanas (API pública del
// Ministerio para la Transición Ecológica, sin clave).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { FuelType, Trip, Vehicle } from '../types/database';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
const PRICES_API =
  'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const NEARBY_RADIUS_M = 15_000;
const MIN_NEARBY_STATIONS = 3;

export interface FuelInfo {
  label: string;
  unit: 'L' | 'kWh';
  /** Consumo típico para sugerir en el formulario. */
  typicalConsumption: number;
  /** IDProducto del Ministerio; null si no se vende en gasolineras (eléctrico). */
  productId: number | null;
  /** Precio si no se puede consultar el de la zona (media nacional, sep 2026). */
  fallbackPrice: number;
}

export const FUEL_INFO: Record<FuelType, FuelInfo> = {
  gasoline: { label: 'Gasolina', unit: 'L', typicalConsumption: 6.5, productId: 1, fallbackPrice: 1.95 },
  diesel: { label: 'Diésel', unit: 'L', typicalConsumption: 5.5, productId: 4, fallbackPrice: 1.93 },
  hybrid: { label: 'Híbrido', unit: 'L', typicalConsumption: 4.8, productId: 1, fallbackPrice: 1.95 },
  electric: { label: 'Eléctrico', unit: 'kWh', typicalConsumption: 17, productId: null, fallbackPrice: 0.2 },
  lpg: { label: 'GLP', unit: 'L', typicalConsumption: 8.5, productId: 17, fallbackPrice: 1.13 },
};

export const FUEL_TYPES = Object.keys(FUEL_INFO) as FuelType[];

export type PriceSource = 'saved' | 'fixed' | 'nearby' | 'province' | 'average';

export interface EnergyEstimate {
  fuelType: FuelType;
  used: number;
  price: number;
  cost: number;
  priceSource: PriceSource;
}

type Station = [lat: number, lon: number, price: number];

/** Acepta "6,5" y "6.5"; devuelve null si no es un número positivo. */
export function parseDecimal(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

export function formatDecimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

export function formatEuros(value: number): string {
  return `${formatDecimal(value)} €`;
}

export function hasEnergyProfile(vehicle: Vehicle | null | undefined): vehicle is Vehicle & {
  fuel_type: FuelType;
  consumption_per_100km: number;
} {
  return !!vehicle?.fuel_type && !!vehicle.consumption_per_100km;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** En España los dos primeros dígitos del código postal son el código INE de la provincia. */
async function provinceAt(lat: number, lon: number): Promise<string | null> {
  const res = await fetch(
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lon}&latitude=${lat}&types=postcode&country=es&access_token=${MAPBOX_TOKEN}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  const postcode: string | undefined = json.features?.[0]?.properties?.name;
  return postcode && /^\d{5}$/.test(postcode) ? postcode.slice(0, 2) : null;
}

async function provinceStations(province: string, productId: number): Promise<Station[]> {
  const key = `fuel-prices:v1:${province}:${productId}`;
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const { at, stations } = JSON.parse(cached) as { at: number; stations: Station[] };
      if (Date.now() - at < CACHE_TTL_MS) return stations;
    }
  } catch {
    // Caché corrupta: se vuelve a descargar.
  }

  const res = await fetch(`${PRICES_API}/${province}/${productId}`);
  if (!res.ok) throw new Error(`precios ${res.status}`);
  const json = await res.json();
  const num = (value: string | undefined) => Number((value ?? '').replace(',', '.'));
  const stations: Station[] = (json.ListaEESSPrecio ?? [])
    // "R" es venta restringida (cooperativas, flotas): no la paga un conductor normal.
    .filter((s: Record<string, string>) => s['Tipo Venta'] !== 'R')
    .map((s: Record<string, string>): Station => [num(s.Latitud), num(s['Longitud (WGS84)']), num(s.PrecioProducto)])
    .filter(([lat, lon, price]: Station) => lat && lon && price > 0);

  AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), stations })).catch(() => {});
  return stations;
}

/** Precio por litro/kWh para ese coche en ese punto, con la mejor fuente disponible. */
export async function energyPriceFor(
  vehicle: Pick<Vehicle, 'fuel_type' | 'energy_price'> & { fuel_type: FuelType },
  point: { lat: number; lon: number } | null
): Promise<{ price: number; source: PriceSource }> {
  const info = FUEL_INFO[vehicle.fuel_type];
  if (vehicle.energy_price) return { price: vehicle.energy_price, source: 'fixed' };
  if (info.productId == null || !point) return { price: info.fallbackPrice, source: 'average' };

  try {
    const province = await provinceAt(point.lat, point.lon);
    if (!province) return { price: info.fallbackPrice, source: 'average' };
    const stations = await provinceStations(province, info.productId);
    if (!stations.length) return { price: info.fallbackPrice, source: 'average' };

    const nearby = stations.filter(([lat, lon]) => distanceMeters(point.lat, point.lon, lat, lon) <= NEARBY_RADIUS_M);
    if (nearby.length >= MIN_NEARBY_STATIONS) {
      return { price: median(nearby.map((s) => s[2])), source: 'nearby' };
    }
    return { price: median(stations.map((s) => s[2])), source: 'province' };
  } catch {
    return { price: info.fallbackPrice, source: 'average' };
  }
}

function tripEndPoint(trip: Trip): { lat: number; lon: number } | null {
  const coords = trip.route_geojson?.coordinates;
  const last = coords?.[coords.length - 1];
  return last ? { lon: last[0], lat: last[1] } : null;
}

/**
 * Gasto del trayecto. Si ya se calculó se devuelve el guardado; si no, se calcula
 * con el coche del trayecto y se guarda en él (solo lo puede hacer su dueño).
 */
export async function ensureTripEnergy(trip: Trip, vehicle: Vehicle | null): Promise<EnergyEstimate | null> {
  if (trip.energy_cost_eur != null && trip.fuel_type && trip.energy_used != null && trip.energy_price != null) {
    return {
      fuelType: trip.fuel_type,
      used: trip.energy_used,
      price: trip.energy_price,
      cost: trip.energy_cost_eur,
      priceSource: 'saved',
    };
  }
  if (!hasEnergyProfile(vehicle) || !trip.distance_meters) return null;

  const { price, source } = await energyPriceFor(vehicle, tripEndPoint(trip));
  const used = (trip.distance_meters / 1000) * (vehicle.consumption_per_100km / 100);
  const estimate: EnergyEstimate = {
    fuelType: vehicle.fuel_type,
    used,
    price,
    cost: used * price,
    priceSource: source,
  };

  await supabase
    .from('trips')
    .update({
      fuel_type: estimate.fuelType,
      energy_used: Math.round(used * 1000) / 1000,
      energy_price: Math.round(price * 1000) / 1000,
      energy_cost_eur: Math.round(estimate.cost * 100) / 100,
    })
    .eq('id', trip.id);
  return estimate;
}
