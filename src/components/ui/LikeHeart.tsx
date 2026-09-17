import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

interface Props {
  liked: boolean;
  size?: number;
  color?: string;
  mutedColor?: string;
}

const PARTICLES = 6;

/** El corazón de "me gusta", con rebote y una pequeña explosión de partículas al marcar (no al desmarcar). */
export default function LikeHeart({ liked, size = 18, color = colors.danger, mutedColor = colors.textMuted }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const bursts = useRef(Array.from({ length: PARTICLES }, () => new Animated.Value(0))).current;
  const wasLiked = useRef(liked);

  useEffect(() => {
    if (liked && !wasLiked.current) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 30, bounciness: 16 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      ]).start();
      bursts.forEach((b) => b.setValue(0));
      Animated.stagger(
        20,
        bursts.map((b) => Animated.timing(b, { toValue: 1, duration: 480, useNativeDriver: true }))
      ).start();
    }
    wasLiked.current = liked;
  }, [liked, scale, bursts]);

  return (
    <View style={styles.wrap}>
      {bursts.map((b, i) => {
        const angle = (i / PARTICLES) * Math.PI * 2;
        const dist = size * 1.1;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.particle,
              {
                backgroundColor: color,
                opacity: b.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: b.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
                  { translateY: b.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
                  { scale: b.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? color : mutedColor} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', width: 5, height: 5, borderRadius: 3 },
});
