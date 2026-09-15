// Genera src/data/speedCameras.json con los radares fijos y de tramo de España.
//
// Fuentes abiertas:
//  - DGT, Punto de Acceso Nacional (CC-BY): radares fijos y de tramo de la red
//    estatal. No incluye Cataluña ni País Vasco, ni radares municipales.
//  - OpenStreetMap (ODbL, © colaboradores de OpenStreetMap): completa lo que la
//    DGT no cubre y aporta el límite de velocidad de cada radar.
//
// Uso: node scripts/build-speed-cameras.mjs

import { writeFile } from 'node:fs/promises';

const DGT_URL = 'http://infocar.dgt.es/datex2/dgt/PredefinedLocationsPublication/radares/content.xml';
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_QUERY = `[out:json][timeout:280];
area["ISO3166-1"="ES"][admin_level=2]->.a;
(node["highway"="speed_camera"](area.a);relation["type"="enforcement"]["enforcement"~"^(maxspeed|average_speed)$"](area.a););
out body;>;out skel qt;`;
const USER_AGENT = 'Roadly/1.0 (https://makemyweb.es)';
const OUT_FILE = new URL('../src/data/speedCameras.json', import.meta.url);

// Un radar de OSM a menos de esta distancia de uno de la DGT es el mismo radar.
const SAME_CAMERA_M = 60;
// Dos radares de OSM tan juntos son un duplicado de mapeo.
const DUPLICATE_OSM_M = 15;
// Extremos de tramo a menos de esta distancia se consideran el mismo tramo.
const SAME_SECTION_END_M = 250;
// Un radar a menos de esto del inicio o del fin de un tramo es una cámara del tramo.
const SECTION_CAMERA_M = 100;

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function parseMaxspeed(value) {
  if (!value) return null;
  const n = parseInt(String(value).match(/\d+/)?.[0] ?? '', 10);
  return Number.isFinite(n) && n >= 10 && n <= 150 ? n : null;
}

async function fetchDgt() {
  const res = await fetch(DGT_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`DGT respondió ${res.status}`);
  // El XML declara UTF-8 pero viene en Windows-1252.
  const xml = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
  const fixed = [];
  const sections = [];
  for (const chunk of xml.split('<_0:predefinedLocation id="').slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    const road = chunk.match(/<_0:roadNumber>([^<]+)</)?.[1]?.trim() ?? null;
    if (chunk.slice(0, 800).includes('_0:Linear')) {
      // En los tramos, "from" es el inicio en el sentido de la marcha (coincide
      // con el punto kilométrico "_ini").
      const point = (tag) => {
        const m = chunk.match(
          new RegExp(`<_0:${tag} xsi:type[^>]*>\\s*<_0:pointCoordinates>\\s*<_0:latitude>([^<]+)</_0:latitude>\\s*<_0:longitude>([^<]+)<`)
        );
        return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
      };
      const from = point('from');
      const to = point('to');
      if (from && to) sections.push({ id: `dgt:${id}`, from, to, maxspeed: null, road });
    } else {
      const lat = parseFloat(chunk.match(/<_0:latitude>([^<]+)</)?.[1] ?? '');
      const lon = parseFloat(chunk.match(/<_0:longitude>([^<]+)</)?.[1] ?? '');
      if (Number.isFinite(lat) && Number.isFinite(lon)) fixed.push({ id: `dgt:${id}`, lat, lon, maxspeed: null, road });
    }
  }
  return { fixed, sections };
}

async function fetchOsm() {
  let lastError;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
        signal: AbortSignal.timeout(300_000),
      });
      const text = await res.text();
      if (!res.ok || !text.startsWith('{')) throw new Error(`${url} respondió ${res.status}`);
      return JSON.parse(text).elements;
    } catch (e) {
      lastError = e;
      console.warn(`Overpass falló (${url}): ${e.message}`);
    }
  }
  throw lastError;
}

