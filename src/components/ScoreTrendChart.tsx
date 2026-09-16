import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/colors';
import { scoreTone } from '../utils/scoreTone';
import SectionHeader from './ui/SectionHeader';

const CHART_HEIGHT = 72;

export default function ScoreTrendChart({ scores }: { scores: number[] }) {
  if (scores.length < 3) return null;

  return (
    <View style={styles.wrapper}>
      <SectionHeader title="Evolución del score" />
      <View style={styles.chart}>
        {scores.map((score, i) => {
          const height = Math.max(4, (Math.max(0, Math.min(100, score)) / 100) * CHART_HEIGHT);
          return (
            <View key={i} style={styles.barWrap}>
              <View style={[styles.bar, { height, backgroundColor: scoreTone(score) }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        <Text style={styles.label}>Últimos {scores.length} trayectos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    // La altura de las barras no incluye el relleno de la caja.
    height: CHART_HEIGHT + spacing.md * 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', borderRadius: 3, minHeight: 4 },
  labelsRow: { alignItems: 'center' },
  label: { ...type.caption, color: colors.textFaint },
});
