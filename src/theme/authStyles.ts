import { StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing, type } from './colors';

export const authStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  markText: { fontFamily: fonts.numeralBold, color: colors.accent, fontSize: 22, letterSpacing: 0.5 },
  title: { ...type.title, fontSize: 36, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xxl },
  form: { gap: spacing.md },
  error: { ...type.caption, color: colors.danger },
  link: { alignSelf: 'center', marginTop: spacing.xl },
  linkText: { ...type.caption, color: colors.accentAlt },
});
