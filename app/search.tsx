import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, spacing, type } from '../src/theme/colors';
import Avatar from '../src/components/ui/Avatar';
import EmptyState from '../src/components/ui/EmptyState';
import FollowButton, { type FollowState } from '../src/components/ui/FollowButton';
import Input from '../src/components/ui/Input';
import { SkeletonList } from '../src/components/ui/Skeleton';

interface ResultProfile {
  id: string;
  username: string;
  city: string | null;
  country: string | null;
  is_private: boolean;
}

export default function SearchScreen() {
  const session = useAuthStore((s) => s.session);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed || !session) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, city, country, is_private')
        .ilike('username', `%${trimmed}%`)
        .neq('id', session.user.id)
        .limit(20);

      const found = profiles ?? [];
      setResults(found);
      setSearched(true);
      setLoading(false);

      if (found.length) {
        const { data: myFollows } = await supabase
          .from('follows')
          .select('followed_id, status')
          .eq('follower_id', session.user.id)
          .in('followed_id', found.map((p) => p.id));
        setFollowingIds(new Set((myFollows ?? []).filter((f) => f.status === 'accepted').map((f) => f.followed_id)));
        setPendingIds(new Set((myFollows ?? []).filter((f) => f.status === 'pending').map((f) => f.followed_id)));
      } else {
        setFollowingIds(new Set());
        setPendingIds(new Set());
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, session]);

  const onToggleFollow = async (target: ResultProfile) => {
    if (!session) return;
    setBusyIds((prev) => new Set(prev).add(target.id));
    const isFollowing = followingIds.has(target.id);
    const isPending = pendingIds.has(target.id);

    if (isFollowing || isPending) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('followed_id', target.id);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    } else if (target.is_private) {
      await supabase.from('follows').insert({ follower_id: session.user.id, followed_id: target.id, status: 'pending' });
      setPendingIds((prev) => new Set(prev).add(target.id));
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, followed_id: target.id, status: 'accepted' });
      setFollowingIds((prev) => new Set(prev).add(target.id));
    }
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.searchBar}>
        <Input
          variant="pill"
          icon="search"
          placeholder="Buscar por nombre de usuario…"
          autoCapitalize="none"
          autoFocus
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={results}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : searched ? (
            <EmptyState emoji="🔍" title="Sin resultados" subtitle="Prueba con otro nombre de usuario." />
          ) : !query.trim() ? (
            <EmptyState emoji="👋" title="Encuentra a otros conductores" subtitle="Busca por su nombre de usuario para seguirlos." />
          ) : null
        }
        renderItem={({ item }) => {
          const following = followingIds.has(item.id);
          const pending = pendingIds.has(item.id);
          const busy = busyIds.has(item.id);
          const followState: FollowState = following ? 'following' : pending ? 'pending' : 'none';
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/u/${item.username}`)}>
              <Avatar username={item.username} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>
                  @{item.username} {item.is_private && '🔒'}
                </Text>
                {(item.city || item.country) && (
                  <Text style={styles.location}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
                )}
              </View>
              <FollowButton state={followState} onPress={() => onToggleFollow(item)} disabled={busy} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: { padding: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  username: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text },
  location: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
