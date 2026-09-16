import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../src/theme/colors';
import {
  fetchConqueredPlaces,
  PROVINCE_COUNT,
  PROVINCES,
  scanPendingTrips,
  type ConqueredPlaces,
} from '../src/utils/places';
import LinesMap from '../src/components/LinesMap';
import ProgressBar from '../src/components/ui/ProgressBar';
import SectionHeader from '../src/components/ui/SectionHeader';
import { SkeletonList } from '../src/components/ui/Skeleton';

const MAX_POINTS_PER_ROUTE = 150;
const MAX_SCAN_ROUNDS = 6;

function simplify(route: LineString): LineString['coordinates'] {
  const coords = route.coordinates;
  if (coords.length <= MAX_POINTS_PER_ROUTE) return coords;
  const step = coords.length / MAX_POINTS_PER_ROUTE;
  return Array.from({ length: MAX_POINTS_PER_ROUTE }, (_, i) => coords[Math.floor(i * step)]).concat([coords[coords.length - 1]]);
}

export default function PlacesScreen() {
  const myId = useAuthStore((s) => s.session?.user.id);
  const [places, setPlaces] = useState<ConqueredPlaces | null>(null);
  const [routes, setRoutes] = useState<MultiLineString | null>(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    if (!myId) return;
    const [conquered, { data: trips }] = await Promise.all([
      fetchConqueredPlaces(myId),
      supabase.from('trips').select('route_geojson').eq('user_id', myId).order('started_at', { ascending: false }).limit(300),
    ]);
    setPlaces(conquered);
    const lines = (trips ?? [])
      .map((t) => t.route_geojson as LineString | null)
      .filter((r): r is LineString => !!r && r.coordinates.length > 1)
      .map(simplify);
    setRoutes(lines.length ? { type: 'MultiLineString', coordinates: lines } : null);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        await load();
        if (!myId) return;
        // Trayectos antiguos sin lugares: se procesan poco a poco y se refresca.
        setScanning(true);
        for (let round = 0; round < MAX_SCAN_ROUNDS && !cancelled; round++) {
          const processed = await scanPendingTrips(myId).catch(() => 0);
          if (!processed) break;
          if (!cancelled) await load();
        }
        if (!cancelled) setScanning(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [load, myId])
  );

  const points = useMemo<FeatureCollection<Point> | undefined>(
    () =>
      places
        ? {
            type: 'FeatureCollection',
            features: places.municipalities.map((m) => ({
              type: 'Feature',
              properties: { name: m.name },
              geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
            })),
          }
        : undefined,
    [places]
  );

  if (!places) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>
          <SkeletonList count={2} />
        </View>
      </SafeAreaView>
    );
  }

  const visited = new Map(places.provinces.map((p) => [p.code, p.municipalities]));
  const recent = [...places.municipalities].sort((a, b) => b.firstVisit.localeCompare(a.firstVisit)).slice(0, 12);
  const percent = Math.round((places.provinces.length / PROVINCE_COUNT) * 100);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroValue}>
            {places.provinces.length}
            <Text style={styles.heroOf}> / {PROVINCE_COUNT}</Text>
          </Text>
          <Text style={styles.heroLabel}>provincias conquistadas · {places.municipalities.length} municipios</Text>
          <ProgressBar label="De España" value={percent} tone={colors.accent} suffix=" %" />
        </View>

        {scanning && (
          <View style={styles.scanning}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.hint}>Revisando tus trayectos anteriores…</Text>
          </View>
        )}

        {(routes || (points && points.features.length > 0)) && (
          <LinesMap
            height={320}
            lines={routes ? [{ id: 'all-routes', shape: routes, color: colors.accent, width: 2.5, opacity: 0.55 }] : []}
            points={points}
            pointColor={colors.text}
          />
        )}

        <SectionHeader title="Provincias" />
        <View style={styles.grid}>
          {Object.entries(PROVINCES)
            .sort((a, b) => a[1].localeCompare(b[1], 'es'))
            .map(([code, name]) => {
              const count = visited.get(code) ?? 0;
              const on = count > 0;
              return (
                <View key={code} style={[styles.province, on && styles.provinceOn]}>
                  <Text style={[styles.provinceName, on && styles.provinceNameOn]} numberOfLines={1}>
                    {name}
                  </Text>
                  {on && <Text style={styles.provinceCount}>{count}</Text>}
                </View>
              );
            })}
        </View>

        {recent.length > 0 && (
          <>
            <SectionHeader title="Últimas conquistas" />
            {recent.map((m) => (
              <View key={m.id} style={styles.recentRow}>
                <Text style={styles.recentName}>
                  {m.name} <Text style={styles.hint}>· {PROVINCES[m.provinceCode]}</Text>
                </Text>
                <Text style={styles.hint}>
                  {new Date(m.firstVisit).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            ))}
          </>
        )}

        {places.municipalities.length === 0 && !scanning && (
          <Text style={styles.hint}>
            Aún no hay lugares. Cada trayecto que hagas irá marcando los municipios y provincias por los que pasas.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroValue: { fontFamily: fonts.numeralBold, fontSize: 44, color: colors.text },
  heroOf: { fontFamily: fonts.numeralMedium, fontSize: 22, color: colors.textMuted },
  heroLabel: { ...type.body, color: colors.textMuted, marginBottom: spacing.sm },
  scanning: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  province: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  provinceOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  provinceName: { ...type.caption, color: colors.textFaint },
  provinceNameOn: { color: colors.text, fontFamily: fonts.bodySemiBold },
  provinceCount: { fontFamily: fonts.numeralSemiBold, fontSize: 12, color: colors.accent },
  recentRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  recentName: { ...type.body, color: colors.text, flexShrink: 1 },
});
