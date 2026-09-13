import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';

interface EarnedBadge {
  badge_id: string;
  badges: { name: string; description: string | null } | null;
}

export default function BadgesRow({ userId }: { userId: string }) {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('user_badges')
      .select('badge_id, badges(name, description)')
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
      <Text style={styles.title}>Insignias</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {badges.map((b) => (
          <View key={b.badge_id} style={styles.pill}>
            <Text style={styles.pillText}>{b.badges?.name}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8 },
  title: { color: colors.textMuted, fontSize: 14 },
  row: { gap: 8 },
  pill: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pillText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
