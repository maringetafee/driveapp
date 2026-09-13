export const colors = {
  background: '#0A0B0F',
  backgroundElevated: '#0E1016',
  surface: '#131520',
  surfaceAlt: '#1A1D28',
  surfaceRaised: '#20232F',
  border: '#22252F',
  borderStrong: '#333849',
  text: '#F7F8FC',
  textMuted: '#9CA3B5',
  textFaint: '#6B7284',

  // Roadly green — reserved for primary actions, active states, good scores,
  // achievements and other genuinely interactive/positive moments.
  accent: '#4FE3A1',
  accentSoft: 'rgba(79, 227, 161, 0.14)',
  accentAlt: '#4C8DFF',
  accentAltSoft: 'rgba(76, 141, 255, 0.14)',

  // Decorative-only (medal tiers). Do not reuse for semantic states.
  gold: '#F5C24D',
  silver: '#C7CCDA',
  bronze: '#E0985F',

  danger: '#FF6B6B',
  dangerSoft: 'rgba(255, 107, 107, 0.14)',
} as const;

// Semantic layer: what a color *means*, decoupled from which hue renders it.
// Use these (not raw colors.accent/gold/danger) anywhere a color communicates
// a state, so meaning stays consistent even if the palette shifts later.
export const semantic = {
  success: colors.accent,
  successSoft: colors.accentSoft,
  warning: colors.gold,
  warningSoft: 'rgba(245, 194, 77, 0.14)',
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

export const type = {
  // Reserved for the single dominant number on a screen (live speed, driving score hero).
  hero: { fontSize: 64, fontWeight: '800' as const, letterSpacing: -2.5, lineHeight: 66 },
  display: { fontSize: 48, fontWeight: '800' as const, letterSpacing: -1.5, lineHeight: 50 },
  title: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6, lineHeight: 36 },
  heading: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 28 },
  subheading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.1, lineHeight: 23 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.7, lineHeight: 14 },
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
