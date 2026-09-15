// Radares fijos y de tramo: índice espacial y lógica de avisos.
// Sin dependencias de React Native para poder probarla con node.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface FixedCamera extends LatLon {
  id: string;
  maxspeed: number | null;
  road: string | null;
}

export interface SectionCamera {
  id: string;
  start: LatLon;
  end: LatLon;
  maxspeed: number | null;
  road: string | null;
  lengthM: number;
}

/** Formato compacto de src/data/speedCameras.json (ver scripts/build-speed-cameras.mjs). */
export interface CameraDataset {
  fixed: [number, number, number | null, string | null][];
  sections: [number, number, number, number, number | null, string | null][];
}

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Diferencia absoluta entre dos rumbos, de 0 a 180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const CELL_DEG = 0.05;

/** Rejilla de celdas de ~5 km para no recorrer los ~3.000 radares en cada lectura del GPS. */
export class CameraIndex {
  readonly fixed: FixedCamera[];
  readonly sections: SectionCamera[];
  private fixedCells = new Map<string, FixedCamera[]>();
  private sectionCells = new Map<string, SectionCamera[]>();

  constructor(fixed: FixedCamera[], sections: SectionCamera[]) {
    this.fixed = fixed;
    this.sections = sections;
    for (const cam of fixed) CameraIndex.add(this.fixedCells, cam, cam);
    for (const sec of sections) CameraIndex.add(this.sectionCells, sec.start, sec);
  }

  static fromDataset(data: CameraDataset): CameraIndex {
    const fixed = data.fixed.map(([lat, lon, maxspeed, road], i) => ({ id: `f${i}`, lat, lon, maxspeed, road }));
    const sections = data.sections.map(([lat1, lon1, lat2, lon2, maxspeed, road], i) => {
      const start = { lat: lat1, lon: lon1 };
      const end = { lat: lat2, lon: lon2 };
      return { id: `s${i}`, start, end, maxspeed, road, lengthM: distanceM(start, end) };
    });
    return new CameraIndex(fixed, sections);
  }

  private static add<T>(cells: Map<string, T[]>, p: LatLon, item: T) {
    const key = `${Math.floor(p.lat / CELL_DEG)}:${Math.floor(p.lon / CELL_DEG)}`;
    const list = cells.get(key);
    if (list) list.push(item);
    else cells.set(key, [item]);
  }

  private static query<T>(cells: Map<string, T[]>, p: LatLon, radiusM: number, pointOf: (item: T) => LatLon): T[] {
    const dLat = radiusM / 111320;
    const dLon = radiusM / (111320 * Math.max(0.2, Math.cos(toRad(p.lat))));
    const result: T[] = [];
    for (let i = Math.floor((p.lat - dLat) / CELL_DEG); i <= Math.floor((p.lat + dLat) / CELL_DEG); i++) {
      for (let j = Math.floor((p.lon - dLon) / CELL_DEG); j <= Math.floor((p.lon + dLon) / CELL_DEG); j++) {
        for (const item of cells.get(`${i}:${j}`) ?? []) {
          if (distanceM(p, pointOf(item)) <= radiusM) result.push(item);
        }
      }
    }
    return result;
  }

  fixedNear(p: LatLon, radiusM: number): FixedCamera[] {
    return CameraIndex.query(this.fixedCells, p, radiusM, (c) => c);
  }

  sectionsStartingNear(p: LatLon, radiusM: number): SectionCamera[] {
    return CameraIndex.query(this.sectionCells, p, radiusM, (s) => s.start);
  }
}

/** Radares que caen sobre una ruta concreta, con su distancia desde el origen de la ruta. */
export interface RouteCameras {
  fixed: { cam: FixedCamera; along: number }[];
  sections: { sec: SectionCamera; startAlong: number; endAlong: number }[];
}

export interface RadarFix extends LatLon {
  speedKmh: number;
  headingDeg: number | null;
  timestamp: number;
  /** Metros recorridos sobre la ruta activa (solo navegando). */
  along?: number | null;
}

export interface UpcomingCamera {
  id: string;
  kind: 'fixed' | 'section';
  maxspeed: number | null;
  road: string | null;
  distanceM: number;
}

export interface ActiveSection {
  id: string;
  maxspeed: number | null;
  road: string | null;
  avgKmh: number;
  remainingM: number;
  finished: boolean;
}

export interface RadarState {
  upcoming: UpcomingCamera | null;
  section: ActiveSection | null;
}

export type RadarEvent =
  | { type: 'approaching'; camera: UpcomingCamera }
  | { type: 'close'; camera: UpcomingCamera }
  | { type: 'section-start'; section: ActiveSection }
  | { type: 'section-end'; section: ActiveSection };

/** Distancia de preaviso: más margen cuanto más rápido se va. */
export function lookaheadM(speedKmh: number): number {
  if (speedKmh >= 90) return 1000;
  if (speedKmh >= 50) return 600;
  return 350;
}

