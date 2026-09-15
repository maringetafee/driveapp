import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTripStore } from '../../src/state/tripStore';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, shadow, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed, toLineString } from '../../src/utils/geo';
import { computeStreak, timeGreeting } from '../../src/utils/homeInsights';
import { scoreTone } from '../../src/utils/scoreTone';
import { fetchTopFriendThisWeek, fetchWeeklyRecap, type FriendComparison, type WeeklyRecap } from '../../src/utils/weeklyRecap';
import TripRouteMap from '../../src/components/TripRouteMap';
import FriendCompareCard from '../../src/components/FriendCompareCard';
import WeeklyRecapCard from '../../src/components/WeeklyRecapCard';
import StatRow from '../../src/components/ui/StatRow';
import Divider from '../../src/components/ui/Divider';
import SectionHeader from '../../src/components/ui/SectionHeader';

interface LastTrip {
  id: string;
  started_at: string;
  distance_meters: number | null;
  driving_score: number | null;
}

export default function DriveScreen() {
  const { status, points, currentSpeedKmh, maxSpeedKmh, distanceMeters, error, start, stop } =
    useTripStore();
  const route = useMemo(() => (points.length > 1 ? toLineString(points) : null), [points]);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const username = useAuthStore((s) => s.profile?.username);
  const session = useAuthStore((s) => s.session);
  const [saving, setSaving] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [lastTrip, setLastTrip] = useState<LastTrip | null>(null);
  const [streak, setStreak] = useState(0);
  const [recap, setRecap] = useState<WeeklyRecap | null>(null);
  const [topFriend, setTopFriend] = useState<FriendComparison | null>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const isTracking = status === 'tracking';

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('trips')
        .select('id, started_at, distance_meters, driving_score')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .limit(30)
        .then(({ data }) => {
          const rows = data ?? [];
          setLastTrip(rows[0] ?? null);
          setStreak(computeStreak(rows.map((r) => r.started_at)));
        });
      fetchWeeklyRecap(session.user.id).then(setRecap);
      fetchTopFriendThisWeek(session.user.id).then(setTopFriend);
    }, [session])
  );

  useEffect(() => {
    if (!isTracking || !useTripStore.getState().startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = useTripStore.getState().startedAt as number;
    setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTracking]);

  useEffect(() => {
    if (!isTracking) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isTracking, pulse]);

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
        router.push(`/trip/${data.id}?justFinished=1`);
      }
    } else {
      await start();
    }
  };

  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();

  const statItems = isTracking
    ? [
        { label: 'Distancia', value: formatDistance(distanceMeters, units) },
        { label: 'Duración', value: formatDuration(elapsedSeconds) },
      ]
    : [
        { label: 'Distancia', value: formatDistance(distanceMeters, units) },
        { label: 'Vel. máxima', value: formatSpeed(maxSpeedKmh, units) },
      ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {!isTracking && (
          <Text style={styles.greeting}>
            {timeGreeting()}{username ? `, ${username}` : ''}
          </Text>
        )}

        {isTracking && route && (
          <View style={styles.mapWrap}>
            <TripRouteMap route={route} height={170} />
          </View>
        )}

        <View style={styles.dial}>
          <Text style={styles.speedLabel}>VELOCIDAD ACTUAL</Text>
          <Text style={styles.speed}>{formatSpeed(currentSpeedKmh, units)}</Text>
          {isTracking && (
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, { opacity: pulse }]} />
              <Text style={styles.liveText}>EN TRAYECTO</Text>
            </View>
          )}
        </View>

        <StatRow items={statItems} style={styles.statRow} />

        {error && <Text style={styles.error}>{error}</Text>}

        <Animated.View style={{ transform: [{ scale }], width: '100%', alignItems: 'center' }}>
          <Pressable
            onPress={onToggle}
            onPressIn={pressIn}
            onPressOut={pressOut}
            disabled={status === 'requesting' || saving}
            style={[styles.button, isTracking && styles.buttonStop]}
          >
            <Text style={[styles.buttonText, isTracking && styles.buttonTextStop]}>
              {saving ? 'Guardando…' : isTracking ? 'Terminar trayecto' : 'Iniciar trayecto'}
            </Text>
          </Pressable>
        </Animated.View>

        {!isTracking && (lastTrip || streak >= 2) && (
          <>
            <Divider style={styles.fullDivider} />
            <View style={styles.insightsBlock}>
              {lastTrip && (
                <View>
                  <SectionHeader
                    title="Último trayecto"
                    action={{ label: 'Ver historial', onPress: () => router.push('/history') }}
                  />
                  <Pressable
                    style={({ pressed }) => [styles.lastTripCard, pressed && styles.lastTripCardPressed]}
                    onPress={() => router.push(`/trip/${lastTrip.id}`)}
                  >
                    <Text style={styles.lastTripDate}>
                      {new Date(lastTrip.started_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </Text>
                    <Text style={styles.lastTripDistance}>
                      {formatDistance(lastTrip.distance_meters ?? 0, units)}
                    </Text>
                    {lastTrip.driving_score != null && (
                      <View style={[styles.scorePill, { borderColor: scoreTone(lastTrip.driving_score) }]}>
                        <Text style={[styles.scoreText, { color: scoreTone(lastTrip.driving_score) }]}>
                          {lastTrip.driving_score}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              )}

              {streak >= 2 && (
                <View style={styles.streakCard}>
                  <View style={styles.streakIconWrap}>
                    <Text style={styles.streakEmoji}>🔥</Text>
                  </View>
                  <View>
                    <Text style={styles.streakNumber}>{streak} días</Text>
                    <Text style={styles.streakLabel}>seguidos conduciendo</Text>
                  </View>
                </View>
              )}

              {recap && <WeeklyRecapCard recap={recap} units={units} />}

              {topFriend && recap && (
                <FriendCompareCard friend={topFriend} myDistanceMeters={recap.distanceMeters} units={units} />
              )}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  greeting: { ...type.body, color: colors.textMuted, alignSelf: 'flex-start' },
  mapWrap: { width: '100%' },
  dial: { alignItems: 'center', marginTop: spacing.md },
  speedLabel: { ...type.label, color: colors.textFaint },
  speed: {
    color: colors.text,
    fontFamily: fonts.numeralBold,
    fontSize: 88,
    letterSpacing: -3,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
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
  statRow: { width: '100%' },
  error: { ...type.caption, color: colors.danger, textAlign: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 20,
    paddingHorizontal: 56,
    ...shadow.glow,
  },
  buttonStop: { backgroundColor: colors.danger, shadowColor: colors.danger },
  buttonText: { fontFamily: fonts.bodyExtraBold, color: colors.onAccent, fontSize: 17, letterSpacing: 0.2 },
  buttonTextStop: { color: colors.onDanger },
  fullDivider: { width: '100%' },
  insightsBlock: { width: '100%', gap: spacing.md },
  lastTripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  lastTripCardPressed: { backgroundColor: colors.surfaceAlt, borderColor: colors.borderStrong },
  lastTripDate: { ...type.caption, color: colors.textMuted, width: 56 },
  lastTripDistance: { ...type.body, fontFamily: fonts.numeralSemiBold, color: colors.text, flex: 1 },
  scorePill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  scoreText: { fontFamily: fonts.numeralBold, fontSize: 13 },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  streakIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakEmoji: { fontSize: 22 },
  streakNumber: { fontFamily: fonts.numeralBold, fontSize: 17, color: colors.text },
  streakLabel: { ...type.caption, color: colors.textMuted, marginTop: 1 },
});
