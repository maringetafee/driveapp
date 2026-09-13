import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/colors';

function Pulse({ style }: { style: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[style, { opacity }]} />;
}

/** Skeleton placeholder shaped like a feed/history card, shown while data loads. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pulse style={styles.avatar} />
        <View style={{ flex: 1, gap: 6 }}>
          <Pulse style={styles.lineShort} />
          <Pulse style={styles.lineTiny} />
        </View>
      </View>
      <Pulse style={styles.lineWide} />
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt },
  lineShort: { width: '40%', height: 12, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  lineTiny: { width: '25%', height: 10, borderRadius: 4, backgroundColor: colors.surfaceAlt },
  lineWide: { width: '60%', height: 14, borderRadius: 4, backgroundColor: colors.surfaceAlt },
});