export const CLOSE_WARNING_M = 300;
// Sin ruta, un radar está "delante" si cae en este cono alrededor del rumbo...
const FREE_CONE_DEG = 30;
// ...y no se aparta del eje de la marcha más de esto (crece con la distancia por las curvas).
const freeMaxCrossTrackM = (d: number) => 30 + d * 0.08;
// Con el rumbo de un tramo a más de esto del nuestro, es el tramo del sentido contrario.
const SECTION_DIRECTION_TOLERANCE_DEG = 100;
const ROUTE_PASSED_TOLERANCE_M = 15;
const SECTION_START_RADIUS_M = 50;
const SECTION_END_RADIUS_M = 50;
const SECTION_RESULT_MS = 12_000;
const SECTION_MAX_MS = 60 * 60_000;
const REANNOUNCE_AFTER_MS = 10 * 60_000;
// Por debajo de esto el rumbo del GPS es ruido: se conserva el último bueno.
const MIN_HEADING_SPEED_KMH = 8;
const MIN_SECTION_SPEED_KMH = 10;
// Saltos del GPS más rápidos que esto (324 km/h) no cuentan para la media del tramo.
const MAX_PLAUSIBLE_MS = 90;

interface SectionTracking {
  sec: SectionCamera;
  endAlong: number | null;
  startedAt: number;
  distanceM: number;
  last: LatLon;
  lastAt: number;
  minEndDistanceM: number;
}

/**
 * Decide, lectura a lectura del GPS, qué radar hay delante y cómo va el tramo
 * en curso. Funciona con ruta (distancias sobre la ruta) o sin ella (rumbo).
 */
export class RadarWatcher {
  private index: CameraIndex;
  private route: RouteCameras | null = null;
  private heading: number | null = null;
  private announced = new Map<string, { far: boolean; close: boolean; lastSeen: number }>();
  private tracking: SectionTracking | null = null;
  private result: { section: ActiveSection; until: number } | null = null;
  private finishedSections = new Map<string, number>();

  constructor(index: CameraIndex) {
    this.index = index;
  }

  setRoute(route: RouteCameras | null) {
    this.route = route;
    // Al recalcular la ruta, el tramo en curso sigue: solo cambia su referencia de distancia.
    if (this.tracking) {
      const id = this.tracking.sec.id;
      this.tracking.endAlong = route?.sections.find((s) => s.sec.id === id)?.endAlong ?? null;
    }
  }

  update(fix: RadarFix): { state: RadarState; events: RadarEvent[] } {
    const events: RadarEvent[] = [];
    if (fix.headingDeg != null && fix.speedKmh >= MIN_HEADING_SPEED_KMH) this.heading = fix.headingDeg;
    const onRoute = this.route != null && fix.along != null;

    const section = this.updateSection(fix, onRoute, events);
    const upcoming = this.findUpcoming(fix, onRoute);
    if (upcoming) this.announce(upcoming, fix.timestamp, events);
    return { state: { upcoming, section }, events };
  }

  private findUpcoming(fix: RadarFix, onRoute: boolean): UpcomingCamera | null {
    const range = lookaheadM(fix.speedKmh);
    const trackingId = this.tracking?.sec.id;
    let best: UpcomingCamera | null = null;
    const consider = (c: UpcomingCamera) => {
      if (c.distanceM <= range && (!best || c.distanceM < best.distanceM)) best = c;
    };

    if (onRoute && this.route) {
      const along = fix.along as number;
      for (const { cam, along: camAlong } of this.route.fixed) {
        const d = camAlong - along;
        if (d < -ROUTE_PASSED_TOLERANCE_M) continue;
        if (d > range) break;
        consider({ id: cam.id, kind: 'fixed', maxspeed: cam.maxspeed, road: cam.road, distanceM: Math.max(0, d) });
      }
      for (const { sec, startAlong } of this.route.sections) {
        const d = startAlong - along;
        if (sec.id === trackingId || d < -ROUTE_PASSED_TOLERANCE_M) continue;
        consider({ id: sec.id, kind: 'section', maxspeed: sec.maxspeed, road: sec.road, distanceM: Math.max(0, d) });
      }
      return best;
    }

    const heading = this.heading;
    if (heading == null) return null;
    const ahead = (target: LatLon): number | null => {
      const d = distanceM(fix, target);
      if (d > range) return null;
      const diff = angleDiff(heading, bearingDeg(fix, target));
      // Encima del radar el rumbo hacia él se vuelve inestable: basta con que no quede detrás.
      if (d < 60) return diff < 80 ? d : null;
      if (diff > FREE_CONE_DEG || d * Math.sin(toRad(diff)) > freeMaxCrossTrackM(d)) return null;
      return d;
    };
    for (const cam of this.index.fixedNear(fix, range)) {
      const d = ahead(cam);
      if (d != null) consider({ id: cam.id, kind: 'fixed', maxspeed: cam.maxspeed, road: cam.road, distanceM: d });
    }
    for (const sec of this.index.sectionsStartingNear(fix, range)) {
      if (sec.id === trackingId) continue;
      if (angleDiff(heading, bearingDeg(sec.start, sec.end)) > SECTION_DIRECTION_TOLERANCE_DEG) continue;
      const d = ahead(sec.start);
      if (d != null) consider({ id: sec.id, kind: 'section', maxspeed: sec.maxspeed, road: sec.road, distanceM: d });
    }
    return best;
  }

