import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, type } from '../theme/colors';
import type { AggregateTripStats } from '../utils/aggregateTripStats';
import ProgressBar from './ui/ProgressBar';
import SectionHeader from './ui/SectionHeader';

interface BadgeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface EarnedBadge {
  badge_id: string;
  badges: BadgeRow | null;
}

const BADGE_EMOJI: Record<string, string> = {
  primer_trayecto: '🚦',
  diez_trayectos: '🔟',
  cincuenta_trayectos: '💯',
  distancia_100: '🛣️',
  distancia_500: '🗺️',
  distancia_1000: '🌍',
  distancia_5000: '🚀',
  conduccion_suave: '🧘',
  conductor_nocturno: '🌙',
  racha_semana: '🔥',
  score_perfecto: '🎯',
};
const DEFAULT_EMOJI = '🏅';

/** Only badges whose progress can be derived from AggregateTripStats without an extra query. */
function progressFor(code: string, stats: AggregateTripStats): number | null {
  const km = stats.totalDistanceMeters / 1000;
  switch (code) {
    case 'distancia_100':
      return (km / 100) * 100;
    case 'distancia_500':
      return (km / 500) * 100;
    case 'distancia_1000':
      return (km / 1000) * 100;
    case 'distancia_5000':
      return (km / 5000) * 100;
    case 'diez_trayectos':
      return (stats.tripCount / 10) * 100;
    case 'cincuenta_trayectos':
      return (stats.tripCount / 50) * 100;
    case 'racha_semana':
      return (stats.streak / 7) * 100;
    default:
      return null;
  }
}

export default function BadgesRow({ userId, stats }: { userId: string; stats?: AggregateTripStats | null }) {
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [allBadges, setAllBadges] = useState<BadgeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('user_badges')
      .select('badge_id, badges(id, code, name, description)')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!cancelled) setEarned((data as unknown as EarnedBadge[]) ?? []);
      });
    if (stats) {
      supabase
        .from('badges')
        .select('id, code, name, description')
        .then(({ data }) => {
          if (!cancelled) setAllBadges(data ?? []);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [userId, stats]);

  const earnedCodes = new Set(earned.map((b) => b.badges?.code).filter(Boolean));
  const nextUp = stats
    ? allBadges
        .filter((b) => !earnedCodes.has(b.code))
        .map((b) => ({ badge: b, progress: progressFor(b.code, stats) }))
        .filter((b) => b.progress != null && b.progress > 0)
        .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
        .slice(0, 2)
    : [];

  if (earned.length === 0 && nextUp.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <SectionHeader title="Logros" />
      {earned.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {earned.map((b) => (
            <View key={b.badge_id} style={styles.pill}>
              <Text style={styles.emoji}>{BADGE_EMOJI[b.badges?.code ?? ''] ?? DEFAULT_EMOJI}</Text>
              <Text style={styles.pillText}>{b.badges?.name}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      {nextUp.length > 0 && (
        <View style={styles.nextUpBlock}>
          {nextUp.map(({ badge, progress }) => (
            <ProgressBar
              key={badge.id}
              label={`${BADGE_EMOJI[badge.code] ?? DEFAULT_EMOJI} ${badge.name}`}
              value={progress ?? 0}
              tone={colors.textMuted}
              suffix="%"
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  row: { gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  emoji: { fontSize: 14 },
  pillText: { ...type.caption, color: colors.accent },
  nextUpBlock: { gap: spacing.md, marginTop: 2 },
});
