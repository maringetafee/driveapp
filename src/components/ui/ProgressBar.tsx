import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../../theme/colors';

interface Props {
  label: string;
  value: number;
  tone: string;
}

/** value: 0-100 */
export default function ProgressBar({ label, value, tone }: Props) {
  const width = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(100, value));

  useEffect(() => {
    Animated.timing(width, { toValue: clamped, duration: 500, useNativeDriver: false }).start();
  }, [clamped, width]);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color: tone }]}>{Math.round(clamped)}</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { backgroundColor: tone, width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...type.body, color: colors.textMuted, fontWeight: '600' },
  value: { ...type.subheading },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
