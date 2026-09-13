import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTripStore } from '../../src/state/tripStore';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed, toLineString } from '../../src/utils/geo';
import TripRouteMap from '../../src/components/TripRouteMap';

export default function DriveScreen() {
  const { status, points, currentSpeedKmh, maxSpeedKmh, distanceMeters, error, start, stop } =
    useTripStore();
  const route = useMemo(() => (points.length > 1 ? toLineString(points) : null), [points]);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const session = useAuthStore((s) => s.session);
  const [saving, setSaving] = useState(false);

  const isTracking = status === 'tracking';

  const onToggle = async () => {
    if (isTracking) {
      const summary = stop();
      if (!summary || !session) return;

      setSaving(true);

      const { data: defaultVehicle } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('is_default', true)
        .maybeSingle();

      const { data, error: insertError } = await supabase
        .from('trips')
        .insert({
          user_id: session.user.id,
          vehicle_id: defaultVehicle?.id ?? null,
          started_at: new Date(summary.startedAt).toISOString(),
          ended_at: new Date(summary.endedAt).toISOString(),
          duration_seconds: summary.durationSeconds,
          distance_meters: summary.distanceMeters,
          avg_speed_kmh: summary.avgSpeedKmh,
          max_speed_kmh: summary.maxSpeedKmh,
          driving_score: summary.drivingScore,
          route_geojson: summary.route,
        })
        .select('id')
        .single();

      if (!insertError && data) {
        await supabase.from('trip_metrics').insert({
          trip_id: data.id,
          hard_accelerations: summary.hardAccelerations,
          hard_brakes: summary.hardBrakes,
          sharp_turns: summary.sharpTurns,
          g_force_series: summary.gForceSeries,
        });
      }

      setSaving(false);

      if (!insertError && data) {
        router.push(`/trip/${data.id}`);
      }
    } else {
      await start();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {isTracking && route && (
          <View style={{ width: '100%' }}>
            <TripRouteMap route={route} height={180} />
          </View>
        )}

        <Text style={styles.speedLabel}>Velocidad actual</Text>
        <Text style={styles.speed}>{formatSpeed(currentSpeedKmh, units)}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDistance(distanceMeters, units)}</Text>
            <Text style={styles.statLabel}>Distancia</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatSpeed(maxSpeedKmh, units)}</Text>
            <Text style={styles.statLabel}>Máxima</Text>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            isTracking && styles.buttonStop,
            pressed && styles.buttonPressed,
          ]}
          onPress={onToggle}
          disabled={status === 'requesting' || saving}
        >
          <Text style={styles.buttonText}>
            {saving ? 'Guardando…' : isTracking ? 'Terminar trayecto' : 'Iniciar trayecto'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 20 },
  speedLabel: { color: colors.textMuted, fontSize: 14 },
  speed: { color: colors.text, fontSize: 72, fontWeight: '800', letterSpacing: -2 },
  statsRow: { flexDirection: 'row', gap: 32, marginTop: 8 },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 18,
    paddingHorizontal: 48,
    marginTop: 24,
  },
  buttonStop: { backgroundColor: colors.danger },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.background, fontWeight: '700', fontSize: 17 },
});
