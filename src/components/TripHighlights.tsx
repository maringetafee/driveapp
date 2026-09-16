import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import {
  fetchRecordRows,
  formatRecordValue,
  RECORD_INFO,
  recordsBrokenBy,
  type PersonalRecord,
} from '../utils/personalRecords';
import { PROVINCES } from '../utils/places';
import { effortsForTrip, formatRegularity, type MatchedEffort } from '../utils/segments';
import { tripProcessing } from '../utils/tripPostProcess';
import type { Trip, TripPlace, Units } from '../types/database';
import SectionHeader from './ui/SectionHeader';

interface Props {
  trip: Trip;
  isOwnTrip: boolean;
  units: Units;
}

interface PlaceChip {
  id: string;
  name: string;
  isNew: boolean;
  newProvince: string | null;
}

/** Récords batidos, tramos recorridos y lugares nuevos de un trayecto. */
export default function TripHighlights({ trip, isOwnTrip, units }: Props) {
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [efforts, setEfforts] = useState<MatchedEffort[]>([]);
  const [places, setPlaces] = useState<PlaceChip[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Si el trayecto se acaba de guardar, espera a que se calculen tramos y lugares.
      await tripProcessing(trip.id);
      const [recordRows, matched, { data: placeRows }] = await Promise.all([
        isOwnTrip ? fetchRecordRows(trip.user_id) : Promise.resolve([]),
        effortsForTrip(trip.id, trip.user_id).catch(() => []),
        supabase.from('trip_places').select('*').eq('trip_id', trip.id),
      ]);

      let chips: PlaceChip[] = [];
      const tripPlaces = (placeRows ?? []) as TripPlace[];
      if (tripPlaces.length) {
        const { data: earlier } = await supabase
          .from('trip_places')
          .select('municipality_id, province_code')
          .eq('user_id', trip.user_id)
          .lt('visited_at', trip.started_at);
        const seenMunicipalities = new Set((earlier ?? []).map((p) => p.municipality_id));
        const seenProvinces = new Set((earlier ?? []).map((p) => p.province_code));
        const announced = new Set<string>();
        chips = tripPlaces.map((p) => {
          const newProvince = !seenProvinces.has(p.province_code) && !announced.has(p.province_code);
          if (newProvince) announced.add(p.province_code);
          return {
            id: p.municipality_id,
            name: p.municipality,
            isNew: !seenMunicipalities.has(p.municipality_id),
            newProvince: newProvince ? PROVINCES[p.province_code] : null,
          };
        });
      }

      if (cancelled) return;
      setRecords(recordsBrokenBy(recordRows, trip.id));
      setEfforts(matched);
      setPlaces(chips);
      setLoading(false);
    })().catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.user_id, trip.started_at, isOwnTrip]);

  const canCreateSegment = isOwnTrip && (trip.route_geojson?.coordinates.length ?? 0) > 1;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={styles.hint}>Buscando récords, tramos y lugares…</Text>
      </View>
    );
  }

  const newPlaces = places.filter((p) => p.isNew);
  const newProvinces = places.map((p) => p.newProvince).filter((p): p is string => !!p);

  return (
    <View style={styles.wrap}>
      {records.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="🏆 Nuevos récords personales" />
          {records.map((record) => {
            const info = RECORD_INFO[record.key];
            return (
              <View key={record.key} style={styles.recordCard}>
                <Text style={styles.recordEmoji}>{info.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={styles.recordLabel}>{info.label}</Text>
                  <Text style={styles.recordValue}>{formatRecordValue(record.key, record.value, units)}</Text>
                </View>
                {record.previous != null && (
                  <Text style={styles.recordPrev}>antes {formatRecordValue(record.key, record.previous, units)}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {efforts.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="🏁 Tramos" />
          {efforts.map(({ segment, effort, personalBest, previousBest }) => (
            <Pressable
              key={effort.id}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
              onPress={() => router.push(`/segments/${segment.id}`)}
            >
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {segment.name}
                </Text>
                <Text style={styles.hint}>
                  {personalBest
                    ? previousBest == null
                      ? 'Primer intento'
                      : `🏅 Tu conducción más regular (antes ${formatRegularity(previousBest)})`
                    : `Tu mejor: ${formatRegularity(previousBest ?? effort.speed_stddev_kmh)}`}
                </Text>
              </View>
              <Text style={[styles.rowValue, personalBest && styles.rowValueBest]}>
                {formatRegularity(effort.speed_stddev_kmh)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      )}

      {places.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="📍 Lugares"
            action={isOwnTrip ? { label: 'Ver mapa', onPress: () => router.push('/places') } : undefined}
          />
          {isOwnTrip && (newPlaces.length > 0 || newProvinces.length > 0) && (
            <Text style={styles.conquest}>
              {newProvinces.length
                ? `¡Provincia nueva: ${newProvinces.join(', ')}! `
                : ''}
              {newPlaces.length
                ? `${newPlaces.length} ${newPlaces.length === 1 ? 'municipio nuevo' : 'municipios nuevos'} conquistado${newPlaces.length === 1 ? '' : 's'}.`
                : ''}
            </Text>
          )}
          <View style={styles.chips}>
            {places.map((p) => (
              <View key={p.id} style={[styles.chip, isOwnTrip && p.isNew && styles.chipNew]}>
                <Text style={[styles.chipText, isOwnTrip && p.isNew && styles.chipTextNew]}>{p.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {canCreateSegment && (
        <Pressable
          style={({ pressed }) => [styles.createSegment, pressed && { opacity: 0.8 }]}
          onPress={() => router.push(`/segments/new?tripId=${trip.id}`)}
        >
          <Ionicons name="flag-outline" size={18} color={colors.accentAlt} />
          <Text style={styles.createSegmentText}>Crear un tramo con este trayecto</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  flex: { flex: 1 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  section: { gap: spacing.sm },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  recordEmoji: { fontSize: 24 },
  recordLabel: { ...type.caption, color: colors.textMuted },
  recordValue: { fontFamily: fonts.numeralBold, fontSize: 20, color: colors.text },
  recordPrev: { ...type.caption, color: colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowTitle: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text },
  rowValue: { fontFamily: fonts.numeralSemiBold, fontSize: 15, color: colors.text },
  rowValueBest: { color: colors.accent },
  conquest: { ...type.body, color: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipNew: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { ...type.caption, color: colors.textMuted },
  chipTextNew: { color: colors.text },
  createSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 12,
  },
  createSegmentText: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.accentAlt },
});
