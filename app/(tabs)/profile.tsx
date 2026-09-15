import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import { fetchAggregateTripStats, type AggregateTripStats } from '../../src/utils/aggregateTripStats';
import type { Vehicle } from '../../src/types/database';
import BadgesRow from '../../src/components/BadgesRow';
import BestMarks from '../../src/components/BestMarks';
import ScoreTrendChart from '../../src/components/ScoreTrendChart';
import Avatar from '../../src/components/ui/Avatar';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import StatRow from '../../src/components/ui/StatRow';
import SectionHeader from '../../src/components/ui/SectionHeader';

export default function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const units = profile?.units ?? 'kmh';
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<AggregateTripStats | null>(null);
  const [scoreTrend, setScoreTrend] = useState<number[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  const loadVehicles = useCallback(() => {
    if (!session) return;
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setVehicles(data ?? []));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      fetchAggregateTripStats(session.user.id).then((s) => {
        if (!cancelled) setStats(s);
      });

      supabase
        .from('trips')
        .select('driving_score')
        .eq('user_id', session.user.id)
        .not('driving_score', 'is', null)
        .order('started_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (!cancelled) setScoreTrend((data ?? []).map((t) => t.driving_score as number).reverse());
        });

      Promise.all([
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('followed_id', session.user.id),
        supabase.from('follows').select('followed_id', { count: 'exact', head: true }).eq('follower_id', session.user.id),
      ]).then(([followers, following]) => {
        if (cancelled) return;
        setFollowersCount(followers.count ?? 0);
        setFollowingCount(following.count ?? 0);
      });

      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const onAddVehicle = async () => {
    if (!session || !newMake.trim() || !newModel.trim()) return;
    setSavingVehicle(true);
    await supabase.from('vehicles').insert({
      user_id: session.user.id,
      make: newMake.trim(),
      model: newModel.trim(),
      is_default: vehicles.length === 0,
    });
    setSavingVehicle(false);
    setNewMake('');
    setNewModel('');
    setAddingVehicle(false);
    loadVehicles();
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={vehicles}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <Avatar username={profile?.username ?? '?'} size={64} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username} numberOfLines={1}>
                  {profile?.username ?? '—'}
                </Text>
                {(profile?.city || profile?.country) && (
                  <Text style={styles.location}>{[profile?.city, profile?.country].filter(Boolean).join(', ')}</Text>
                )}
                {profile?.username && (
                  <Pressable onPress={() => router.push(`/u/${profile.username}`)} hitSlop={6}>
                    <Text style={styles.viewPublicLink}>Ver perfil público ›</Text>
                  </Pressable>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [styles.settingsButton, pressed && styles.cardPressed]}
                onPress={() => router.push('/settings')}
                accessibilityLabel="Ajustes"
                hitSlop={6}
              >
                <Text style={styles.settingsIcon}>⚙️</Text>
              </Pressable>
            </View>

            <View style={styles.followRow}>
              <Text style={styles.followCount}>
                <Text style={styles.followNumber}>{followersCount}</Text> {followersCount === 1 ? 'seguidor' : 'seguidores'}
              </Text>
              <Text style={styles.followCount}>
                <Text style={styles.followNumber}>{followingCount}</Text> siguiendo
              </Text>
              {stats && stats.streak >= 2 && (
                <Text style={styles.followCount}>
                  🔥 <Text style={styles.followNumber}>{stats.streak}</Text> días seguidos
                </Text>
              )}
            </View>

            {stats && (
              <StatRow
                items={[
                  { label: 'Trayectos', value: String(stats.tripCount) },
                  { label: 'Km totales', value: formatDistance(stats.totalDistanceMeters, units) },
                  { label: 'Score medio', value: stats.avgDrivingScore != null ? String(stats.avgDrivingScore) : '—' },
                ]}
              />
            )}

            {stats && <BestMarks stats={stats} units={units} />}

            <ScoreTrendChart scores={scoreTrend} />

            {session && <BadgesRow userId={session.user.id} stats={stats} />}

            <SectionHeader
              title="Garaje"
              action={{ label: addingVehicle ? 'Cancelar' : '+ Añadir coche', onPress: () => setAddingVehicle((v) => !v) }}
            />

            {addingVehicle && (
              <View style={styles.addVehicleForm}>
                <TextInput
                  style={styles.input}
                  placeholder="Marca"
                  placeholderTextColor={colors.textFaint}
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Modelo"
                  placeholderTextColor={colors.textFaint}
                  value={newModel}
                  onChangeText={setNewModel}
                />
                <PrimaryButton
                  title="Guardar coche"
                  onPress={onAddVehicle}
                  loading={savingVehicle}
                  disabled={!newMake.trim() || !newModel.trim()}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Aún no has añadido coches.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, item.is_default && styles.cardDefault, pressed && styles.cardPressed]}
            onPress={() => router.push(`/vehicle/${item.id}`)}
          >
            <View style={[styles.vehicleDot, item.is_default && styles.vehicleDotActive]} />
            <Text style={styles.vehicleName}>
              {item.make} {item.model}
              {item.year ? ` · ${item.year}` : ''}
            </Text>
            {item.is_default ? <Text style={styles.defaultBadge}>Principal</Text> : <Text style={styles.chevron}>›</Text>}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  headerBlock: { marginBottom: spacing.sm, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  username: { ...type.title, color: colors.text },
  location: { ...type.caption, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  viewPublicLink: { color: colors.accentAlt, ...type.caption, fontWeight: '700', marginTop: 4 },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  settingsIcon: { fontSize: 18 },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followCount: { color: colors.textMuted, fontSize: 13 },
  followNumber: { color: colors.text, fontWeight: '700' },
  addVehicleForm: { gap: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardDefault: { borderColor: colors.accent },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  vehicleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  vehicleDotActive: { backgroundColor: colors.accent },
  vehicleName: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  defaultBadge: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  chevron: { color: colors.textFaint, fontSize: 22, fontWeight: '600' },
});
