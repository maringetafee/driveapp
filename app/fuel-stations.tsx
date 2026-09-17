import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Animated, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import type { FeatureCollection, Point } from 'geojson';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../src/theme/colors';
import type { FuelType, Vehicle } from '../src/types/database';
import {
  FUEL_INFO,
  FUEL_TYPES,
  formatEuros,
  nearbyFuelStations,
  provinceMedianPrice,
  type FuelStation,
} from '../src/utils/energyCost';
import { nearbyChargingPoints, type ChargingPoint } from '../src/lib/chargingApi';
import LinesMap from '../src/components/LinesMap';
import Chip from '../src/components/ui/Chip';
import ScaledPressable from '../src/components/ui/ScaledPressable';
import FadeSlideIn from '../src/components/ui/FadeSlideIn';
import { SkeletonList } from '../src/components/ui/Skeleton';

const RADIUS_OPTIONS = [15, 30, 50] as const;
const TANK_LITERS_FOR_SAVINGS = 50;

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

function navigateTo(lat: number, lon: number, name: string, address: string) {
  const params = new URLSearchParams({ destLat: String(lat), destLon: String(lon), destName: name, destAddress: address });
  router.push(`/navigate?${params.toString()}`);
}

/** Precio del hero, contando desde 0 cada vez que cambia (combustible, radio...). */
function AnimatedPrice({ value, style }: { value: number; style: StyleProp<TextStyle> }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const listener = anim.addListener(({ value: v }) => setDisplay(v));
    anim.setValue(0);
    const animation = Animated.spring(anim, { toValue: value, useNativeDriver: false, speed: 8, bounciness: 4 });
    animation.start();
    return () => {
      anim.removeListener(listener);
      animation.stop();
    };
  }, [value, anim]);

  return <Text style={style}>{formatEuros(display)}</Text>;
}

/** Insignia "MÁS BARATA"/"MÁS CERCANO" con un pulso suave para que destaque en la lista. */
function PulsingBadge({ label }: { label: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 650, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </Animated.View>
  );
}

type LoadState = 'loading' | 'no-gps' | 'error' | 'ready';

