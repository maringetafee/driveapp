import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import type { FeatureCollection, Point } from 'geojson';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../src/theme/colors';
import type { FuelType, Vehicle } from '../src/types/database';
import { FUEL_INFO, FUEL_TYPES, formatEuros, nearbyFuelStations, type FuelStation } from '../src/utils/energyCost';
import { nearbyChargingPoints, type ChargingPoint } from '../src/lib/chargingApi';
import LinesMap from '../src/components/LinesMap';
import Chip from '../src/components/ui/Chip';
import { SkeletonList } from '../src/components/ui/Skeleton';

const RADIUS_KM = 15;

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

type LoadState = 'loading' | 'no-gps' | 'error' | 'ready';

export default function FuelStationsScreen() {
  const myId = useAuthStore((s) => s.session?.user.id);
  const [fuelType, setFuelType] = useState<FuelType>('gasoline');
  const [autoFuelType, setAutoFuelType] = useState<FuelType | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [chargers, setChargers] = useState<ChargingPoint[]>([]);

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
          const points = await nearbyChargingPoints(point, RADIUS_KM);
          if (cancelled) return;
          setChargers(points);
          setStations([]);
        } else {
          const list = await nearbyFuelStations(fuelType, point, RADIUS_KM * 1000);
          if (cancelled) return;
          setStations(list);
          setChargers([]);
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
  }, [fuelType]);

  const points: FeatureCollection<Point> | undefined =
    fuelType === 'electric'
      ? chargers.length
        ? {
            type: 'FeatureCollection',
            features: chargers.map((c) => ({
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
              <Text style={styles.heroValue}>{formatEuros(cheapest.price)}</Text>
              <Text style={styles.heroLabel}>
                más barato · {info.label} · {cheapest.brand || cheapest.municipality}
              </Text>
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

        {state === 'loading' && <SkeletonList count={3} />}

        {state === 'no-gps' && (
          <Text style={styles.hint}>Necesitamos tu ubicación para buscar los más cercanos.</Text>
        )}

        {state === 'error' && <Text style={styles.hint}>No hemos podido cargar los datos. Comprueba tu conexión.</Text>}

        {state === 'ready' && points && (
          <LinesMap height={280} lines={[]} points={points} pointColor={colors.accent} />
        )}

        {state === 'ready' && fuelType !== 'electric' && stations.length === 0 && (
          <Text style={styles.hint}>No hay gasolineras de {info.label.toLowerCase()} en {RADIUS_KM} km a la redonda.</Text>
        )}

        {state === 'ready' && fuelType !== 'electric' && stations.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            {stations.slice(0, 20).map((s, i) => (
              <View key={s.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {s.brand || 'Estación'}
                    </Text>
                    {i === 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>MÁS BARATA</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {s.address || s.municipality} · {formatKm(s.distanceM)}
                  </Text>
                </View>
                <Text style={[styles.rowPrice, i === 0 && { color: colors.accent }]}>{formatEuros(s.price)}</Text>
              </View>
            ))}
          </View>
        )}

        {state === 'ready' && fuelType === 'electric' && chargers.length === 0 && (
          <Text style={styles.hint}>No hemos encontrado puntos de carga en {RADIUS_KM} km a la redonda.</Text>
        )}

        {state === 'ready' && fuelType === 'electric' && chargers.length > 0 && (
          <View style={{ gap: spacing.sm }}>
            {chargers.slice(0, 20).map((c, i) => (
              <View key={c.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {c.operator || c.name}
                    </Text>
                    {i === 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>MÁS CERCANO</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {c.address || c.name}
                    {c.maxPowerKw ? ` · hasta ${Math.round(c.maxPowerKw)} kW` : ''}
                  </Text>
                  {!!c.costText && (
                    <Text style={styles.rowCost} numberOfLines={1}>
                      {c.costText}
                    </Text>
                  )}
                </View>
                {c.distanceKm != null && <Text style={styles.rowPrice}>{c.distanceKm.toFixed(1)} km</Text>}
              </View>
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
  badge: { backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  badgeText: { ...type.label, color: colors.accent, fontSize: 10 },
  attribution: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 11, lineHeight: 15 },
});
