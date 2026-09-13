import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/colors';
import { formatDistance, formatSpeed } from '../utils/geo';
import type { AggregateTripStats } from '../utils/aggregateTripStats';
import type { Units } from '../types/database';
import SectionHeader from './ui/SectionHeader';

export default function BestMarks({ stats, units }: { stats: AggregateTripStats; units: Units }) {
  if (stats.tripCount === 0) return null;

  const items = [
    { emoji: '⚡', label: 'Vel. máxima', value: formatSpeed(stats.maxSpeedKmh, units) },
    { emoji: '🎯', label: 'Mejor score', value: stats.bestDrivingScore != null ? String(stats.bestDrivingScore) : '—' },
    { emoji: '🛣️', label: 'Trayecto más largo', value: formatDistance(stats.longestTripMeters, units) },
  ];

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Mejores marcas" />
      <View style={styles.row}>
        {items.map((item) => (
          <View key={item.label} style={styles.item}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.value}>{item.value}</Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  item: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  emoji: { fontSize: 16, marginBottom: 4 },
  value: { ...type.subheading, color: colors.text },
  label: { ...type.caption, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
