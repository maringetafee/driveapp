import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import {
  addMaintenance,
  deleteMaintenance,
  fetchMaintenance,
  formatSpanishDate,
  parseSpanishDate,
  MAINTENANCE_KINDS,
  type MaintenanceRecord,
} from '../utils/maintenance';
import { formatEuros, parseDecimal } from '../utils/energyCost';
import Chip from './ui/Chip';
import Input from './ui/Input';
import PrimaryButton from './ui/PrimaryButton';
import SectionHeader from './ui/SectionHeader';
import FadeSlideIn from './ui/FadeSlideIn';

export default function VehicleMaintenanceSection({ vehicleId }: { vehicleId: string }) {
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<string>(MAINTENANCE_KINDS[0]);
  const [customKind, setCustomKind] = useState('');
  const [date, setDate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchMaintenance(vehicleId).then((rows) => {
      setRecords(rows);
      setLoading(false);
    });
  };

  useEffect(load, [vehicleId]);

  const resetForm = () => {
    setKind(MAINTENANCE_KINDS[0]);
    setCustomKind('');
    setDate('');
    setOdometer('');
    setCost('');
    setNotes('');
    setError(null);
  };

  const onSave = async () => {
    const finalKind = kind === 'Otro' ? customKind.trim() : kind;
    const isoDate = date.trim() ? parseSpanishDate(date) : new Date().toISOString().slice(0, 10);
    if (!finalKind) {
      setError('Indica qué se hizo.');
      return;
    }
    if (!isoDate) {
      setError('Fecha no válida. Usa DD/MM/AAAA.');
      return;
    }
    setSaving(true);
    const ok = await addMaintenance({
      vehicle_id: vehicleId,
      kind: finalKind,
      done_at: isoDate,
      odometer_km: odometer.trim() ? Math.round(Number(odometer.replace(',', '.'))) : null,
      cost_eur: cost.trim() ? parseDecimal(cost) : null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (!ok) {
      setError('No se pudo guardar. Comprueba tu conexión.');
      return;
    }
    resetForm();
    setAdding(false);
    load();
  };

  const onDelete = (record: MaintenanceRecord) => {
    Alert.alert('Borrar registro', `¿Borrar "${record.kind}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          await deleteMaintenance(record.id);
          load();
        },
      },
    ]);
  };

  if (loading) return null;

  return (
    <View style={styles.wrap}>
      <SectionHeader
        title="Mantenimiento"
        action={
          adding
            ? { label: 'Cancelar', onPress: () => { setAdding(false); resetForm(); } }
            : { label: '+ Añadir', onPress: () => setAdding(true) }
        }
      />

      {adding && (
        <View style={styles.form}>
          <View style={styles.chipRow}>
            {MAINTENANCE_KINDS.map((k) => (
              <Chip key={k} label={k} active={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          {kind === 'Otro' && <Input placeholder="¿Qué se hizo?" value={customKind} onChangeText={setCustomKind} />}
          <Input
            placeholder="Fecha (DD/MM/AAAA, hoy si lo dejas vacío)"
            value={date}
            onChangeText={setDate}
            keyboardType="numbers-and-punctuation"
          />
          <Input placeholder="Kilómetros (opcional)" value={odometer} onChangeText={setOdometer} keyboardType="numeric" />
          <Input placeholder="Coste en € (opcional)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
          <Input placeholder="Notas (opcional)" value={notes} onChangeText={setNotes} />
          {error && <Text style={styles.error}>{error}</Text>}
          <PrimaryButton title="Guardar" onPress={onSave} loading={saving} />
        </View>
      )}

      {records.length === 0 && !adding && <Text style={styles.hint}>Sin registros todavía.</Text>}

      {records.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {records.map((r, i) => (
            <FadeSlideIn key={r.id} index={i}>
              <Pressable style={styles.row} onLongPress={() => onDelete(r)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowKind}>{r.kind}</Text>
                  <Text style={styles.rowMeta}>
                    {formatSpanishDate(r.done_at)}
                    {r.odometer_km != null ? ` · ${r.odometer_km.toLocaleString('es-ES')} km` : ''}
                  </Text>
                  {!!r.notes && (
                    <Text style={styles.rowNotes} numberOfLines={2}>
                      {r.notes}
                    </Text>
                  )}
                </View>
                {r.cost_eur != null && <Text style={styles.rowCost}>{formatEuros(r.cost_eur)}</Text>}
              </Pressable>
            </FadeSlideIn>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  form: { gap: spacing.sm, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...type.caption, color: colors.danger },
  hint: { ...type.body, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowKind: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text },
  rowMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  rowNotes: { ...type.caption, color: colors.textFaint, marginTop: 2 },
  rowCost: { fontFamily: fonts.numeralBold, fontSize: 15, color: colors.accent },
});
