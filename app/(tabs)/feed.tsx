import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import Avatar from '../../src/components/ui/Avatar';

function scoreTone(score: number | null) {
  if (score == null) return colors.textMuted;
  if (score >= 85) return colors.accent;
  if (score >= 60) return colors.gold;
  return colors.danger;
}

interface FeedItem {
  id: string;
  started_at: string;
  distance_meters: number | null;
  driving_score: number | null;
  user_id: string;
  profiles: { username: string } | null;
  trip_likes: { count: number }[];
  trip_comments: { count: number }[];
}

export default function FeedScreen() {
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      async function load() {
        setLoading(true);
        const { data: follows } = await supabase
          .from('follows')
          .select('followed_id')
          .eq('follower_id', session!.user.id);

        const authorIds = [...(follows ?? []).map((f) => f.followed_id), session!.user.id];

        const { data: trips } = await supabase
          .from('trips')
          .select(
            'id, started_at, distance_meters, driving_score, user_id, profiles!trips_user_id_fkey(username), trip_likes(count), trip_comments(count)'
          )
          .in('user_id', authorIds)
          .eq('is_public', true)
          .order('started_at', { ascending: false })
          .limit(30);

        if (cancelled) return;

        const feedItems = (trips as unknown as FeedItem[]) ?? [];
        setItems(feedItems);

        if (feedItems.length) {
          const { data: myLikes } = await supabase
            .from('trip_likes')
            .select('trip_id')
            .eq('user_id', session!.user.id)
            .in('trip_id', feedItems.map((t) => t.id));
          if (!cancelled) setLikedIds(new Set((myLikes ?? []).map((l) => l.trip_id)));
        }

        setLoading(false);
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [session])
  );

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
        ListHeaderComponent={<Text style={styles.header}>Feed</Text>}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              Sigue a otros conductores para ver aquí sus trayectos, o completa el tuyo.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const liked = likedIds.has(item.id);
          const username = item.profiles?.username ?? '—';
          return (
            <View style={styles.card}>
              <Pressable style={styles.authorRow} onPress={() => router.push(`/u/${username}`)}>
                <Avatar username={username} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>@{username}</Text>
                  <Text style={styles.date}>
                    {new Date(item.started_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
                {item.driving_score != null && (
                  <View style={[styles.scorePill, { borderColor: scoreTone(item.driving_score) }]}>
                    <Text style={[styles.scoreText, { color: scoreTone(item.driving_score) }]}>
                      {item.driving_score}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={() => router.push(`/trip/${item.id}`)}>
                <View style={styles.statsRow}>
                  <Text style={styles.stat}>{formatDistance(item.distance_meters ?? 0, units)}</Text>
                </View>
              </Pressable>
              <View style={styles.divider} />
              <View style={styles.actionsRow}>
                <Pressable style={styles.actionButton} onPress={() => onToggleLike(item.id, liked)}>
                  <Text style={[styles.actionIcon, liked && styles.actionIconActive]}>{liked ? '♥' : '♡'}</Text>
                  <Text style={[styles.actionCount, liked && styles.actionIconActive]}>
                    {item.trip_likes?.[0]?.count ?? 0}
                  </Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => router.push(`/trip/${item.id}`)}>
                  <Text style={styles.actionIcon}>💬</Text>
                  <Text style={styles.actionCount}>{item.trip_comments?.[0]?.count ?? 0}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { ...type.title, color: colors.text, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  author: { ...type.subheading, color: colors.text },
  statsRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  stat: { ...type.body, color: colors.textMuted },
  date: { ...type.caption, color: colors.textFaint, marginTop: 1 },
  scorePill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  scoreText: { fontSize: 12, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
  actionsRow: { flexDirection: 'row', gap: spacing.xl },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { color: colors.textMuted, fontSize: 17 },
  actionIconActive: { color: colors.danger },
  actionCount: { color: colors.textMuted, ...type.caption },
});
