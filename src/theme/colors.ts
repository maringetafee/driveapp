export const colors = {
  background: '#08090D',
  backgroundElevated: '#0E1016',
  surface: '#12141C',
  surfaceAlt: '#1A1D28',
  surfaceRaised: '#20232F',
  border: '#252938',
  borderStrong: '#333849',
  text: '#F7F8FC',
  textMuted: '#9CA3B5',
  textFaint: '#6B7284',
  accent: '#4FE3A1',
  accentSoft: 'rgba(79, 227, 161, 0.14)',
  accentAlt: '#4C8DFF',
  accentAltSoft: 'rgba(76, 141, 255, 0.14)',
  gold: '#F5C24D',
  silver: '#C7CCDA',
  bronze: '#E0985F',
  danger: '#FF6B6B',
  dangerSoft: 'rgba(255, 107, 107, 0.14)',
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
  display: { fontSize: 56, fontWeight: '800' as const, letterSpacing: -1.5, lineHeight: 58 },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6, lineHeight: 34 },
  heading: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 26 },
  subheading: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.1, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '500' as const, letterSpacing: 0, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 18 },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6, lineHeight: 14 },
} as const;

export const shadow = {
  none: {},
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 10,
  },
  glow: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;
