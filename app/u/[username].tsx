import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import BadgesRow from '../../src/components/BadgesRow';
import type { Profile, Vehicle } from '../../src/types/database';

interface AggregateStats {
  tripCount: number;
  totalDistanceMeters: number;
  avgDrivingScore: number | null;
}

export default function PublicProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const myUsername = useAuthStore((s) => s.profile?.username);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<AggregateStats>({ tripCount: 0, totalDistanceMeters: 0, avgDrivingScore: null });
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
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

        const [{ data: vehicleData }, { data: tripsData }, followers, following] = await Promise.all([
          supabase.from('vehicles').select('*').eq('user_id', profileData.id),
          supabase
            .from('trips')
            .select('distance_meters, driving_score')
            .eq('user_id', profileData.id),
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

        const trips = tripsData ?? [];
        const scored = trips.filter((t) => t.driving_score != null);
        setStats({
          tripCount: trips.length,
          totalDistanceMeters: trips.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
          avgDrivingScore: scored.length
            ? Math.round(scored.reduce((sum, t) => sum + (t.driving_score ?? 0), 0) / scored.length)
            : null,
        });

        if (myUserId && myUserId !== profileData.id) {
          const { data: followRow } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', myUserId)
            .eq('followed_id', profileData.id)
            .maybeSingle();
          setIsFollowing(!!followRow);
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
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', myUserId).eq('followed_id', profile.id);
      setIsFollowing(false);
      setFollowersCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('follows').insert({ follower_id: myUserId, followed_id: profile.id });
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
          <Text style={styles.title}>No se encontró a @{username}.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwnProfile = myUsername === profile.username;

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={vehicles}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.username}>@{profile.username}</Text>
            {(profile.city || profile.country) && (
              <Text style={styles.location}>
                {[profile.city, profile.country].filter(Boolean).join(', ')}
              </Text>
            )}

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
                style={[styles.followButton, isFollowing && styles.followButtonActive]}
                onPress={onToggleFollow}
                disabled={followBusy}
              >
                <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
                  {isFollowing ? 'Siguiendo' : 'Seguir'}
                </Text>
              </Pressable>
            )}

            <View style={styles.statsGrid}>
              <Stat value={String(stats.tripCount)} label="Trayectos" />
              <Stat value={formatDistance(stats.totalDistanceMeters, profile.units)} label="Distancia total" />
              <Stat value={stats.avgDrivingScore != null ? String(stats.avgDrivingScore) : '—'} label="Score medio" />
            </View>

            <BadgesRow userId={profile.id} />

            <Text style={styles.subtitle}>Garaje</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Sin coches todavía.</Text>}
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  list: { padding: 16, gap: 10 },
  header: { marginBottom: 16, gap: 12 },
  username: { color: colors.text, fontSize: 28, fontWeight: '800' },
  location: { color: colors.textMuted, fontSize: 13, marginTop: -8 },
  followRow: { flexDirection: 'row', gap: 16 },
  followCount: { color: colors.textMuted, fontSize: 13 },
  followNumber: { color: colors.text, fontWeight: '700' },
  followButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: colors.accent,
  },
  followButtonActive: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  followButtonText: { color: colors.background, fontWeight: '700' },
  followButtonTextActive: { color: colors.text },
  statsGrid: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  vehicleName: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
