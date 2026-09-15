import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTripStore } from '../../src/state/tripStore';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, shadow, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed, toLineString } from '../../src/utils/geo';
import { computeStreak, timeGreeting } from '../../src/utils/homeInsights';
import { scoreTone } from '../../src/utils/scoreTone';
import { finishTrip } from '../../src/utils/finishTrip';
import { formatLaunchTime } from '../../src/utils/launchTimer';
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
  const {
    status,
    points,
    currentSpeedKmh,
    maxSpeedKmh,
    distanceMeters,
    zeroTo50Seconds,
    zeroTo100Seconds,
    error,
    start,
  } = useTripStore();
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
    if (!isTracking) {
      await start();
      return;
    }
    if (session) await finishTrip(session.user.id, { onSavingChange: setSaving });
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

        {isTracking && (zeroTo50Seconds != null || zeroTo100Seconds != null) && (
          <View style={styles.launchRow}>
            <View style={styles.launchPill}>
              <Text style={styles.launchLabel}>🚀 0-50 km/h</Text>
              <Text style={styles.launchValue}>{formatLaunchTime(zeroTo50Seconds)}</Text>
            </View>
            <View style={styles.launchPill}>
              <Text style={styles.launchLabel}>🚀 0-100 km/h</Text>
              <Text style={styles.launchValue}>{formatLaunchTime(zeroTo100Seconds)}</Text>
            </View>
          </View>
        )}

        {isTracking && zeroTo100Seconds == null && currentSpeedKmh < 2 && (
          <Text style={styles.launchHint}>
            Sal desde parado y mediremos tu 0-100. Hazlo solo donde sea seguro y legal.
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Animated.View style={{ transform: [{ scale }], width: '100%', alignItems: 'center' }}>
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

        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/navigate')}
          accessibilityRole="button"
        >
          <Text style={styles.navEmoji}>🧭</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.navTitle}>Navegar</Text>
            <Text style={styles.navSubtitle}>Rutas con avisos de radares fijos y de tramo</Text>
          </View>
          <Text style={styles.navChevron}>›</Text>
        </Pressable>

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
                    style={({ pressed }) => [styles.lastTripRow, pressed && { opacity: 0.7 }]}
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
                <View style={styles.streakRow}>
                  <Text style={styles.streakEmoji}>🔥</Text>
                  <Text style={styles.streakText}>
                    <Text style={styles.streakNumber}>{streak}</Text> días seguidos conduciendo
                  </Text>
                </View>
              )}

              {recap && <WeeklyRecapCard recap={recap} units={units} />}

              {topFriend && recap && (
                <FriendCompareCard friend={topFriend} myDistanceMeters={recap.distanceMeters} units={units} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  greeting: { ...type.body, color: colors.textMuted, alignSelf: 'flex-start' },
  mapWrap: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', ...shadow.card },
  dial: { alignItems: 'center', marginTop: spacing.md },
  speedLabel: { ...type.label, color: colors.textFaint },
  speed: { color: colors.text, fontSize: 88, fontWeight: '800', letterSpacing: -3, marginTop: 4 },
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
  launchRow: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  launchPill: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  launchLabel: { ...type.caption, color: colors.textMuted },
  launchValue: { ...type.heading, color: colors.accent },
  launchHint: { ...type.caption, color: colors.textFaint, textAlign: 'center', fontWeight: '500' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 20,
    paddingHorizontal: 56,
    ...shadow.glow,
  },
  buttonStop: { backgroundColor: colors.danger, shadowColor: colors.danger },
  buttonText: { color: '#04140D', fontWeight: '800', fontSize: 17, letterSpacing: 0.2 },
  navCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  navEmoji: { fontSize: 24 },
  navTitle: { ...type.subheading, color: colors.text },
  navSubtitle: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  navChevron: { color: colors.textFaint, fontSize: 26, fontWeight: '600' },
  fullDivider: { width: '100%' },
  insightsBlock: { width: '100%', gap: spacing.lg },
  lastTripRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  lastTripDate: { ...type.caption, color: colors.textMuted, width: 56 },
  lastTripDistance: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  scorePill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  scoreText: { fontSize: 12, fontWeight: '800' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  streakEmoji: { fontSize: 18 },
  streakText: { ...type.body, color: colors.textMuted },
  streakNumber: { color: colors.text, fontWeight: '800' },
});
