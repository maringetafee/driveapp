import type { LineString } from 'geojson';
import { encodePolyline } from './polyline';

/** Builds a Mapbox Static Images API URL for a route — a plain PNG, safe to capture with react-native-view-shot (unlike a live Mapbox GL view). */
export function staticMapUrl(route: LineString | null, width = 640, height = 300): string | null {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token || !route || route.coordinates.length < 2) return null;

  const path = encodePolyline(route.coordinates.map(([lng, lat]) => [lat, lng]));
  const overlay = `path-4+4FE3A1-1(${encodeURIComponent(path)})`;

  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}/auto/${width}x${height}@2x?padding=40&access_token=${token}`;
}
