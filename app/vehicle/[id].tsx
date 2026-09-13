import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import type { Vehicle } from '../../src/types/database';

interface VehicleStats {
  tripCount: number;
  totalDistanceMeters: number;
  maxSpeedKmh: number;
  avgDrivingScore: number | null;
}

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stats, setStats] = useState<VehicleStats>({
    tripCount: 0,
    totalDistanceMeters: 0,
    maxSpeedKmh: 0,
    avgDrivingScore: null,
  });
  const [loading, setLoading] = useState(true);
  const [settingDefault, setSettingDefault] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      Promise.all([
        supabase.from('vehicles').select('*').eq('id', id).single(),
        supabase.from('trips').select('distance_meters, max_speed_kmh, driving_score').eq('vehicle_id', id),
      ]).then(([{ data: vehicleData }, { data: trips }]) => {
        if (cancelled) return;
        setVehicle(vehicleData);

        const rows = trips ?? [];
        const scored = rows.filter((t) => t.driving_score != null);
        setStats({
          tripCount: rows.length,
          totalDistanceMeters: rows.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
          maxSpeedKmh: rows.reduce((max, t) => Math.max(max, t.max_speed_kmh ?? 0), 0),
          avgDrivingScore: scored.length
            ? Math.round(scored.reduce((sum, t) => sum + (t.driving_score ?? 0), 0) / scored.length)
            : null,
        });
        setLoading(false);
      });

      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const isMine = vehicle?.user_id === session?.user.id;

  const onSetDefault = async () => {
    if (!vehicle || !session) return;
    setSettingDefault(true);
    await supabase.from('vehicles').update({ is_default: false }).eq('user_id', session.user.id);
    await supabase.from('vehicles').update({ is_default: true }).eq('id', vehicle.id);
    setVehicle({ ...vehicle, is_default: true });
    setSettingDefault(false);
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

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>No se encontró el vehículo.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {vehicle.image_url ? (
          <Image source={{ uri: vehicle.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Sin foto</Text>
          </View>
        )}

        <Text style={styles.title}>
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` · ${vehicle.year}` : ''}
        </Text>
        {vehicle.is_default && <Text style={styles.defaultBadge}>Vehículo principal</Text>}

        <View style={styles.grid}>
          <Stat label="Trayectos" value={String(stats.tripCount)} />
          <Stat label="Distancia total" value={formatDistance(stats.totalDistanceMeters, units)} />
          <Stat label="Vel. máxima" value={formatSpeed(stats.maxSpeedKmh, units)} />
          <Stat label="Score medio" value={stats.avgDrivingScore != null ? String(stats.avgDrivingScore) : '—'} />
        </View>

        {isMine && (
          <View style={styles.actions}>
            {!vehicle.is_default && (
              <Pressable style={styles.secondaryButton} onPress={onSetDefault} disabled={settingDefault}>
                <Text style={styles.secondaryButtonText}>
                  {settingDefault ? 'Guardando…' : 'Hacer vehículo principal'}
                </Text>
              </Pressable>
            )}
            <Pressable style={styles.primaryButton} onPress={() => router.push(`/mod-car/${vehicle.id}`)}>
              <Text style={styles.primaryButtonText}>Mod Car (IA)</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, gap: 16 },
  image: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.surface },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  imagePlaceholderText: { color: colors.textMuted },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  defaultBadge: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: -12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  actions: { gap: 10, marginTop: 8 },
  primaryButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryButtonText: { color: colors.background, fontWeight: '700' },
  secondaryButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { color: colors.text, fontWeight: '700' },
});
