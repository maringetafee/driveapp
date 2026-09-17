import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

const COLORS = [colors.accent, colors.gold, colors.accentAlt, colors.danger, colors.silver];
const COUNT = 16;

/** Confeti que cae una vez al montarse — para el momento de "nuevo récord personal". */
export default function Confetti() {
  const pieces = useRef(
    Array.from({ length: COUNT }, () => ({
      progress: new Animated.Value(0),
      x: (Math.random() - 0.5) * 220,
      rotate: Math.random() * 360,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 150,
      size: 6 + Math.random() * 5,
    }))
  ).current;

  useEffect(() => {
    Animated.stagger(
      12,
      pieces.map((p) =>
        Animated.timing(p.progress, { toValue: 1, duration: 900 + Math.random() * 300, useNativeDriver: true, delay: p.delay })
      )
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.wrap} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              width: p.size,
              height: p.size * 1.6,
              backgroundColor: p.color,
              opacity: p.progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: p.x },
                { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, 90] }) },
                { rotate: p.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.rotate}deg`] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: '50%', right: 0, height: 100, alignItems: 'center' },
  piece: { position: 'absolute', borderRadius: 2 },
});
