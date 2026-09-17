// Historial de mantenimiento del coche (ITV, aceite, neumáticos...).
import { supabase } from '../lib/supabase';

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  kind: string;
  done_at: string;
  odometer_km: number | null;
  cost_eur: number | null;
  notes: string | null;
  created_at: string;
}

export const MAINTENANCE_KINDS = ['Cambio de aceite', 'Neumáticos', 'Frenos', 'ITV', 'Revisión', 'Batería', 'Otro'] as const;

export async function fetchMaintenance(vehicleId: string): Promise<MaintenanceRecord[]> {
  const { data } = await supabase
    .from('vehicle_maintenance')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('done_at', { ascending: false });
  return data ?? [];
}

export async function addMaintenance(record: {
  vehicle_id: string;
  kind: string;
  done_at: string;
  odometer_km: number | null;
  cost_eur: number | null;
  notes: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from('vehicle_maintenance').insert(record);
  return !error;
}

export async function deleteMaintenance(id: string): Promise<void> {
  await supabase.from('vehicle_maintenance').delete().eq('id', id);
}

/** Acepta "5/3/2026" o "05-03-2026"; devuelve "YYYY-MM-DD" o null si no es válida. */
export function parseSpanishDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatSpanishDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
