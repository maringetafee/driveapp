import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, radius, spacing, type } from '../src/theme/colors';
import Avatar from '../src/components/ui/Avatar';
import EmptyState from '../src/components/ui/EmptyState';

interface ResultProfile {
  id: string;
  username: string;
  city: string | null;
  country: string | null;
}

export default function SearchScreen() {
  const session = useAuthStore((s) => s.session);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
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
        .select('id, username, city, country')
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
          .select('followed_id')
          .eq('follower_id', session.user.id)
          .in('followed_id', found.map((p) => p.id));
        setFollowingIds(new Set((myFollows ?? []).map((f) => f.followed_id)));
      } else {
        setFollowingIds(new Set());
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, session]);

  const onToggleFollow = async (targetId: string) => {
    if (!session) return;
    setBusyIds((prev) => new Set(prev).add(targetId));
    const isFollowing = followingIds.has(targetId);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('followed_id', targetId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, followed_id: targetId });
      setFollowingIds((prev) => new Set(prev).add(targetId));
    }
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          placeholder="Buscar por nombre de usuario…"
          placeholderTextColor={colors.textFaint}
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
          !loading && searched ? (
            <EmptyState emoji="🔍" title="Sin resultados" subtitle="Prueba con otro nombre de usuario." />
          ) : !query.trim() ? (
            <EmptyState emoji="👋" title="Encuentra a otros conductores" subtitle="Busca por su nombre de usuario para seguirlos." />
          ) : null
        }
        renderItem={({ item }) => {
          const following = followingIds.has(item.id);
          const busy = busyIds.has(item.id);
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/u/${item.username}`)}>
              <Avatar username={item.username} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>@{item.username}</Text>
                {(item.city || item.country) && (
                  <Text style={styles.location}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
                )}
              </View>
              <Pressable
                style={[styles.followButton, following && styles.followButtonActive]}
                onPress={() => onToggleFollow(item.id)}
                disabled={busy}
              >
                <Text style={[styles.followButtonText, following && styles.followButtonTextActive]}>
                  {following ? '✓ Siguiendo' : 'Seguir'}
                </Text>
              </Pressable>
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
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  username: { ...type.body, color: colors.text, fontWeight: '700' },
  location: { ...type.caption, color: colors.textMuted, marginTop: 1 },
  followButton: {
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
  },
  followButtonActive: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.accent },
  followButtonText: { color: '#04140D', fontWeight: '800', fontSize: 12 },
  followButtonTextActive: { color: colors.accent },
});
