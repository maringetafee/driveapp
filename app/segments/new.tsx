import { useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LineString } from 'geojson';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import { boundsOf, cumulativeDistances, sliceByDistance } from '../../src/utils/routeGeo';
import { backfillSegment, MIN_SEGMENT_METERS } from '../../src/utils/segments';
import LinesMap from '../../src/components/LinesMap';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import RangeSlider from '../../src/components/ui/RangeSlider';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Segment } from '../../src/types/database';

export default function NewSegmentScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [route, setRoute] = useState<LineString | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<[number, number]>([0.1, 0.9]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('trips')
      .select('route_geojson')
      .eq('id', tripId)
      .single()
      .then(({ data }) => {
        setRoute((data?.route_geojson as LineString | null) ?? null);
        setLoading(false);
      });
  }, [tripId]);

  const total = useMemo(() => {
    if (!route) return 0;
    const cum = cumulativeDistances(route.coordinates);
    return cum[cum.length - 1];
  }, [route]);

  const selection = useMemo(
    () => (route && total ? sliceByDistance(route.coordinates, range[0] * total, range[1] * total) : null),
    [route, total, range]
  );
  const selectedMeters = (range[1] - range[0]) * total;
  const tooShort = selectedMeters < MIN_SEGMENT_METERS;

  const onSave = async () => {
    if (!session || !selection || tooShort || name.trim().length < 2) return;
    setSaving(true);
    setError(null);
    const b = boundsOf(selection.coordinates);
    const { data, error: insertError } = await supabase
      .from('segments')
      .insert({
        created_by: session.user.id,
        name: name.trim(),
        geometry: selection,
        distance_meters: Math.round(selectedMeters),
        min_lat: b.minLat,
        max_lat: b.maxLat,
        min_lon: b.minLon,
        max_lon: b.maxLon,
      })
      .select('*')
      .single();
    if (insertError || !data) {
      setSaving(false);
      setError('No se pudo crear el tramo. Comprueba tu conexión.');
      return;
    }
    await backfillSegment(data as Segment, session.user.id).catch(() => 0);
    setSaving(false);
    router.replace(`/segments/${data.id}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>
          <SkeletonList count={1} />
        </View>
      </SafeAreaView>
    );
  }

  if (!route || route.coordinates.length < 2) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Text style={[styles.hint, styles.content]}>Este trayecto no tiene ruta guardada.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Elige el trozo de tu ruta que quieres convertir en tramo. Cada vez que alguien lo recorra se medirá lo
            regular que ha sido su conducción, no lo rápido.
          </Text>

          <LinesMap
            height={300}
            fit={route}
            lines={[
              { id: 'route', shape: route, color: colors.textFaint, width: 4, opacity: 0.6 },
              ...(selection ? [{ id: 'selection', shape: selection, color: colors.accent, width: 6 }] : []),
            ]}
          />

          <RangeSlider start={range[0]} end={range[1]} onChange={(start, end) => setRange([start, end])} />
          <Text style={[styles.hint, tooShort && styles.error]}>
            {tooShort
              ? `El tramo debe medir al menos ${formatDistance(MIN_SEGMENT_METERS, units)}.`
              : `Tramo seleccionado: ${formatDistance(selectedMeters, units)}`}
          </Text>

          <Input placeholder="Nombre del tramo (ej. Subida a la M-406)" value={name} onChangeText={setName} maxLength={60} />

          {error && <Text style={styles.error}>{error}</Text>}

          <PrimaryButton
            title="Crear tramo"
            onPress={onSave}
            loading={saving}
            disabled={tooShort || name.trim().length < 2}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  intro: { ...type.body, color: colors.textMuted },
  hint: { ...type.caption, color: colors.textMuted },
  error: { ...type.caption, color: colors.danger },
});