export default function FuelStationsScreen() {
  const myId = useAuthStore((s) => s.session?.user.id);
  const [fuelType, setFuelType] = useState<FuelType>('gasoline');
  const [autoFuelType, setAutoFuelType] = useState<FuelType | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(RADIUS_OPTIONS[0]);
  const [connectorFilter, setConnectorFilter] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [chargers, setChargers] = useState<ChargingPoint[]>([]);
  const [medianPrice, setMedianPrice] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      supabase
        .from('vehicles')
        .select('fuel_type')
        .eq('user_id', myId)
        .eq('is_default', true)
        .maybeSingle()
        .then(({ data }) => {
          const ft = (data as Pick<Vehicle, 'fuel_type'> | null)?.fuel_type;
          if (ft) {
            setAutoFuelType(ft);
            setFuelType(ft);
          }
        });
    }, [myId])
  );

  useEffect(() => {
    setConnectorFilter(null);
  }, [fuelType, radiusKm]);

  useEffect(() => {
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      setState('loading');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setState('no-gps');
        return;
      }
      try {
        const point = await new Promise<{ lat: number; lon: number }>((resolve, reject) => {
          Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 }, (loc) => {
            subscription?.remove();
            resolve({ lat: loc.coords.latitude, lon: loc.coords.longitude });
          })
            .then((sub) => {
              subscription = sub;
            })
            .catch(reject);
        });
        if (cancelled) return;
        if (fuelType === 'electric') {
          const points = await nearbyChargingPoints(point, radiusKm);
          if (cancelled) return;
          setChargers(points);
          setStations([]);
          setMedianPrice(null);
        } else {
          const [list, median] = await Promise.all([
            nearbyFuelStations(fuelType, point, radiusKm * 1000),
            provinceMedianPrice(fuelType, point),
          ]);
          if (cancelled) return;
          setStations(list);
          setChargers([]);
          setMedianPrice(median);
        }
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [fuelType, radiusKm]);

  const connectorTypes = [...new Set(chargers.flatMap((c) => c.connectorTypes))].sort();
  const filteredChargers = connectorFilter ? chargers.filter((c) => c.connectorTypes.includes(connectorFilter)) : chargers;

  const points: FeatureCollection<Point> | undefined =
    fuelType === 'electric'
      ? filteredChargers.length
        ? {
            type: 'FeatureCollection',
            features: filteredChargers.map((c) => ({
              type: 'Feature',
              properties: { name: c.name },
              geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
            })),
          }
        : undefined
      : stations.length
        ? {
            type: 'FeatureCollection',
            features: stations.map((s) => ({
              type: 'Feature',
              properties: { name: s.brand },
              geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            })),
          }
        : undefined;

  const info = FUEL_INFO[fuelType];
  const cheapest = stations[0];
  const savings = cheapest && medianPrice != null ? (medianPrice - cheapest.price) * TANK_LITERS_FOR_SAVINGS : null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Ionicons name={fuelType === 'electric' ? 'flash' : 'water'} size={22} color={colors.accent} />
            <Text style={styles.heroTitle}>
              {fuelType === 'electric' ? 'Puntos de carga cercanos' : 'Gasolineras cercanas'}
            </Text>
          </View>
          {fuelType !== 'electric' && state === 'ready' && cheapest && (
            <>
              <AnimatedPrice value={cheapest.price} style={styles.heroValue} />
              <Text style={styles.heroLabel}>
                más barato · {info.label} · {cheapest.brand || cheapest.municipality}
              </Text>
              {savings != null && savings > 0.5 && (
                <View style={styles.savingsPill}>
                  <Ionicons name="trending-down" size={13} color={colors.accent} />
                  <Text style={styles.savingsText}>
                    Ahorras ~{formatEuros(savings)} en un depósito de {TANK_LITERS_FOR_SAVINGS} L frente a la media de la
                    provincia
                  </Text>
                </View>
              )}
            </>
          )}
          {autoFuelType && (
            <Text style={styles.heroHint}>Según tu coche principal ({FUEL_INFO[autoFuelType].label.toLowerCase()})</Text>
          )}
        </View>

        <View style={styles.chipRow}>
          {FUEL_TYPES.map((ft) => (
            <Chip key={ft} label={FUEL_INFO[ft].label} active={ft === fuelType} onPress={() => setFuelType(ft)} />
          ))}
        </View>

        <View style={styles.chipRow}>
          {RADIUS_OPTIONS.map((r) => (
            <Chip key={r} label={`${r} km`} active={r === radiusKm} onPress={() => setRadiusKm(r)} />
          ))}
        </View>

        {fuelType === 'electric' && connectorTypes.length > 1 && (
          <View style={styles.chipRow}>
            <Chip label="Todos" active={!connectorFilter} onPress={() => setConnectorFilter(null)} />
            {connectorTypes.map((ct) => (
              <Chip key={ct} label={ct} active={connectorFilter === ct} onPress={() => setConnectorFilter(ct)} />
            ))}
          </View>
        )}

        {state === 'loading' && <SkeletonList count={3} />}

        {state === 'no-gps' && (
          <Text style={styles.hint}>Necesitamos tu ubicación para buscar los más cercanos.</Text>
        )}

        {state === 'error' && <Text style={styles.hint}>No hemos podido cargar los datos. Comprueba tu conexión.</Text>}

        {state === 'ready' && points && (
          <LinesMap height={280} lines={[]} points={points} pointColor={colors.accent} />
        )}

        {state === 'ready' && fuelType !== 'electric' && stations.length === 0 && (
          <Text style={styles.hint}>No hay gasolineras de {info.label.toLowerCase()} en {radiusKm} km a la redonda.</Text>
        )}

        {state === 'ready' && fuelType !== 'electric' && stations.length > 0 && (
          <View key={`${fuelType}-${radiusKm}`} style={{ gap: spacing.sm }}>
            {stations.slice(0, 20).map((s, i) => (
              <FadeSlideIn key={s.id} index={i}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {s.brand || 'Estación'}
                      </Text>
                      {i === 0 && <PulsingBadge label="MÁS BARATA" />}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {s.address || s.municipality} · {formatKm(s.distanceM)}
                    </Text>
                  </View>
                  <Text style={[styles.rowPrice, i === 0 && { color: colors.accent }]}>{formatEuros(s.price)}</Text>
                  <ScaledPressable
                    style={styles.navButton}
                    hitSlop={8}
                    onPress={() => navigateTo(s.lat, s.lon, s.brand || 'Estación', s.address || s.municipality)}
                  >
                    <Ionicons name="navigate" size={18} color={colors.accent} />
                  </ScaledPressable>
                </View>
              </FadeSlideIn>
            ))}
          </View>
        )}

        {state === 'ready' && fuelType === 'electric' && filteredChargers.length === 0 && (
          <Text style={styles.hint}>No hemos encontrado puntos de carga en {radiusKm} km a la redonda.</Text>
        )}

        {state === 'ready' && fuelType === 'electric' && filteredChargers.length > 0 && (
          <View key={`electric-${radiusKm}-${connectorFilter ?? 'all'}`} style={{ gap: spacing.sm }}>
            {filteredChargers.slice(0, 20).map((c, i) => (
              <FadeSlideIn key={c.id} index={i}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {c.operator || c.name}
                      </Text>
                      {i === 0 && <PulsingBadge label="MÁS CERCANO" />}
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {c.address || c.name}
                      {c.maxPowerKw ? ` · hasta ${Math.round(c.maxPowerKw)} kW` : ''}
                    </Text>
                    {c.connectorTypes.length > 0 && (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {c.connectorTypes.join(' · ')}
                      </Text>
                    )}
                    {!!c.costText && (
                      <Text style={styles.rowCost} numberOfLines={1}>
                        {c.costText}
                      </Text>
                    )}
                  </View>
                  {c.distanceKm != null && <Text style={styles.rowPrice}>{c.distanceKm.toFixed(1)} km</Text>}
                  <ScaledPressable
                    style={styles.navButton}
                    hitSlop={8}
                    onPress={() => navigateTo(c.lat, c.lon, c.operator || c.name, c.address)}
                  >
                    <Ionicons name="navigate" size={18} color={colors.accent} />
                  </ScaledPressable>
                </View>
              </FadeSlideIn>
            ))}
            <Text style={styles.attribution}>
              Precio según lo informado por cada operador (no siempre disponible). Datos: OpenChargeMap.
            </Text>
          </View>
        )}

        {state === 'ready' && fuelType !== 'electric' && stations.length > 0 && (
          <Text style={styles.attribution}>Precios oficiales: Ministerio para la Transición Ecológica.</Text>
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
    gap: 4,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroTitle: { ...type.subheading, color: colors.text },
  heroValue: { fontFamily: fonts.numeralBold, fontSize: 40, color: colors.accent, marginTop: spacing.sm },
  heroLabel: { ...type.body, color: colors.textMuted },
  heroHint: { ...type.caption, color: colors.textFaint, marginTop: 4 },
  savingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginTop: spacing.sm,
  },
  savingsText: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.accent, flexShrink: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...type.body, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text, flexShrink: 1 },
  rowMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  rowCost: { ...type.caption, color: colors.accent, marginTop: 2 },
  rowPrice: { fontFamily: fonts.numeralBold, fontSize: 18, color: colors.text },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...type.label, color: colors.accent, fontSize: 10 },
  attribution: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 11, lineHeight: 15 },
});
