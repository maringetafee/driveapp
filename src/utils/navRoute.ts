// Modelo de una ruta de navegación: dónde estamos sobre ella, qué maniobra
// viene, qué límite hay y qué radares tiene. Sin dependencias de React Native.
import type { LineString } from 'geojson';
import type { ApiBannerComponent, ApiBannerText, DirectionsRoute } from '../lib/mapboxApi';
import { distanceM, type CameraIndex, type FixedCamera, type LatLon, type RouteCameras, type SectionCamera } from './speedCameras';

export interface Maneuver {
  type: string;
  modifier?: string;
  exit?: number;
  /** Rotondas: grados recorridos desde la entrada hasta la salida. */
  degrees?: number;
}

export type BannerPart =
  | { kind: 'text'; text: string }
  | { kind: 'shield'; text: string; shield: string }
  | { kind: 'exit'; text: string };

export interface Lane {
  directions: string[];
  active: boolean;
  activeDirection?: string;
}

export interface Banner {
  /** Distancia a lo largo de la ruta desde la que se muestra este cartel. */
  fromAlong: number;
  maneuver: Maneuver;
  text: string;
  parts: BannerPart[];
  /** Destinos de la señal ("Parla / Toledo"). */
  secondary: string | null;
  lanes: Lane[] | null;
}

export interface RouteStep {
  startAlong: number;
  endAlong: number;
  durationS: number;
  /** Vía por la que se circula durante este paso ("A-42 · Autovía de Toledo"). */
  road: string;
  /** Carteles de la maniobra al final de este paso, ordenados de más lejos a más cerca. */
  banners: Banner[];
  voice: { along: number; text: string }[];
}

export type Congestion = 'low' | 'moderate' | 'heavy' | 'severe';

export interface NavRoute {
  geometry: LineString;
  coords: LatLon[];
  /** Distancia acumulada hasta cada vértice. */
  cum: number[];
  /** Lo mismo medido en Mercator: la métrica de `line-progress` en Mapbox. */
  mercCum: number[];
  total: number;
  durationS: number;
  steps: RouteStep[];
  /** Límite de velocidad por segmento (coords[i] → coords[i + 1]). */
  maxspeed: (number | null)[];
  /** Tráfico agrupado en tramos consecutivos del mismo nivel. */
  traffic: { fromAlong: number; level: Congestion }[];
}

export interface RoutePosition {
  along: number;
  offsetM: number;
  segment: number;
}

function partsOf(components: ApiBannerComponent[] | undefined, fallback: string): BannerPart[] {
  if (!components?.length) return fallback ? [{ kind: 'text', text: fallback }] : [];
  const parts: BannerPart[] = [];
  for (const c of components) {
    const text = c.text.trim();
    if (c.type === 'icon') parts.push({ kind: 'shield', text, shield: c.mapbox_shield?.name ?? 'default' });
    else if (c.type === 'exit-number') parts.push({ kind: 'exit', text });
    else if (c.type === 'text' && text && text !== '/') parts.push({ kind: 'text', text });
  }
  return parts;
}

function lanesOf(sub: ApiBannerText | null | undefined): Lane[] | null {
  const lanes = sub?.components?.filter((c) => c.type === 'lane') ?? [];
  // Si valen todos los carriles, no hay nada que indicar.
  if (lanes.length < 2 || lanes.every((l) => l.active)) return null;
  return lanes.map((l) => ({
    directions: l.directions?.length ? l.directions : ['straight'],
    active: !!l.active,
    activeDirection: l.active_direction,
  }));
}

