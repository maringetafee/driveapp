// Modelo de una ruta de navegación: dónde estamos sobre ella, qué maniobra
// viene, qué límite hay y qué radares tiene. Sin dependencias de React Native.
import type { LineString } from 'geojson';
import type { DirectionsRoute } from '../lib/mapboxApi';
import { distanceM, type CameraIndex, type FixedCamera, type LatLon, type RouteCameras, type SectionCamera } from './speedCameras';

export interface Maneuver {
  type: string;
  modifier?: string;
  exit?: number;
}

export interface RouteStep {
  startAlong: number;
  endAlong: number;
  /** Maniobra al final de este paso (la siguiente que hará el conductor). */
  next: { text: string; maneuver: Maneuver } | null;
  voice: { along: number; text: string }[];
}

export interface NavRoute {
  geometry: LineString;
  coords: LatLon[];
  /** Distancia acumulada hasta cada vértice. */
  cum: number[];
  total: number;
  durationS: number;
  steps: RouteStep[];
  /** Límite de velocidad por segmento (coords[i] → coords[i + 1]). */
  maxspeed: (number | null)[];
}

export interface RoutePosition {
  along: number;
  offsetM: number;
  segment: number;
}

export function buildNavRoute(api: DirectionsRoute): NavRoute {
  const coords = api.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];

  const apiSteps = api.legs.flatMap((leg) => leg.steps);
  const apiTotal = apiSteps.reduce((sum, s) => sum + s.distance, 0);
  // Mapbox mide las distancias a su manera: se escalan a nuestra geometría.
  const scale = apiTotal > 0 ? total / apiTotal : 1;

  const steps: RouteStep[] = [];
  let acc = 0;
  apiSteps.forEach((s, i) => {
    const startAlong = acc * scale;
    acc += s.distance;
    const endAlong = acc * scale;
    const following = apiSteps[i + 1];
    const banner = s.bannerInstructions?.[0]?.primary;
    const next = following
      ? {
          text: banner?.text ?? following.name ?? following.maneuver.instruction,
          // El icono sale de la maniobra real: el banner redondea ("fork left" para una bifurcación suave).
          maneuver: {
            type: following.maneuver.type,
            modifier: following.maneuver.modifier ?? banner?.modifier,
            exit: following.maneuver.exit,
          },
        }
      : null;
    const voice = (s.voiceInstructions ?? []).map((v) => ({
      along: Math.min(endAlong, Math.max(startAlong, endAlong - v.distanceAlongGeometry * scale)),
      text: v.announcement,
    }));
    steps.push({ startAlong, endAlong, next, voice });
  });

  const maxspeed = api.legs.flatMap((leg) =>
    (leg.annotation?.maxspeed ?? []).map((m) => {
      if (m.speed == null) return null;
      return m.unit === 'mph' ? Math.round(m.speed * 1.609) : m.speed;
    })
  );

  return { geometry: api.geometry, coords, cum, total, durationS: api.duration, steps, maxspeed };
}

function projectOnSegment(route: NavRoute, p: LatLon, i: number): { along: number; offsetM: number } {
  const a = route.coords[i];
  const b = route.coords[i + 1];
  // Plano local centrado en p: suficiente a escala de calle.
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  const ax = (a.lon - p.lon) * kx;
  const ay = (a.lat - p.lat) * ky;
  const dx = (b.lon - a.lon) * kx;
  const dy = (b.lat - a.lat) * ky;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
  const px = ax + t * dx;
  const py = ay + t * dy;
  return { along: route.cum[i] + t * (route.cum[i + 1] - route.cum[i]), offsetM: Math.hypot(px, py) };
}

/**
 * Proyecta una posición sobre la ruta. Busca primero cerca del último segmento
 * conocido (hacia delante) y, si no encaja, en toda la ruta.
 */
