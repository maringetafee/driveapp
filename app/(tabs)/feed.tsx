import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';

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
          return (
            <View style={styles.card}>
              <Pressable onPress={() => router.push(`/u/${item.profiles?.username}`)}>
                <Text style={styles.author}>@{item.profiles?.username ?? '—'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/trip/${item.id}`)}>
                <View style={styles.statsRow}>
                  <Text style={styles.stat}>{formatDistance(item.distance_meters ?? 0, units)}</Text>
                  {item.driving_score != null && (
                    <Text style={styles.stat}>Score {item.driving_score}</Text>
                  )}
                  <Text style={styles.date}>
                    {new Date(item.started_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.actionsRow}>
                <Pressable style={styles.actionButton} onPress={() => onToggleLike(item.id, liked)}>
                  <Text style={[styles.actionIcon, liked && styles.actionIconActive]}>{liked ? '♥' : '♡'}</Text>
                  <Text style={styles.actionCount}>{item.trip_likes?.[0]?.count ?? 0}</Text>
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
  list: { padding: 16, gap: 10 },
  header: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  author: { color: colors.accent, fontWeight: '700', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  stat: { color: colors.text, fontWeight: '600', fontSize: 14 },
  date: { color: colors.textMuted, fontSize: 12, marginLeft: 'auto' },
  actionsRow: { flexDirection: 'row', gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIcon: { color: colors.textMuted, fontSize: 16 },
  actionIconActive: { color: colors.danger },
  actionCount: { color: colors.textMuted, fontSize: 13 },
});
