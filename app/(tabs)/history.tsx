import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration } from '../../src/utils/geo';
import { scoreTone } from '../../src/utils/scoreTone';
import type { Trip, TripTag } from '../../src/types/database';
import Chip from '../../src/components/ui/Chip';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import ScoreDisplay from '../../src/components/ui/ScoreDisplay';
import EmptyState from '../../src/components/ui/EmptyState';
import { SkeletonList } from '../../src/components/ui/Skeleton';

const STANDOUT_SCORE = 90;

const TAG_LABEL: Record<TripTag, string> = {
  commute: '🏢 Commute',
  road_trip: '🛣️ Viaje largo',
  night: '🌙 Nocturno',
  other: '📍 Otro',
};

const TAG_FILTERS: { key: TripTag | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'commute', label: '🏢 Commute' },
  { key: 'road_trip', label: '🛣️ Viaje largo' },
  { key: 'night', label: '🌙 Nocturno' },
  { key: 'other', label: '📍 Otro' },
];

export default function HistoryScreen() {
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tagFilter, setTagFilter] = useState<TripTag | 'all'>('all');

  const loadTrips = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!session) return;
      if (!opts?.silent) setLoading(true);
      const { data } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false });
      setTrips(data ?? []);
      setLoading(false);
    },
    [session]
  );

  useFocusEffect(
    useCallback(() => {
      loadTrips();
    }, [loadTrips])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTrips({ silent: true });
    setRefreshing(false);
  };

  const filteredTrips = useMemo(
    () => (tagFilter === 'all' ? trips : trips.filter((t) => t.tag === tagFilter)),
    [trips, tagFilter]
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={filteredTrips}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.md }}>
            <Text style={styles.header}>Historial</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {TAG_FILTERS.map((f) => (
                <Chip key={f.key} label={f.label} active={tagFilter === f.key} onPress={() => setTagFilter(f.key)} />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <EmptyState emoji="🗺️" title="Aún no has registrado trayectos" subtitle="Cuando termines uno, aparecerá aquí." />
          )
        }
        renderItem={({ item, index }) => {
          const standout = item.driving_score != null && item.driving_score >= STANDOUT_SCORE;
          return (
            <FadeSlideIn index={index}>
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  standout && { borderLeftColor: scoreTone(item.driving_score), borderLeftWidth: 3 },
                  pressed && styles.cardPressed,
                ]}
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
                  {item.driving_score != null && <ScoreDisplay score={item.driving_score} size="pill" />}
                </View>
                <View style={styles.row}>
                  <Text style={styles.metric}>{formatDistance(item.distance_meters ?? 0, units)}</Text>
                  <View style={styles.dot} />
                  <Text style={styles.metric}>{formatDuration(item.duration_seconds ?? 0)}</Text>
                  {standout && <Text style={styles.standoutTag}>🔥 Destacado</Text>}
                </View>
                {item.tag && <Text style={styles.tagText}>{TAG_LABEL[item.tag]}</Text>}
              </Pressable>
            </FadeSlideIn>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { ...type.title, color: colors.text },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  tagText: { ...type.caption, color: colors.textFaint, marginTop: 6 },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metric: { ...type.subheading, fontFamily: fonts.numeralSemiBold, color: colors.text },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textFaint },
  standoutTag: { ...type.caption, color: colors.gold, marginLeft: 'auto' },
});
