import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius, type } from '../../theme/colors';

type Variant = 'primary' | 'danger' | 'secondary' | 'ghost';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export default function PrimaryButton({ title, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const pressIn = () => {
    if (isDisabled) return;
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        style={[styles.base, variantStyles[variant], isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.accent : colors.background} />
        ) : (
          <Text style={[styles.text, variantTextStyles[variant]]}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...type.subheading, letterSpacing: 0.1 },
  disabled: { opacity: 0.45 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
});

const variantTextStyles = StyleSheet.create({
  primary: { color: '#04140D' },
  danger: { color: '#1A0505' },
  secondary: { color: colors.accent },
  ghost: { color: colors.text },
});
