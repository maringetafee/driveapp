import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import StatRow from '../../src/components/ui/StatRow';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import SectionHeader from '../../src/components/ui/SectionHeader';
import VehicleEnergyFields, {
  EMPTY_ENERGY_DRAFT,
  energyColumns,
  energyDraftFrom,
  saveVehicleEnergy,
} from '../../src/components/VehicleEnergyFields';
import { FUEL_INFO, formatDecimal, formatEuros, hasEnergyProfile } from '../../src/utils/energyCost';
import type { Vehicle } from '../../src/types/database';

interface VehicleStats {
  tripCount: number;
  totalDistanceMeters: number;
  maxSpeedKmh: number;
  avgDrivingScore: number | null;
  /** Suma del gasto de los trayectos que ya lo tienen calculado. */
  energyCostEur: number;
}

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stats, setStats] = useState<VehicleStats>({
    tripCount: 0,
    totalDistanceMeters: 0,
    maxSpeedKmh: 0,
    avgDrivingScore: null,
    energyCostEur: 0,
  });
  const [editingEnergy, setEditingEnergy] = useState(false);
  const [energyDraft, setEnergyDraft] = useState(EMPTY_ENERGY_DRAFT);
  const [savingEnergy, setSavingEnergy] = useState(false);
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingDefault, setSettingDefault] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      Promise.all([
        supabase.from('vehicles').select('*').eq('id', id).single(),
                // select('*') para no romper si la migración de gasto aún no está aplicada.
        supabase.from('trips').select('*').eq('vehicle_id', id),
      ]).then(([{ data: vehicleData }, { data: trips }]) => {
        if (cancelled) return;
        setVehicle(vehicleData);

        const rows = trips ?? [];
        const scored = rows.filter((t) => t.driving_score != null);
        setStats({
          tripCount: rows.length,
          totalDistanceMeters: rows.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
          maxSpeedKmh: rows.reduce((max, t) => Math.max(max, t.max_speed_kmh ?? 0), 0),
          avgDrivingScore: scored.length
            ? Math.round(scored.reduce((sum, t) => sum + (t.driving_score ?? 0), 0) / scored.length)
            : null,
          energyCostEur: rows.reduce((sum, t) => sum + (t.energy_cost_eur ?? 0), 0),
        });
        setLoading(false);
      });

      return () => {
        cancelled = true;
      };
    }, [id])
  );

  const isMine = vehicle?.user_id === session?.user.id;

  const onSetDefault = async () => {
    if (!vehicle || !session) return;
    setSettingDefault(true);
    await supabase.from('vehicles').update({ is_default: false }).eq('user_id', session.user.id);
    await supabase.from('vehicles').update({ is_default: true }).eq('id', vehicle.id);
    setVehicle({ ...vehicle, is_default: true });
    setSettingDefault(false);
  };

  const onEditEnergy = () => {
    if (!vehicle) return;
    setEnergyDraft(energyDraftFrom(vehicle));
    setEnergyError(null);
    setEditingEnergy(true);
  };

  const onSaveEnergy = async () => {
    const columns = energyColumns(energyDraft);
    if (!vehicle || !columns) return;
    setSavingEnergy(true);
    const ok = await saveVehicleEnergy(vehicle.id, energyDraft);
    setSavingEnergy(false);
    if (!ok) {
      setEnergyError('No se pudo guardar. Comprueba tu conexión.');
      return;
    }
    setVehicle({ ...vehicle, ...columns });
    setEditingEnergy(false);
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

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.title}>No se encontró el vehículo.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {vehicle.image_url ? (
          <Image source={{ uri: vehicle.image_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderText}>Sin foto</Text>
          </View>
        )}

        <Text style={styles.title}>
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` · ${vehicle.year}` : ''}
        </Text>
        {vehicle.is_default && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>PRINCIPAL</Text>
          </View>
        )}

        <StatRow
          columns={2}
          items={[
            { label: 'Trayectos', value: String(stats.tripCount) },
            { label: 'Distancia total', value: formatDistance(stats.totalDistanceMeters, units) },
            { label: 'Vel. máxima', value: formatSpeed(stats.maxSpeedKmh, units) },
            { label: 'Score medio', value: stats.avgDrivingScore != null ? String(stats.avgDrivingScore) : '—' },
          ]}
        />

        {isMine && (
          <View style={styles.energy}>
            <SectionHeader
              title="Consumo y gasto"
              action={editingEnergy ? { label: 'Cancelar', onPress: () => setEditingEnergy(false) } : undefined}
            />
            {editingEnergy ? (
              <>
                <VehicleEnergyFields value={energyDraft} onChange={setEnergyDraft} make={vehicle.make} model={vehicle.model} />
                {energyError && <Text style={styles.energyError}>{energyError}</Text>}
                <PrimaryButton
                  title="Guardar consumo"
                  onPress={onSaveEnergy}
                  loading={savingEnergy}
                  disabled={energyColumns(energyDraft) == null}
                />
              </>
            ) : hasEnergyProfile(vehicle) ? (
              <>
                <StatRow
                  items={[
                    { label: FUEL_INFO[vehicle.fuel_type].label, value: `${formatDecimal(vehicle.consumption_per_100km, 1)} ${FUEL_INFO[vehicle.fuel_type].unit}` },
                    {
                      label: `€ / ${FUEL_INFO[vehicle.fuel_type].unit}`,
                      value: vehicle.energy_price
                        ? formatEuros(vehicle.energy_price)
                        : FUEL_INFO[vehicle.fuel_type].productId == null
                          ? formatEuros(FUEL_INFO[vehicle.fuel_type].fallbackPrice)
                          : 'Tu zona',
                    },
                    { label: 'Gastado', value: formatEuros(stats.energyCostEur) },
                  ]}
                />
                <PrimaryButton title="Editar consumo" onPress={onEditEnergy} variant="ghost" />
              </>
            ) : (
              <>
                <Text style={styles.energyHint}>
                  Añade el combustible y el consumo medio de este coche y te diremos cuánto te cuesta cada trayecto.
                </Text>
                <PrimaryButton title="Añadir consumo" onPress={onEditEnergy} />
              </>
            )}
          </View>
        )}

        {isMine && (
          <View style={styles.actions}>
            {!vehicle.is_default && (
              <PrimaryButton
                title={settingDefault ? 'Guardando…' : 'Hacer vehículo principal'}
                onPress={onSetDefault}
                loading={settingDefault}
                variant="ghost"
              />
            )}
            <PrimaryButton title="✨ Mod Car (IA)" onPress={() => router.push(`/mod-car/${vehicle.id}`)} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg },
  energy: { gap: spacing.md },
  energyHint: { ...type.body, color: colors.textMuted },
  energyError: { ...type.caption, color: colors.danger },
  image: { width: '100%', height: 200, borderRadius: radius.xl, backgroundColor: colors.surface },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  imagePlaceholderText: { ...type.caption, color: colors.textMuted },
  title: { ...type.heading, color: colors.text, fontSize: 24 },
  defaultBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: -spacing.xs,
  },
  defaultBadgeText: { ...type.label, color: colors.accent },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
