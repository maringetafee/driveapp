import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import {
  currentRecords,
  fetchRecordRows,
  formatRecordValue,
  RECORD_INFO,
  type PersonalRecord,
  type RecordKey,
} from '../utils/personalRecords';
import type { Units } from '../types/database';
import SectionHeader from './ui/SectionHeader';

interface Props {
  userId: string;
  units: Units;
  /** Cambia para volver a cargar (p. ej. al volver a la pantalla). */
  refreshKey?: number;
}

/** Récords personales: marcas propias en vez de una nota. */
export default function BestMarks({ userId, units, refreshKey }: Props) {
  const [records, setRecords] = useState<Map<RecordKey, PersonalRecord> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecordRows(userId).then((rows) => {
      if (!cancelled) setRecords(new Map(currentRecords(rows).map((r) => [r.key, r])));
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (!records || records.size === 0) return null;

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Récords personales" />
      <View style={styles.grid}>
        {(Object.keys(RECORD_INFO) as RecordKey[]).map((key) => {
          const record = records.get(key);
          return (
            <View key={key} style={styles.item}>
              <Text style={styles.emoji}>{RECORD_INFO[key].emoji}</Text>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {record ? formatRecordValue(key, record.value, units) : '—'}
                </Text>
                <Text style={styles.label} numberOfLines={1}>
                  {RECORD_INFO[key].short}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  emoji: { fontSize: 20 },
  value: { ...type.subheading, fontFamily: fonts.numeralBold, color: colors.text },
  label: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
