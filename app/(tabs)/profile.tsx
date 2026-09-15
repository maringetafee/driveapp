import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import { fetchAggregateTripStats, type AggregateTripStats } from '../../src/utils/aggregateTripStats';
import type { Vehicle } from '../../src/types/database';
import { disableAutoTracking, enableAutoTracking, isAutoTrackingEnabled } from '../../src/background/autoTripTask';
import BadgesRow from '../../src/components/BadgesRow';
import BestMarks from '../../src/components/BestMarks';
import ScoreTrendChart from '../../src/components/ScoreTrendChart';
import Avatar from '../../src/components/ui/Avatar';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import StatRow from '../../src/components/ui/StatRow';
import SectionHeader from '../../src/components/ui/SectionHeader';

export default function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const units = profile?.units ?? 'kmh';
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stats, setStats] = useState<AggregateTripStats | null>(null);
  const [scoreTrend, setScoreTrend] = useState<number[]>([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [autoTracking, setAutoTracking] = useState(false);
  const [autoTrackingError, setAutoTrackingError] = useState<string | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  useEffect(() => {
    isAutoTrackingEnabled().then(setAutoTracking);
  }, []);

  const onToggleAutoTracking = async (value: boolean) => {
    setAutoTrackingError(null);
    if (value) {
      const result = await enableAutoTracking();
      if (!result.ok) {
        setAutoTrackingError(result.error ?? 'No se pudo activar.');
        return;
      }
      setAutoTracking(true);
    } else {
      await disableAutoTracking();
      setAutoTracking(false);
    }
  };

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

  const onTogglePrivacy = async (value: boolean) => {
    if (!session) return;
    setPrivacyBusy(true);
    await supabase.from('profiles').update({ is_private: value }).eq('id', session.user.id);
    await refreshProfile();
    setPrivacyBusy(false);
  };

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
                <Text style={styles.username}>{profile?.username ?? '—'}</Text>
                {(profile?.city || profile?.country) && (
                  <Text style={styles.location}>{[profile?.city, profile?.country].filter(Boolean).join(', ')}</Text>
                )}
                {profile?.username && (
                  <Pressable style={styles.viewPublicLink} onPress={() => router.push(`/u/${profile.username}`)}>
                    <Text style={styles.viewPublicLinkText}>Ver perfil público</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.accentAlt} />
                  </Pressable>
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

            <View style={styles.autoTrackRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoTrackTitle}>Detección automática</Text>
                <Text style={styles.autoTrackSubtitle}>
                  Registra trayectos en segundo plano sin pulsar iniciar/terminar.
                </Text>
              </View>
              <Switch
                value={autoTracking}
                onValueChange={onToggleAutoTracking}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            {autoTrackingError && <Text style={styles.error}>{autoTrackingError}</Text>}

            <View style={styles.autoTrackRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoTrackTitle}>Cuenta privada</Text>
                <Text style={styles.autoTrackSubtitle}>
                  Solo tus seguidores aceptados verán tus trayectos, coches y estadísticas.
                </Text>
              </View>
              <Switch
                value={profile?.is_private ?? false}
                onValueChange={onTogglePrivacy}
                disabled={privacyBusy}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>

            {session && <BadgesRow userId={session.user.id} stats={stats} />}

            <View style={styles.garageHeaderRow}>
              <SectionHeader
                title="Garaje"
                action={{ label: addingVehicle ? 'Cancelar' : '+ Añadir coche', onPress: () => setAddingVehicle((v) => !v) }}
              />
            </View>

            {addingVehicle && (
              <View style={styles.addVehicleForm}>
                <Input placeholder="Marca" value={newMake} onChangeText={setNewMake} />
                <Input placeholder="Modelo" value={newModel} onChangeText={setNewModel} />
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
            {item.is_default && <Text style={styles.defaultBadge}>Principal</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          <PrimaryButton title="Cerrar sesión" onPress={() => signOut()} variant="ghost" style={{ marginTop: spacing.xl }} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  headerBlock: { marginBottom: spacing.sm, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  username: { ...type.title, color: colors.text },
  location: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  viewPublicLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  viewPublicLinkText: { ...type.caption, color: colors.accentAlt },
  followRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  followCount: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  followNumber: { fontFamily: fonts.numeralBold, color: colors.text },
  garageHeaderRow: {},
  addVehicleForm: { gap: spacing.sm },
  autoTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  autoTrackTitle: { ...type.subheading, color: colors.text },
  autoTrackSubtitle: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  error: { ...type.caption, color: colors.danger },
  empty: { ...type.body, color: colors.textMuted, textAlign: 'center', marginTop: 20 },
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
  vehicleName: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text, flex: 1 },
  defaultBadge: { ...type.label, color: colors.accent },
});
