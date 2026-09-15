import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import { formatDistance } from '../utils/geo';
import type { Units } from '../types/database';
import type { WeeklyRecap } from '../utils/weeklyRecap';
import SectionHeader from './ui/SectionHeader';

export default function WeeklyRecapCard({ recap, units }: { recap: WeeklyRecap; units: Units }) {
  if (recap.tripCount === 0) return null;

  const delta = recap.distanceMeters - recap.prevDistanceMeters;
  const deltaPct = recap.prevDistanceMeters > 0 ? Math.round((delta / recap.prevDistanceMeters) * 100) : null;

  return (
    <View style={styles.card}>
      <SectionHeader title="Tu semana" />
      <View style={styles.row}>
        <Stat value={String(recap.tripCount)} label="Trayectos" />
        <Stat value={formatDistance(recap.distanceMeters, units)} label="Distancia" />
        <Stat value={recap.avgDrivingScore != null ? String(recap.avgDrivingScore) : '—'} label="Score medio" />
      </View>
      {deltaPct != null && (
        <View style={styles.deltaRow}>
          <Ionicons
            name={delta >= 0 ? 'arrow-up' : 'arrow-down'}
            size={13}
            color={delta >= 0 ? colors.accent : colors.textFaint}
          />
          <Text style={[styles.delta, delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
            {Math.abs(deltaPct)}% vs. la semana anterior
          </Text>
        </View>
      )}
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { ...type.heading, fontFamily: fonts.numeralBold, color: colors.text },
  statLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  delta: { ...type.caption },
  deltaUp: { color: colors.accent },
  deltaDown: { color: colors.textFaint },
});