  private announce(camera: UpcomingCamera, now: number, events: RadarEvent[]) {
    let state = this.announced.get(camera.id);
    if (!state || now - state.lastSeen > REANNOUNCE_AFTER_MS) {
      state = { far: false, close: false, lastSeen: now };
      this.announced.set(camera.id, state);
    }
    state.lastSeen = now;
    if (camera.distanceM <= CLOSE_WARNING_M) {
      if (!state.close) {
        state.far = true;
        state.close = true;
        events.push({ type: 'close', camera });
      }
    } else if (!state.far) {
      state.far = true;
      events.push({ type: 'approaching', camera });
    }
  }

  private updateSection(fix: RadarFix, onRoute: boolean, events: RadarEvent[]): ActiveSection | null {
    const now = fix.timestamp;
    let justStarted = false;
    if (!this.tracking) {
      if (!this.tryStartSection(fix, onRoute)) {
        return this.result && now < this.result.until ? this.result.section : null;
      }
      this.result = null;
      justStarted = true;
    }

    const t = this.tracking as SectionTracking;
    const step = distanceM(t.last, fix);
    const dt = (now - t.lastAt) / 1000;
    if (dt > 0 && step / dt <= MAX_PLAUSIBLE_MS) t.distanceM += step;
    t.last = { lat: fix.lat, lon: fix.lon };
    t.lastAt = now;

    const elapsedS = (now - t.startedAt) / 1000;
    const avgKmh = elapsedS >= 3 ? (t.distanceM / elapsedS) * 3.6 : fix.speedKmh;
    const endDistanceM = distanceM(fix, t.sec.end);
    t.minEndDistanceM = Math.min(t.minEndDistanceM, endDistanceM);
    const byRoute = onRoute && t.endAlong != null;
    const remainingM = byRoute ? Math.max(0, (t.endAlong as number) - (fix.along as number)) : endDistanceM;
    const section: ActiveSection = {
      id: t.sec.id,
      maxspeed: t.sec.maxspeed,
      road: t.sec.road,
      avgKmh,
      remainingM,
      finished: false,
    };
    if (justStarted) events.push({ type: 'section-start', section });

    const reachedEnd = byRoute
      ? remainingM <= 20
      : endDistanceM <= SECTION_END_RADIUS_M || (t.minEndDistanceM < 150 && endDistanceM > t.minEndDistanceM + 40);
    if (reachedEnd && !justStarted) {
      const done = { ...section, remainingM: 0, finished: true };
      this.tracking = null;
      this.finishedSections.set(t.sec.id, now);
      this.result = { section: done, until: now + SECTION_RESULT_MS };
      events.push({ type: 'section-end', section: done });
      return done;
    }

    if (now - t.startedAt > SECTION_MAX_MS || endDistanceM > t.sec.lengthM + 3000) {
      this.tracking = null;
      return null;
    }
    return section;
  }

  private tryStartSection(fix: RadarFix, onRoute: boolean): boolean {
    if (fix.speedKmh < MIN_SECTION_SPEED_KMH) return false;
    let found: { sec: SectionCamera; endAlong: number | null } | null = null;

    if (onRoute && this.route) {
      const along = fix.along as number;
      const hit = this.route.sections.find((s) => along >= s.startAlong - 10 && along <= s.startAlong + 80);
      if (hit) found = { sec: hit.sec, endAlong: hit.endAlong };
    } else if (this.heading != null) {
      const heading = this.heading;
      const sec = this.index
        .sectionsStartingNear(fix, SECTION_START_RADIUS_M)
        .find((s) => angleDiff(heading, bearingDeg(s.start, s.end)) <= SECTION_DIRECTION_TOLERANCE_DEG);
      if (sec) found = { sec, endAlong: null };
    }
    if (!found) return false;

    const finishedAt = this.finishedSections.get(found.sec.id);
    if (finishedAt != null && fix.timestamp - finishedAt < REANNOUNCE_AFTER_MS) return false;

    this.tracking = {
      sec: found.sec,
      endAlong: found.endAlong,
      startedAt: fix.timestamp,
      distanceM: 0,
      last: { lat: fix.lat, lon: fix.lon },
      lastAt: fix.timestamp,
      minEndDistanceM: Infinity,
    };
    return true;
  }
}