export function locateOnRoute(route: NavRoute, p: LatLon, hintSegment = 0): RoutePosition {
  const last = route.coords.length - 2;
  if (last < 0) return { along: 0, offsetM: distanceM(p, route.coords[0]), segment: 0 };

  const scan = (from: number, to: number): RoutePosition => {
    let best: RoutePosition = { along: 0, offsetM: Infinity, segment: from };
    for (let i = Math.max(0, from); i <= Math.min(last, to); i++) {
      const r = projectOnSegment(route, p, i);
      if (r.offsetM < best.offsetM) best = { ...r, segment: i };
    }
    return best;
  };

  const local = scan(hintSegment - 5, hintSegment + 80);
  if (local.offsetM <= 40) return local;
  const global = scan(0, last);
  return global.offsetM < local.offsetM ? global : local;
}

export function stepIndexAt(route: NavRoute, along: number, hint = 0): number {
  let i = Math.min(Math.max(0, hint), route.steps.length - 1);
  while (i > 0 && along < route.steps[i].startAlong) i--;
  while (i < route.steps.length - 1 && along >= route.steps[i].endAlong) i++;
  return i;
}

function pointAt(route: NavRoute, along: number): LatLon {
  const { coords, cum } = route;
  if (along <= 0) return coords[0];
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] >= along) {
      const span = cum[i] - cum[i - 1];
      const t = span > 0 ? (along - cum[i - 1]) / span : 0;
      return {
        lat: coords[i - 1].lat + t * (coords[i].lat - coords[i - 1].lat),
        lon: coords[i - 1].lon + t * (coords[i].lon - coords[i - 1].lon),
      };
    }
  }
  return coords[coords.length - 1];
}

/** Trozo de la ruta entre dos distancias (para pintar los tramos controlados). */
export function sliceRoute(route: NavRoute, fromAlong: number, toAlong: number): LineString {
  const points = [pointAt(route, fromAlong)];
  for (let i = 0; i < route.coords.length; i++) {
    if (route.cum[i] > fromAlong && route.cum[i] < toAlong) points.push(route.coords[i]);
  }
  points.push(pointAt(route, toAlong));
  return { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) };
}

/** Tiempo restante estimado, proporcional a lo que queda de ruta. */
export function remainingDurationS(route: NavRoute, along: number): number {
  if (route.total <= 0) return 0;
  return route.durationS * Math.max(0, 1 - along / route.total);
}

// Un radar a más de esto de la línea de la ruta está en otra calzada o en otra vía.
const FIXED_ON_ROUTE_M = 25;
const SECTION_END_ON_ROUTE_M = 40;
const SAMPLE_EVERY_M = 250;
const SAMPLE_RADIUS_M = 300;

export function camerasAlongRoute(route: NavRoute, index: CameraIndex): RouteCameras {
  const fixedCandidates = new Map<string, FixedCamera>();
  const sectionCandidates = new Map<string, SectionCamera>();
  let nextSample = 0;
  for (let i = 0; i < route.coords.length; i++) {
    if (route.cum[i] < nextSample && i !== route.coords.length - 1) continue;
    nextSample = route.cum[i] + SAMPLE_EVERY_M;
    for (const cam of index.fixedNear(route.coords[i], SAMPLE_RADIUS_M)) fixedCandidates.set(cam.id, cam);
    for (const sec of index.sectionsStartingNear(route.coords[i], SAMPLE_RADIUS_M)) sectionCandidates.set(sec.id, sec);
  }

  const fixed: RouteCameras['fixed'] = [];
  for (const cam of fixedCandidates.values()) {
    const pos = locateOnRoute(route, cam, 0);
    if (pos.offsetM <= FIXED_ON_ROUTE_M) fixed.push({ cam, along: pos.along });
  }
  fixed.sort((a, b) => a.along - b.along);

  const sections: RouteCameras['sections'] = [];
  for (const sec of sectionCandidates.values()) {
    const start = locateOnRoute(route, sec.start, 0);
    const end = locateOnRoute(route, sec.end, 0);
    if (start.offsetM > SECTION_END_ON_ROUTE_M || end.offsetM > SECTION_END_ON_ROUTE_M) continue;
    // El tramo del sentido contrario aparece con el fin antes que el inicio.
    if (end.along - start.along < 200) continue;
    sections.push({ sec, startAlong: start.along, endAlong: end.along });
  }
  sections.sort((a, b) => a.startAlong - b.startAlong);

  return { fixed, sections };
}