function parseOsm(elements) {
  const nodes = new Map();
  for (const el of elements) if (el.type === 'node') nodes.set(el.id, el);

  const deviceMaxspeed = new Map();
  const sections = [];
  for (const rel of elements) {
    if (rel.type !== 'relation') continue;
    const maxspeed = parseMaxspeed(rel.tags?.maxspeed);
    if (rel.tags?.enforcement === 'maxspeed') {
      for (const m of rel.members) if (m.role === 'device' && m.type === 'node' && maxspeed) deviceMaxspeed.set(m.ref, maxspeed);
      continue;
    }
    const from = nodes.get(rel.members.find((m) => m.role === 'from' && m.type === 'node')?.ref);
    const to = nodes.get(rel.members.find((m) => m.role === 'to' && m.type === 'node')?.ref);
    if (!from || !to || haversine(from.lat, from.lon, to.lat, to.lon) < 300) continue;
    sections.push({
      id: `osm:r${rel.id}`,
      from: [from.lat, from.lon],
      to: [to.lat, to.lon],
      maxspeed,
      road: rel.tags?.ref ?? null,
    });
  }

  const fixed = [];
  for (const el of elements) {
    if (el.type !== 'node' || el.tags?.highway !== 'speed_camera') continue;
    if (el.tags.temporary === 'yes' || el.tags.disused === 'yes') continue;
    fixed.push({
      id: `osm:n${el.id}`,
      lat: el.lat,
      lon: el.lon,
      maxspeed: parseMaxspeed(el.tags.maxspeed) ?? deviceMaxspeed.get(el.id) ?? null,
      road: el.tags.ref ?? null,
    });
  }
  return { fixed, sections };
}

function nearest(list, lat, lon, maxM, getPoint) {
  let best = null;
  let bestD = maxM;
  for (const item of list) {
    const [la, lo] = getPoint(item);
    if (Math.abs(la - lat) > 0.01 || Math.abs(lo - lon) > 0.015) continue;
    const d = haversine(lat, lon, la, lo);
    if (d <= bestD) {
      bestD = d;
      best = item;
    }
  }
  return best;
}

function merge(dgt, osm) {
  const fixed = [...dgt.fixed];
  let enriched = 0;
  for (const cam of osm.fixed) {
    const match = nearest(fixed, cam.lat, cam.lon, SAME_CAMERA_M, (c) => [c.lat, c.lon]);
    if (match && match.id.startsWith('dgt:')) {
      if (match.maxspeed == null && cam.maxspeed != null) {
        match.maxspeed = cam.maxspeed;
        enriched++;
      }
      continue;
    }
    const dup = nearest(fixed, cam.lat, cam.lon, DUPLICATE_OSM_M, (c) => [c.lat, c.lon]);
    if (dup) {
      dup.maxspeed ??= cam.maxspeed;
      continue;
    }
    fixed.push(cam);
  }

  const sections = [...dgt.sections];
  for (const sec of osm.sections) {
    const match = sections.find(
      (s) =>
        haversine(s.from[0], s.from[1], sec.from[0], sec.from[1]) < SAME_SECTION_END_M &&
        haversine(s.to[0], s.to[1], sec.to[0], sec.to[1]) < SAME_SECTION_END_M
    );
    if (match) {
      match.maxspeed ??= sec.maxspeed;
      continue;
    }
    sections.push(sec);
  }

  // Las cámaras de entrada y salida de un tramo también figuran como radares
  // sueltos: se quitan para que el aviso sea "tramo" y no "radar fijo".
  const endpoints = sections.flatMap((s) => [s.from, s.to]);
  const standalone = fixed.filter(
    (c) => !endpoints.some(([lat, lon]) => Math.abs(lat - c.lat) < 0.002 && haversine(lat, lon, c.lat, c.lon) < SECTION_CAMERA_M)
  );
  return { fixed: standalone, sections, enriched, sectionCameras: fixed.length - standalone.length };
}

const [dgt, osmElements] = await Promise.all([fetchDgt(), fetchOsm()]);
const osm = parseOsm(osmElements);
const { fixed, sections, enriched, sectionCameras } = merge(dgt, osm);

const output = {
  generatedAt: new Date().toISOString(),
  attribution: 'Radares: DGT (CC-BY) y © colaboradores de OpenStreetMap (ODbL)',
  // [lat, lon, límite km/h | null, carretera | null]
  fixed: fixed.map((c) => [round5(c.lat), round5(c.lon), c.maxspeed, c.road]),
  // [latInicio, lonInicio, latFin, lonFin, límite km/h | null, carretera | null]
  sections: sections.map((s) => [round5(s.from[0]), round5(s.from[1]), round5(s.to[0]), round5(s.to[1]), s.maxspeed, s.road]),
};
await writeFile(OUT_FILE, JSON.stringify(output));

const withLimit = fixed.filter((c) => c.maxspeed != null).length;
console.log(
  `DGT: ${dgt.fixed.length} fijos, ${dgt.sections.length} tramos · OSM: ${osm.fixed.length} fijos, ${osm.sections.length} tramos\n` +
    `Resultado: ${fixed.length} fijos (${withLimit} con límite, ${enriched} DGT completados con OSM), ${sections.length} tramos` +
    ` (${sectionCameras} cámaras de tramo quitadas de los fijos)`
);
