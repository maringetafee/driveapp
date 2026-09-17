import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';

interface Props {
  size?: number;
  style?: StyleProp<TextStyle>;
}

/** El 🔥 de la racha con un pulso suave, para que se note que está "viva". */
export default function StreakFlame({ size = 22, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 480, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.96, duration: 420, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 380, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return <Animated.Text style={[{ fontSize: size, transform: [{ scale }] }, style]}>🔥</Animated.Text>;
}
