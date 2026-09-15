import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, type } from '../../theme/colors';

export interface StatItem {
  label: string;
  value: string;
  tone?: string;
}

interface Props {
  items: StatItem[];
  boxed?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One flat row of stats separated by dividers — a single surface instead of one bordered box per stat. */
export default function StatRow({ items, boxed = true, style }: Props) {
  return (
    <View style={[boxed && styles.boxed, styles.row, style]}>
      {items.map((item, i) => (
        <View key={item.label} style={styles.itemWrap}>
          {i > 0 && <View style={styles.divider} />}
          <View style={styles.item}>
            <Text
              style={[styles.value, item.tone && { color: item.tone }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {item.value}
            </Text>
            <Text style={styles.label}>{item.label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  boxed: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
  },
  itemWrap: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  divider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  item: { flex: 1, alignItems: 'center' },
  value: { ...type.stat, color: colors.text },
  label: { ...type.caption, color: colors.textMuted, marginTop: 3, textAlign: 'center' },
});
