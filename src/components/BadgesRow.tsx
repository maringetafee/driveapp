import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, radius, spacing, type } from '../theme/colors';
import SectionHeader from './ui/SectionHeader';

interface EarnedBadge {
  badge_id: string;
  badges: { code: string; name: string; description: string | null } | null;
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
};
const DEFAULT_EMOJI = '🏅';

export default function BadgesRow({ userId }: { userId: string }) {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('user_badges')
      .select('badge_id, badges(code, name, description)')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (!cancelled) setBadges((data as unknown as EarnedBadge[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (badges.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <SectionHeader title="Logros" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {badges.map((b) => (
          <View key={b.badge_id} style={styles.pill}>
            <Text style={styles.emoji}>{BADGE_EMOJI[b.badges?.code ?? ''] ?? DEFAULT_EMOJI}</Text>
            <Text style={styles.pillText}>{b.badges?.name}</Text>
          </View>
        ))}
      </ScrollView>
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
  pillText: { color: colors.accent, ...type.caption, fontWeight: '700' },
});
