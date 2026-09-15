import { StyleSheet } from 'react-native';
import { colors, radius, spacing, type } from './colors';

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
  markText: { color: colors.accent, fontWeight: '800', fontSize: 20, letterSpacing: 0.5 },
  title: { ...type.title, fontSize: 36, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.xxl },
  form: { gap: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    color: colors.text,
    fontSize: 16,
  },
  inputFocused: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  link: { alignSelf: 'center', marginTop: spacing.xl },
  linkText: { color: colors.accentAlt, ...type.caption, fontWeight: '700' },
});
