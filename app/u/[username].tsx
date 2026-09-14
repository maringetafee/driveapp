import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import { fetchAggregateTripStats, type AggregateTripStats } from '../../src/utils/aggregateTripStats';
import BadgesRow from '../../src/components/BadgesRow';
import BestMarks from '../../src/components/BestMarks';
import Avatar from '../../src/components/ui/Avatar';
import StatRow from '../../src/components/ui/StatRow';
import SectionHeader from '../../src/components/ui/SectionHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import type { Profile, Vehicle } from '../../src/types/database';

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const myUsername = useAuthStore((s) => s.profile?.username);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<AggregateTripStats | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        setLoading(true);
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', username)
          .single();

        if (cancelled || !profileData) {
          setLoading(false);
          return;
        }
        setProfile(profileData);

        const [{ data: vehicleData }, aggregateStats, followers, following] = await Promise.all([
          supabase.from('vehicles').select('*').eq('user_id', profileData.id),
          fetchAggregateTripStats(profileData.id),
          supabase
            .from('follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('followed_id', profileData.id),
          supabase
            .from('follows')
            .select('followed_id', { count: 'exact', head: true })
            .eq('follower_id', profileData.id),
        ]);

        if (cancelled) return;

        setVehicles(vehicleData ?? []);
        setFollowersCount(followers.count ?? 0);
        setFollowingCount(following.count ?? 0);
        setStats(aggregateStats);

        if (myUserId && myUserId !== profileData.id) {
          const { data: followRow } = await supabase
            .from('follows')
            .select('status')
            .eq('follower_id', myUserId)
            .eq('followed_id', profileData.id)
            .maybeSingle();
          setIsFollowing(followRow?.status === 'accepted');
          setIsPending(followRow?.status === 'pending');
        }

        setLoading(false);
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [username, myUserId])
  );

  const onToggleFollow = async () => {
    if (!myUserId || !profile) return;
    setFollowBusy(true);
    if (isFollowing || isPending) {
      await supabase.from('follows').delete().eq('follower_id', myUserId).eq('followed_id', profile.id);
      if (isFollowing) setFollowersCount((c) => Math.max(0, c - 1));
      setIsFollowing(false);
      setIsPending(false);
    } else if (profile.is_private) {
      await supabase.from('follows').insert({ follower_id: myUserId, followed_id: profile.id, status: 'pending' });
      setIsPending(true);
    } else {
      await supabase.from('follows').insert({ follower_id: myUserId, followed_id: profile.id, status: 'accepted' });
      setIsFollowing(true);
      setFollowersCount((c) => c + 1);
    }
    setFollowBusy(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <EmptyState emoji="🔍" title={`No se encontró a @${username}`} />
        </View>
      </SafeAreaView>
    );
  }

  const isOwnProfile = myUsername === profile.username;
  const contentLocked = profile.is_private && !isOwnProfile && !isFollowing;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={vehicles}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.identityRow}>
              <Avatar username={profile.username} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>@{profile.username}</Text>
                {(profile.city || profile.country) && (
                  <Text style={styles.location}>
                    {[profile.city, profile.country].filter(Boolean).join(', ')}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.followRow}>
              <Text style={styles.followCount}>
                <Text style={styles.followNumber}>{followersCount}</Text> seguidores
              </Text>
              <Text style={styles.followCount}>
                <Text style={styles.followNumber}>{followingCount}</Text> siguiendo
              </Text>
            </View>

            {!isOwnProfile && myUserId && (
              <Pressable
                style={({ pressed }) => [
                  styles.followButton,
                  (isFollowing || isPending) && styles.followButtonActive,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={onToggleFollow}
                disabled={followBusy}
              >
                <Text style={[styles.followButtonText, (isFollowing || isPending) && styles.followButtonTextActive]}>
                  {isFollowing ? '✓ Siguiendo' : isPending ? 'Solicitado' : 'Seguir'}
                </Text>
              </Pressable>
            )}

            {contentLocked && (
              <EmptyState emoji="🔒" title="Cuenta privada" subtitle="Sigue a este conductor para ver sus trayectos y estadísticas." />
            )}

            {!contentLocked && stats && (
              <StatRow
                items={[
                  { label: 'Trayectos', value: String(stats.tripCount) },
                  { label: 'Distancia total', value: formatDistance(stats.totalDistanceMeters, profile.units) },
                  { label: 'Score medio', value: stats.avgDrivingScore != null ? String(stats.avgDrivingScore) : '—' },
                ]}
              />
            )}

            {!contentLocked && stats && <BestMarks stats={stats} units={profile.units} />}

            {!contentLocked && <BadgesRow userId={profile.id} stats={stats} />}

            {!contentLocked && <SectionHeader title="Garaje" />}
          </View>
        }
        ListEmptyComponent={!contentLocked ? <Text style={styles.empty}>Sin coches todavía.</Text> : null}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.vehicleName}>
              {item.make} {item.model}
              {item.year ? ` · ${item.year}` : ''}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: spacing.lg, gap: spacing.md },
  header: { marginBottom: spacing.sm, gap: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  username: { ...type.title, color: colors.text },
  location: { ...type.caption, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  followRow: { flexDirection: 'row', gap: spacing.lg },
  followCount: { color: colors.textMuted, fontSize: 13 },
  followNumber: { color: colors.text, fontWeight: '700' },
  followButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent,
  },
  followButtonActive: { backgroundColor: colors.surfaceAlt, borderWidth: 1.5, borderColor: colors.accent },
  followButtonText: { color: '#04140D', fontWeight: '800' },
  followButtonTextActive: { color: colors.accent },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  vehicleName: { ...type.body, color: colors.text, fontWeight: '700' },
});
