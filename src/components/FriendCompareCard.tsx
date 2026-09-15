import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import { formatDistance } from '../utils/geo';
import type { Units } from '../types/database';
import type { FriendComparison } from '../utils/weeklyRecap';

export default function FriendCompareCard({
  friend,
  myDistanceMeters,
  units,
}: {
  friend: FriendComparison;
  myDistanceMeters: number;
  units: Units;
}) {
  const diff = friend.distanceMeters - myDistanceMeters;
  const max = Math.max(friend.distanceMeters, myDistanceMeters, 1);
  const title =
    Math.abs(diff) < 1
      ? `Empate con @${friend.username}`
      : diff < 0
        ? `Vas por delante de @${friend.username}`
        : `@${friend.username} te saca ${formatDistance(diff, units)}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/u/${friend.username}`)}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {diff < 0 ? '🏆 ' : '🎯 '}
          {title}
        </Text>
        <Text style={styles.caption}>Esta semana</Text>
      </View>
      <Bar label="Tú" value={myDistanceMeters} max={max} units={units} highlight />
      <Bar label={`@${friend.username}`} value={friend.distanceMeters} max={max} units={units} />
    </Pressable>
  );
}

function Bar({
  label,
  value,
  max,
  units,
  highlight,
}: {
  label: string;
  value: number;
  max: number;
  units: Units;
  highlight?: boolean;
}) {
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, highlight && styles.barLabelMe]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.max(3, (value / max) * 100)}%`, backgroundColor: highlight ? colors.accent : colors.borderStrong },
          ]}
        />
      </View>
      <Text style={styles.barValue}>{formatDistance(value, units)}</Text>
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
    gap: spacing.sm,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 2 },
  title: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
  caption: { ...type.caption, color: colors.textFaint },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { ...type.caption, color: colors.textMuted, width: 96 },
  barLabelMe: { color: colors.text },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  barValue: { ...type.caption, color: colors.text, width: 64, textAlign: 'right' },
});
