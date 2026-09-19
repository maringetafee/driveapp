import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../../theme/colors';

export type AchievementKind = 'speed';

const KIND_STYLE: Record<AchievementKind, { emoji: string; color: string; bg: string }> = {
  speed: { emoji: '⚡', color: colors.accentAlt, bg: colors.accentAltSoft },
};

export default function AchievementBadge({ kind, label }: { kind: AchievementKind; label: string }) {
  const s = KIND_STYLE[kind];
  return (
    <View style={[styles.wrap, { backgroundColor: s.bg }]}>
      <Text style={styles.emoji}>{s.emoji}</Text>
      <Text style={[styles.label, { color: s.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  emoji: { fontSize: 12 },
  label: { ...type.label, letterSpacing: 0.2 },
});