function mercator(p: LatLon): [number, number] {
  const lat = Math.max(-85, Math.min(85, p.lat));
  return [(p.lon * Math.PI) / 180, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
}

const CONGESTION: Record<string, Congestion> = { moderate: 'moderate', heavy: 'heavy', severe: 'severe' };
// Un cambio de tráfico más corto que esto no merece cambiar el color de la línea.
const MIN_TRAFFIC_RUN_M = 80;

export function buildNavRoute(api: DirectionsRoute): NavRoute {
  const coords = api.geometry.coordinates.map(([lon, lat]) => ({ lat, lon }));
  const cum = [0];
  const mercCum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + distanceM(coords[i - 1], coords[i]));
    const [ax, ay] = mercator(coords[i - 1]);
    const [bx, by] = mercator(coords[i]);
    mercCum.push(mercCum[i - 1] + Math.hypot(bx - ax, by - ay));
  }
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
    const banners: Banner[] = [];
    if (following) {
      // El icono sale de la maniobra real: el banner redondea ("fork left" para una bifurcación suave).
      const base: Maneuver = {
        type: following.maneuver.type,
        modifier: following.maneuver.modifier,
        exit: following.maneuver.exit,
      };
      for (const b of s.bannerInstructions ?? []) {
        banners.push({
          fromAlong: Math.max(startAlong, endAlong - b.distanceAlongGeometry * scale),
          maneuver: { ...base, modifier: base.modifier ?? b.primary.modifier, degrees: b.primary.degrees },
          text: b.primary.text,
          parts: partsOf(b.primary.components, b.primary.text),
          secondary: b.secondary?.text?.trim() || null,
          lanes: lanesOf(b.sub),
        });
      }
      if (banners.length === 0) {
        const text = following.name || following.maneuver.instruction;
        banners.push({ fromAlong: startAlong, maneuver: base, text, parts: [{ kind: 'text', text }], secondary: null, lanes: null });
      }
      banners.sort((a, b) => a.fromAlong - b.fromAlong);
    }
    const voice = (s.voiceInstructions ?? []).map((v) => ({
      along: Math.min(endAlong, Math.max(startAlong, endAlong - v.distanceAlongGeometry * scale)),
      text: v.announcement,
    }));
    const ref = s.ref?.split(';')[0]?.trim();
    const road = [ref, s.name].filter(Boolean).join(' · ');
    steps.push({ startAlong, endAlong, durationS: s.duration, road, banners, voice });
  });

  const maxspeed = api.legs.flatMap((leg) =>
    (leg.annotation?.maxspeed ?? []).map((m) => {
      if (m.speed == null) return null;
      return m.unit === 'mph' ? Math.round(m.speed * 1.609) : m.speed;
    })
  );

  const traffic: NavRoute['traffic'] = [];
  api.legs
    .flatMap((leg) => leg.annotation?.congestion ?? [])
    .forEach((raw, seg) => {
      if (seg >= coords.length - 1) return;
      const level = CONGESTION[raw] ?? 'low';
      const last = traffic[traffic.length - 1];
      if (last?.level === level) return;
      // Un tramo anterior demasiado corto se funde con el que tenía delante.
      if (last && traffic.length > 1 && cum[seg] - last.fromAlong < MIN_TRAFFIC_RUN_M) {
        traffic.pop();
        if (traffic[traffic.length - 1].level === level) return;
      }
      traffic.push({ fromAlong: traffic.length === 0 ? 0 : cum[seg], level });
    });

  return { geometry: api.geometry, coords, cum, mercCum, total, durationS: api.duration, steps, maxspeed, traffic };
}

/** Cartel vigente de un paso según lo recorrido. */
export function bannerAt(step: RouteStep, along: number): Banner | null {
  let current: Banner | null = step.banners[0] ?? null;
  for (const b of step.banners) if (b.fromAlong <= along) current = b;
  return current;
}

/** Fracción de la línea (0..1) en la métrica de `line-progress` de Mapbox. */
export function lineProgressAt(route: NavRoute, along: number): number {
  const { cum, mercCum } = route;
  const mTotal = mercCum[mercCum.length - 1];
  if (along <= 0 || mTotal <= 0) return 0;
  if (along >= route.total) return 1;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= along) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const t = span > 0 ? (along - cum[lo]) / span : 0;
  return (mercCum[lo] + t * (mercCum[hi] - mercCum[lo])) / mTotal;
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

/** Tiempo restante con la duración (tráfico incluido) de cada paso pendiente. */
export function remainingDurationS(route: NavRoute, along: number, stepHint = 0): number {
  if (route.total <= 0 || route.steps.length === 0) return 0;
  const current = stepIndexAt(route, along, stepHint);
  let seconds = 0;
  for (let j = current; j < route.steps.length; j++) {
    const s = route.steps[j];
    const len = s.endAlong - s.startAlong;
    const left = j === current && len > 0 ? Math.max(0, Math.min(1, (s.endAlong - along) / len)) : 1;
    seconds += s.durationS * left;
  }
  return seconds;
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
