import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors, radius, spacing, type } from '../../theme/colors';

interface Props extends TextInputProps {
  /** 'default' = rounded-rect form field. 'pill' = fully rounded (search bars, comment boxes). */
  variant?: 'default' | 'pill';
  /** Optional leading icon (search bars). */
  icon?: ComponentProps<typeof Ionicons>['name'];
  containerStyle?: StyleProp<ViewStyle>;
}

/** The app's single text-input look — replaces the per-screen hand-rolled TextInput + focus-state pattern. */
const Input = forwardRef<TextInput, Props>(function Input(
  { variant = 'default', icon, containerStyle, style, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);

  const field = (
    <TextInput
      ref={ref}
      style={[
        styles.base,
        variant === 'pill' && styles.pill,
        icon && styles.withIcon,
        focused && styles.focused,
        style,
      ]}
      placeholderTextColor={colors.textFaint}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    />
  );

  if (!icon) return field;

  return (
    <View style={[styles.iconWrap, containerStyle]}>
      <Ionicons name={icon} size={18} color={colors.textFaint} style={styles.icon} />
      {field}
    </View>
  );
});

export default Input;

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.text,
    ...type.body,
  },
  pill: { borderRadius: radius.pill },
  focused: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  iconWrap: { justifyContent: 'center' },
  icon: { position: 'absolute', left: spacing.lg, zIndex: 1 },
  withIcon: { paddingLeft: spacing.xl + spacing.md },
});
