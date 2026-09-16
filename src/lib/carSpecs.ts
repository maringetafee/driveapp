// Consumo homologado (WLTP) por marca y modelo, a partir del registro oficial de
// matriculaciones de la Agencia Europea de Medio Ambiente (EEA, API pública
// DiscoData, sin clave). Agrupamos por motorización y ordenamos por unidades
// matriculadas en España, así la versión más común sale primero.
import type { FuelType } from '../types/database';

const DISCODATA = 'https://discodata.eea.europa.eu/sql';
const TABLE = '[CO2Emission].[latest].[co2cars_2024Pv29]';
// El consumo real suele superar al homologado WLTP en torno a un 15 %.
export const REAL_WORLD_FACTOR = 1.15;
const MAX_RESULTS = 6;

const MAKE_ALIASES: Record<string, string> = {
  VW: 'VOLKSWAGEN',
  MERCEDES: 'MERCEDES-BENZ',
  'MERCEDES BENZ': 'MERCEDES-BENZ',
  CITROËN: 'CITROEN',
  'LAND-ROVER': 'LAND ROVER',
  SSANG: 'SSANGYONG',
  'SSANG YONG': 'SSANGYONG',
  ALFA: 'ALFA ROMEO',
  'LYNK & CO': 'LYNK&CO',
};

export interface CarVersion {
  key: string;
  fuelType: FuelType;
  /** Consumo homologado, L o kWh cada 100 km. */
  officialConsumption: number;
  /** Consumo estimado en uso real. */
  consumption: number;
  engineCc: number | null;
  powerCv: number | null;
  registrations: number;
}

interface Row {
  Ft: string;
  Fm: string;
  cc: number | null;
  kw: number | null;
  fc: number | null;
  co2: number | null;
  wh: number | null;
  n: number;
}

/** Solo letras, números, espacios y guiones: la consulta se construye como texto SQL. */
function clean(text: string) {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9& -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fuelOf(row: Row): FuelType | null {
  if (row.Ft === 'electric') return 'electric';
  if (row.Ft === 'lpg') return 'lpg';
  if (row.Ft === 'diesel') return 'diesel';
  if (row.Ft === 'petrol') return row.Fm === 'H' ? 'hybrid' : 'gasoline';
  // Enchufables (petrol/electric) y gas natural: el dato homologado no sirve para
  // estimar el gasto real, mejor que el usuario lo escriba.
  return null;
}

/** L/100 km a partir del CO2 si falta el consumo (g de CO2 por litro quemado). */
const CO2_PER_LITRE: Partial<Record<FuelType, number>> = { gasoline: 2310, hybrid: 2310, diesel: 2640, lpg: 1660 };

function officialConsumptionOf(row: Row, fuel: FuelType): number | null {
  if (fuel === 'electric') return row.wh ? row.wh / 10 : null;
  if (row.fc) return row.fc;
  const perLitre = CO2_PER_LITRE[fuel];
  return row.co2 && perLitre ? (row.co2 * 100) / perLitre : null;
}

async function query(make: string, modelWords: string[], spainOnly: boolean, signal?: AbortSignal): Promise<Row[]> {
  const modelFilter = modelWords.map((w) => `Cn LIKE '%${w}%'`).join(' AND ');
  const sql = `SELECT TOP 40 Ft, Fm, [Ec (cm3)] cc, [Ep (KW)] kw, AVG(Fc) fc, AVG([Ewltp (g/km)]) co2, AVG([Z (Wh/km)]) wh, COUNT(*) n
    FROM ${TABLE}
    WHERE ${spainOnly ? "MS = 'ES' AND " : ''}Mk = '${make}' AND ${modelFilter}
    GROUP BY Ft, Fm, [Ec (cm3)], [Ep (KW)]
    ORDER BY n DESC`;
  const url = `${DISCODATA}?query=${encodeURIComponent(sql)}&p=1&nrOfHits=40`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`eea ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.error ?? 'eea');
  return json.results ?? [];
}

/**
 * Versiones de un coche con su consumo. Prueba primero con todas las palabras del
 * modelo ("Golf GTI") y, si no hay nada, solo con la primera ("Golf").
 */
export async function searchCarVersions(makeText: string, modelText: string, signal?: AbortSignal): Promise<CarVersion[]> {
  const cleanedMake = clean(makeText);
  const make = MAKE_ALIASES[cleanedMake] ?? cleanedMake;
  const words = clean(modelText).split(' ').filter((w) => w.length >= 1);
  if (make.length < 2 || !words.length) return [];

  // Primero lo matriculado en España; si el modelo no se vende aquí, en toda la UE.
  let rows: Row[] = [];
  for (const spainOnly of [true, false]) {
    rows = await query(make, words, spainOnly, signal);
    if (!rows.length && words.length > 1) rows = await query(make, [words[0]], spainOnly, signal);
    if (rows.length) break;
  }

  const versions: CarVersion[] = [];
  for (const row of rows) {
    const fuelType = fuelOf(row);
    // Versiones con 1-2 matriculaciones suelen ser errores de registro.
    if (!fuelType || (row.n < 10 && versions.length)) continue;
    const official = officialConsumptionOf(row, fuelType);
    if (!official || official <= 0 || official >= 60) continue;
    versions.push({
      key: `${row.Ft}-${row.Fm}-${row.cc}-${row.kw}`,
      fuelType,
      officialConsumption: official,
      consumption: Math.round(official * REAL_WORLD_FACTOR * 10) / 10,
      engineCc: row.cc,
      powerCv: row.kw ? Math.round(row.kw * 1.36) : null,
      registrations: row.n,
    });
    if (versions.length >= MAX_RESULTS) break;
  }
  return versions;
}
