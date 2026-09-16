import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTripStore } from '../../src/state/tripStore';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, fonts, radius, shadow, spacing, type } from '../../src/theme/colors';
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
import { periodLabel, periodRange, previousMonth } from '../../src/utils/wrapped';

// Días del mes en los que se propone ver el resumen del mes anterior.
const WRAPPED_PROMPT_DAYS = 10;

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
  const [showWrapped, setShowWrapped] = useState(false);
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
      if (new Date().getDate() <= WRAPPED_PROMPT_DAYS) {
        const { since, until } = periodRange(previousMonth());
        supabase
          .from('trips')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .gte('started_at', since.toISOString())
          .lt('started_at', until.toISOString())
          .then(({ count }) => setShowWrapped((count ?? 0) > 0));
      } else {
        setShowWrapped(false);
      }
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
            <Text style={[styles.buttonText, isTracking && styles.buttonTextStop]}>
              {saving ? 'Guardando…' : isTracking ? 'Terminar trayecto' : 'Iniciar trayecto'}
            </Text>
          </Pressable>
        </Animated.View>

        <Pressable
          style={({ pressed }) => [styles.navCard, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/navigate')}
          accessibilityRole="button"
        >
          <View style={styles.navIcon}>
            <Ionicons name="navigate" size={20} color={colors.accentAlt} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.navTitle}>Navegar</Text>
            <Text style={styles.navSubtitle}>Rutas con avisos de radares fijos y de tramo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>

        {!isTracking && showWrapped && (
          <Pressable
            style={({ pressed }) => [styles.wrappedCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/wrapped')}
          >
            <Text style={styles.wrappedEmoji}>📼</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.wrappedTitle}>Tu resumen de {periodLabel(previousMonth()).split(' ')[0]} está listo</Text>
              <Text style={styles.wrappedSub}>Kilómetros, dinero, lugares y tus marcas del mes</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onAccent} />
          </Pressable>
        )}

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
  wrappedCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  wrappedEmoji: { fontSize: 28 },
  wrappedTitle: { ...type.body, fontFamily: fonts.bodyBold, color: colors.onAccent },
  wrappedSub: { ...type.caption, color: 'rgba(36, 16, 0, 0.72)' },
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
  launchHint: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textFaint, textAlign: 'center' },
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
  navIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentAltSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { ...type.subheading, color: colors.text },
  navSubtitle: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted },
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
