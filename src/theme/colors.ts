// Font families loaded via @expo-google-fonts in app/_layout.tsx (useFonts gate).
// Space Grotesk carries numbers/titles (technical, sporty character — this is
// where Roadly's stats should feel like data, not just text). Inter carries
// body copy (max legibility at small sizes).
export const fonts = {
  numeralBold: 'SpaceGrotesk_700Bold',
  numeralSemiBold: 'SpaceGrotesk_600SemiBold',
  numeralMedium: 'SpaceGrotesk_500Medium',
  bodyExtraBold: 'Inter_800ExtraBold',
  bodyBold: 'Inter_700Bold',
  bodySemiBold: 'Inter_600SemiBold',
  bodyMedium: 'Inter_500Medium',
} as const;

export const colors = {
  background: '#0B0A0D',
  backgroundElevated: '#0F0D11',
  surface: '#17151A',
  surfaceAlt: '#1F1B22',
  surfaceRaised: '#28232C',
  border: '#2A262E',
  borderStrong: '#3D3844',
  text: '#F9F7F5',
  textMuted: '#A6A1AA',
  textFaint: '#726D78',

  // Roadly amber — reserved for primary actions, active states, good scores,
  // achievements and other genuinely interactive/positive moments.
  accent: '#FF7A29',
  accentSoft: 'rgba(255, 122, 41, 0.14)',
  // Cool secondary — social features, informational accents, links.
  accentAlt: '#4E8BFF',
  accentAltSoft: 'rgba(78, 139, 255, 0.14)',

  // Legible dark text placed *on top of* an accent-colored background.
  onAccent: '#241000',
  onDanger: '#2A0A0A',

  // Decorative-only (medal tiers). Do not reuse for semantic states.
  gold: '#F0B429',
  silver: '#C9CDD6',
  bronze: '#D98A52',

  danger: '#FF5A5F',
  dangerSoft: 'rgba(255, 90, 95, 0.14)',
} as const;

// Semantic layer: what a color *means*, decoupled from which hue renders it.
// Use these (not raw colors.accent/gold/danger) anywhere a color communicates
// a state, so meaning stays consistent even if the palette shifts later.
export const semantic = {
  success: colors.accent,
  successSoft: colors.accentSoft,
  warning: colors.gold,
  warningSoft: 'rgba(240, 180, 41, 0.14)',
  danger: colors.danger,
  dangerSoft: colors.dangerSoft,
  neutral: colors.textMuted,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

const tabularNums: import('react-native').TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  // Reserved for the single dominant number on a screen (live speed, driving score hero).
  hero: {
    fontFamily: fonts.numeralBold,
    fontSize: 64,
    letterSpacing: -2.5,
    lineHeight: 66,
    fontVariant: tabularNums,
  },
  display: {
    fontFamily: fonts.numeralBold,
    fontSize: 48,
    letterSpacing: -1.5,
    lineHeight: 50,
    fontVariant: tabularNums,
  },
  // A secondary numeric weight class, one notch under `display` — the app's
  // most-repeated stat readouts (StatRow values, podium values, records).
  stat: {
    fontFamily: fonts.numeralBold,
    fontSize: 26,
    letterSpacing: -0.6,
    lineHeight: 30,
    fontVariant: tabularNums,
  },
  title: { fontFamily: fonts.numeralBold, fontSize: 30, letterSpacing: -0.6, lineHeight: 36 },
  heading: { fontFamily: fonts.numeralSemiBold, fontSize: 22, letterSpacing: -0.3, lineHeight: 28 },
  subheading: { fontFamily: fonts.bodyBold, fontSize: 17, letterSpacing: -0.1, lineHeight: 23 },
  body: { fontFamily: fonts.bodyMedium, fontSize: 15, letterSpacing: 0, lineHeight: 21 },
  caption: { fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.1, lineHeight: 18 },
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.7, lineHeight: 14 },
} as const;

export const shadow = {
  none: {},
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 5,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 9,
  },
  // Reserved for the single primary CTA on a screen. Do not spread to other elements.
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// The app's one canonical "card" shell (surface + border + radius.lg + padding)
// — reuse this instead of re-declaring the same four properties per screen.
export const cardStyles = {
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pressed: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
} as const;
