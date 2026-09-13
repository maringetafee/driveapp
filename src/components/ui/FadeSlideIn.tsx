import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  index?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const STAGGER_MS = 45;
const MAX_STAGGER_INDEX = 10;

export default function FadeSlideIn({ index = 0, children, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      speed: 14,
      bounciness: 6,
      delay: Math.min(index, MAX_STAGGER_INDEX) * STAGGER_MS,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return <Animated.View style={[{ opacity: progress, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
