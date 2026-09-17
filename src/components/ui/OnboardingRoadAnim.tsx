import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';

/** Coche recorriendo una carretera, decorativo, para el paso final del alta. */
export default function OnboardingRoadAnim() {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  return (
    <View style={styles.wrap}>
      <Animated.Text
        style={[styles.car, { transform: [{ translateX: x.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 220, 0] }) }] }]}
      >
        🚗
      </Animated.Text>
      <View style={styles.road} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 40, justifyContent: 'flex-end', marginBottom: 4 },
  car: { fontSize: 26, marginBottom: 6 },
  road: { height: 0, borderBottomWidth: 3, borderStyle: 'dashed', borderColor: colors.textFaint },
});
