import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../../src/utils/geo';
import { scoreTone } from '../../src/utils/scoreTone';
import NotificationBell from '../../src/components/NotificationBell';
import Avatar from '../../src/components/ui/Avatar';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import ScoreDisplay from '../../src/components/ui/ScoreDisplay';
import StatRow from '../../src/components/ui/StatRow';
import AchievementBadge, { type AchievementKind } from '../../src/components/ui/AchievementBadge';
import Divider from '../../src/components/ui/Divider';
import EmptyState from '../../src/components/ui/EmptyState';
import ScaledPressable from '../../src/components/ui/ScaledPressable';
import { SkeletonList } from '../../src/components/ui/Skeleton';

const HIGH_SPEED_THRESHOLD_KMH = 120;

interface FeedItem {
  id: string;
  started_at: string;
  distance_meters: number | null;
  duration_seconds: number | null;
  max_speed_kmh: number | null;
  driving_score: number | null;
  user_id: string;
  profiles: { username: string } | null;
  trip_likes: { count: number }[];
  trip_comments: { count: number }[];
}

function achievementsFor(item: FeedItem): { kind: AchievementKind; label: string }[] {
  const badges: { kind: AchievementKind; label: string }[] = [];
  if (item.driving_score != null && item.driving_score >= 90) {
    badges.push({ kind: 'score', label: 'Score excelente' });
  }
  if (item.max_speed_kmh != null && item.max_speed_kmh >= HIGH_SPEED_THRESHOLD_KMH) {
    badges.push({ kind: 'speed', label: 'Alta velocidad' });
  }
  return badges;
}

export default function FeedScreen() {
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!session) return;
      if (!opts?.silent) setLoading(true);
      const { data: follows } = await supabase
        .from('follows')
        .select('followed_id')
        .eq('follower_id', session.user.id)
        .eq('status', 'accepted');

      const authorIds = [...(follows ?? []).map((f) => f.followed_id), session.user.id];

      const { data: trips } = await supabase
        .from('trips')
        .select(
          'id, started_at, distance_meters, duration_seconds, max_speed_kmh, driving_score, user_id, profiles!trips_user_id_fkey(username), trip_likes(count), trip_comments(count)'
        )
        .in('user_id', authorIds)
        .eq('is_public', true)
        .order('started_at', { ascending: false })
        .limit(30);

      const feedItems = (trips as unknown as FeedItem[]) ?? [];
      setItems(feedItems);

      if (feedItems.length) {
        const { data: myLikes } = await supabase
          .from('trip_likes')
          .select('trip_id')
          .eq('user_id', session.user.id)
          .in('trip_id', feedItems.map((t) => t.id));
        setLikedIds(new Set((myLikes ?? []).map((l) => l.trip_id)));
      }

      setLoading(false);
    },
    [session]
  );

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFeed({ silent: true });
    setRefreshing(false);
  };

  const onToggleLike = async (tripId: string, currentlyLiked: boolean) => {
    if (!session) return;
    if (currentlyLiked) {
      await supabase.from('trip_likes').delete().eq('trip_id', tripId).eq('user_id', session.user.id);
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(tripId);
        return next;
      });
    } else {
      await supabase.from('trip_likes').insert({ trip_id: tripId, user_id: session.user.id });
      setLikedIds((prev) => new Set(prev).add(tripId));
    }
    setItems((prev) =>
      prev.map((item) =>
        item.id === tripId
          ? {
              ...item,
              trip_likes: [{ count: (item.trip_likes?.[0]?.count ?? 0) + (currentlyLiked ? -1 : 1) }],
            }
          : item
      )
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        ListHeaderComponent={
          <View style={styles.headerRow}>
            <Text style={styles.header}>Feed</Text>
            <View style={styles.headerActions}>
              <NotificationBell />
              <Pressable style={styles.searchButton} onPress={() => router.push('/search')} hitSlop={8}>
                <Ionicons name="search" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <EmptyState
              emoji="🚗"
              title="Sin actividad todavía"
              subtitle="Sigue a otros conductores para ver aquí sus trayectos, o completa el tuyo."
            />
          )
        }
        renderItem={({ item, index }) => {
          const liked = likedIds.has(item.id);
          const username = item.profiles?.username ?? '—';
          const badges = achievementsFor(item);
          return (
            <FadeSlideIn index={index} style={styles.card}>
              <Pressable style={styles.authorRow} onPress={() => router.push(`/u/${username}`)}>
                <Avatar username={username} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>@{username}</Text>
                  <Text style={styles.date}>
                    {new Date(item.started_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                {item.driving_score != null && <ScoreDisplay score={item.driving_score} size="pill" />}
              </Pressable>

              <Pressable onPress={() => router.push(`/trip/${item.id}`)}>
                <StatRow
                  boxed={false}
                  items={[
                    { label: 'Distancia', value: formatDistance(item.distance_meters ?? 0, units) },
                    { label: 'Duración', value: formatDuration(item.duration_seconds ?? 0) },
                    { label: 'Vel. máxima', value: formatSpeed(item.max_speed_kmh ?? 0, units) },
                  ]}
                />
              </Pressable>

              {badges.length > 0 && (
                <View style={styles.badgesRow}>
                  {badges.map((b) => (
                    <AchievementBadge key={b.kind} kind={b.kind} label={b.label} />
                  ))}
                </View>
              )}

              <Divider />

              <View style={styles.actionsRow}>
                <ScaledPressable style={styles.actionButton} onPress={() => onToggleLike(item.id, liked)}>
                  <Ionicons
                    name={liked ? 'heart' : 'heart-outline'}
                    size={17}
                    color={liked ? colors.danger : colors.textMuted}
                  />
                  <Text style={[styles.actionCount, liked && styles.actionIconActive]}>
                    {item.trip_likes?.[0]?.count ?? 0}
                  </Text>
                </ScaledPressable>
                <Pressable style={styles.actionButton} onPress={() => router.push(`/trip/${item.id}`)}>
                  <Ionicons name="chatbubble-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.actionCount}>{item.trip_comments?.[0]?.count ?? 0}</Text>
                </Pressable>
              </View>
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
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  header: { ...type.title, color: colors.text },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { ...type.subheading, color: colors.text },
  date: { ...type.caption, color: colors.textFaint, marginTop: 1 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actionsRow: { flexDirection: 'row', gap: spacing.xl },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIconActive: { color: colors.danger },
  actionCount: { color: colors.textMuted, ...type.caption },
});
