import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/colors';
import { formatDistance, formatSpeed } from '../utils/geo';
import { formatLaunchTime } from '../utils/launchTimer';
import type { AggregateTripStats } from '../utils/aggregateTripStats';
import type { Units } from '../types/database';
import SectionHeader from './ui/SectionHeader';

export default function BestMarks({ stats, units }: { stats: AggregateTripStats; units: Units }) {
  if (stats.tripCount === 0) return null;

  const items = [
    { emoji: '⚡', label: 'Vel. máxima', value: formatSpeed(stats.maxSpeedKmh, units) },
    { emoji: '🚀', label: 'Mejor 0-100 km/h', value: formatLaunchTime(stats.best0to100Seconds) },
    { emoji: '🎯', label: 'Mejor score', value: stats.bestDrivingScore != null ? String(stats.bestDrivingScore) : '—' },
    { emoji: '🛣️', label: 'Trayecto más largo', value: formatDistance(stats.longestTripMeters, units) },
  ];

  return (
    <View style={styles.wrap}>
      <SectionHeader title="Mejores marcas" />
      <View style={styles.grid}>
        {items.map((item) => (
          <View key={item.label} style={styles.item}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.value}>{item.value}</Text>
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          </View>
        ))}
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
  value: { ...type.subheading, color: colors.text },
  label: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
