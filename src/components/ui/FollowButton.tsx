import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, spacing, type } from '../../theme/colors';

export type FollowState = 'none' | 'pending' | 'following';

interface Props {
  state: FollowState;
  onPress: () => void;
  disabled?: boolean;
  /** 'sm' = inline in a list row (search results). 'md' = standalone CTA (profile header). */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

const LABEL: Record<FollowState, string> = {
  none: 'Seguir',
  pending: 'Solicitado',
  following: 'Siguiendo',
};

/** The app's single follow/unfollow control — used on search results and public profiles. */
export default function FollowButton({ state, onPress, disabled, size = 'sm', style }: Props) {
  const active = state !== 'none';
  return (
    <Pressable
      style={[styles.base, size === 'md' && styles.md, active && styles.active, style]}
      onPress={onPress}
      disabled={disabled}
    >
      {state === 'following' && (
        <Ionicons name="checkmark" size={14} color={colors.accent} style={styles.icon} />
      )}
      <Text style={[styles.text, active && styles.textActive]}>{LABEL[state]}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
  },
  md: { paddingVertical: 11, paddingHorizontal: spacing.xl, alignSelf: 'flex-start' },
  active: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.accent },
  icon: { marginRight: -2 },
  text: { ...type.caption, fontFamily: fonts.bodyExtraBold, color: colors.onAccent },
  textActive: { color: colors.accent },
});
