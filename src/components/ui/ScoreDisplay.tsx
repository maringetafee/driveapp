import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '../../theme/colors';
import { scoreTone } from '../../utils/scoreTone';

type Size = 'hero' | 'display' | 'pill';

interface Props {
  score: number | null;
  size?: Size;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export default function ScoreDisplay({ score, size = 'display', label = 'driving score', style }: Props) {
  const tone = scoreTone(score);
  const value = score != null ? String(Math.round(score)) : '—';

  if (size === 'pill') {
    return (
      <View style={[styles.pill, { borderColor: tone }, style]}>
        <Text style={[styles.pillText, { color: tone }]}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.block, style]}>
      <Text style={[size === 'hero' ? type.hero : type.display, { color: tone }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center' },
  label: { ...type.label, color: colors.textFaint, marginTop: 2 },
  pill: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontSize: 12, fontWeight: '800' },
});
