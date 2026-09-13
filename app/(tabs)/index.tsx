import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTripStore } from '../../src/state/tripStore';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, shadow, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed, toLineString } from '../../src/utils/geo';
import TripRouteMap from '../../src/components/TripRouteMap';

export default function DriveScreen() {
  const { status, points, currentSpeedKmh, maxSpeedKmh, distanceMeters, error, start, stop } =
    useTripStore();
  const route = useMemo(() => (points.length > 1 ? toLineString(points) : null), [points]);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const session = useAuthStore((s) => s.session);
  const [saving, setSaving] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

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

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {isTracking && route && (
          <View style={styles.mapWrap}>
            <TripRouteMap route={route} height={190} />
          </View>
        )}

        <View style={styles.dial}>
          <Text style={styles.speedLabel}>VELOCIDAD ACTUAL</Text>
          <Text style={styles.speed}>{formatSpeed(currentSpeedKmh, units)}</Text>
          {isTracking && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>EN TRAYECTO</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDistance(distanceMeters, units)}</Text>
            <Text style={styles.statLabel}>Distancia</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatSpeed(maxSpeedKmh, units)}</Text>
            <Text style={styles.statLabel}>Máxima</Text>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Animated.View style={{ transform: [{ scale }] }}>
          <Pressable
            onPress={onToggle}
            onPressIn={pressIn}
            onPressOut={pressOut}
            disabled={status === 'requesting' || saving}
            style={[styles.button, isTracking && styles.buttonStop]}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Guardando…' : isTracking ? 'Terminar trayecto' : 'Iniciar trayecto'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.lg },
  mapWrap: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  dial: { alignItems: 'center', marginTop: spacing.sm },
  speedLabel: { ...type.label, color: colors.textFaint },
  speed: { color: colors.text, fontSize: 84, fontWeight: '800', letterSpacing: -3, marginTop: 4 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger },
  liveText: { ...type.label, color: colors.danger },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    width: '100%',
  },
  statCard: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: colors.border },
  statValue: { ...type.heading, color: colors.text },
  statLabel: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 20,
    paddingHorizontal: 56,
    marginTop: spacing.sm,
    ...shadow.glow,
  },
  buttonStop: { backgroundColor: colors.danger, shadowColor: colors.danger },
  buttonText: { color: '#04140D', fontWeight: '800', fontSize: 17, letterSpacing: 0.2 },
});
