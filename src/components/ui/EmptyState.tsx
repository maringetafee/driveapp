import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../theme/colors';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
}

export default function EmptyState({ emoji = '🛣️', title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl, gap: 6 },
  emoji: { fontSize: 32, marginBottom: 4 },
  title: { ...type.subheading, color: colors.text, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
