import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts, radius, spacing, type } from '../../theme/colors';
import { scoreTone } from '../../utils/scoreTone';

type Size = 'hero' | 'display' | 'pill';

interface Props {
  score: number | null;
  size?: Size;
  label?: string;
  style?: StyleProp<ViewStyle>;
  /** Animate the number counting up from 0 on mount. Only for hero/display sizes. */
  reveal?: boolean;
}

export default function ScoreDisplay({ score, size = 'display', label = 'driving score', style, reveal }: Props) {
  const tone = scoreTone(score);
  const anim = useRef(new Animated.Value(reveal ? 0 : score ?? 0)).current;
  const [displayValue, setDisplayValue] = useState(reveal ? 0 : Math.round(score ?? 0));
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!reveal || score == null) return;
    const listener = anim.addListener(({ value }) => setDisplayValue(Math.round(value)));
    Animated.spring(anim, { toValue: score, useNativeDriver: false, speed: 6, bounciness: 4 }).start(() => {
      if (score >= 85) {
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]).start();
      }
    });
    return () => anim.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, score]);

  const value = score != null ? String(reveal ? displayValue : Math.round(score)) : '—';

  if (size === 'pill') {
    return (
      <View style={[styles.pill, { borderColor: tone }, style]}>
        <Text style={[styles.pillText, { color: tone }]}>{value}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.block, style]}>
      <Animated.View
        style={[
          styles.glowRing,
          {
            opacity: glow,
            shadowColor: tone,
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) }],
          },
        ]}
      />
      <Text style={[size === 'hero' ? type.hero : type.display, { color: tone }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center' },
  label: { ...type.label, color: colors.textFaint, marginTop: 2 },
  glowRing: {
    position: 'absolute',
    top: -10,
    width: 140,
    height: 140,
    borderRadius: 70,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
  },
  pill: {
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { fontFamily: fonts.numeralBold, fontSize: 13 },
});
