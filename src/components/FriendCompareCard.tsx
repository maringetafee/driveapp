import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/colors';
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
  const winning = diff <= 0;

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/u/${friend.username}`)}>
      <Text style={styles.emoji}>{winning ? '🏆' : '🎯'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>
          {winning ? `Vas por delante de @${friend.username}` : `@${friend.username} te lleva ventaja`}
        </Text>
        <Text style={styles.subtitle}>
          {formatDistance(myDistanceMeters, units)} tú · {formatDistance(friend.distanceMeters, units)} @{friend.username} esta semana
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  emoji: { fontSize: 24 },
  title: { ...type.body, color: colors.text, fontWeight: '700' },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
