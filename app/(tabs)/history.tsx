import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration } from '../../src/utils/geo';
import type { Trip } from '../../src/types/database';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';

function scoreTone(score: number | null) {
  if (score == null) return colors.textMuted;
  if (score >= 85) return colors.accent;
  if (score >= 60) return colors.gold;
  return colors.danger;
}

export default function HistoryScreen() {
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [trips, setTrips] = useState<Trip[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('trips')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .then(({ data }) => setTrips(data ?? []));
    }, [session])
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={trips}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.header}>Historial</Text>}
        ListEmptyComponent={<Text style={styles.empty}>Aún no has registrado trayectos.</Text>}
        renderItem={({ item, index }) => (
          <FadeSlideIn index={index}>
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/trip/${item.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.date}>
                  {new Date(item.started_at).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                {item.driving_score != null && (
                  <View style={[styles.scorePill, { borderColor: scoreTone(item.driving_score) }]}>
                    <Text style={[styles.scoreText, { color: scoreTone(item.driving_score) }]}>
                      {item.driving_score}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.row}>
                <Text style={styles.metric}>{formatDistance(item.distance_meters ?? 0, units)}</Text>
                <View style={styles.dot} />
                <Text style={styles.metric}>{formatDuration(item.duration_seconds ?? 0)}</Text>
              </View>
            </Pressable>
          </FadeSlideIn>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  date: { ...type.caption, color: colors.textMuted },
  scorePill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  scoreText: { fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metric: { ...type.subheading, color: colors.text },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textFaint },
});
