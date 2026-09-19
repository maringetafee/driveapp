import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import { formatLaunchTime } from '../../src/utils/launchTimer';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import StatRow from '../../src/components/ui/StatRow';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import SectionHeader from '../../src/components/ui/SectionHeader';
import VehicleMaintenanceSection from '../../src/components/VehicleMaintenanceSection';
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
  best0to100Seconds: number | null;
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
    best0to100Seconds: null,
    energyCostEur: 0,
  });
  const [editingEnergy, setEditingEnergy] = useState(false);
  const [energyDraft, setEnergyDraft] = useState(EMPTY_ENERGY_DRAFT);
  const [savingEnergy, setSavingEnergy] = useState(false);
  const [energyError, setEnergyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingDefault, setSettingDefault] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [draftMake, setDraftMake] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftYear, setDraftYear] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

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
        const launches = rows.map((t) => t.zero_to_100_s).filter((s): s is number => s != null);
        setStats({
          tripCount: rows.length,
          totalDistanceMeters: rows.reduce((sum, t) => sum + (t.distance_meters ?? 0), 0),
          maxSpeedKmh: rows.reduce((max, t) => Math.max(max, t.max_speed_kmh ?? 0), 0),
          best0to100Seconds: launches.length ? Math.min(...launches) : null,
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

  const onEditInfo = () => {
    if (!vehicle) return;
    setDraftMake(vehicle.make);
    setDraftModel(vehicle.model);
    setDraftYear(vehicle.year != null ? String(vehicle.year) : '');
    setInfoError(null);
    setEditingInfo(true);
  };

  const yearValue = draftYear.trim() === '' ? null : Number(draftYear);
  const yearValid = yearValue === null || (Number.isInteger(yearValue) && yearValue >= 1900 && yearValue <= new Date().getFullYear() + 1);

  const onSaveInfo = async () => {
    if (!vehicle || !draftMake.trim() || !draftModel.trim() || !yearValid) return;
    setSavingInfo(true);
    const changes = { make: draftMake.trim(), model: draftModel.trim(), year: yearValue };
    const { error } = await supabase.from('vehicles').update(changes).eq('id', vehicle.id);
    setSavingInfo(false);
    if (error) {
      setInfoError('No se pudo guardar. Comprueba tu conexión.');
      return;
    }
    setVehicle({ ...vehicle, ...changes });
    setEditingInfo(false);
  };

  const onDelete = () => {
    if (!vehicle || !session) return;
    Alert.alert(
      'Eliminar coche',
      `¿Eliminar ${vehicle.make} ${vehicle.model}? Se borrará también su mantenimiento. Tus trayectos se conservan, pero quedarán sin coche asignado.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
            if (error) {
              Alert.alert('No se pudo eliminar', 'Comprueba tu conexión e inténtalo de nuevo.');
              return;
            }
            if (vehicle.is_default) {
              const { data: next } = await supabase
                .from('vehicles')
                .select('id')
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: true })
                .limit(1);
              if (next?.[0]) await supabase.from('vehicles').update({ is_default: true }).eq('id', next[0].id);
            }
            router.back();
          },
        },
      ]
    );
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

        {editingInfo ? (
          <View style={styles.energy}>
            <Input placeholder="Marca" value={draftMake} onChangeText={setDraftMake} />
            <Input placeholder="Modelo" value={draftModel} onChangeText={setDraftModel} />
            <Input placeholder="Año (opcional)" value={draftYear} onChangeText={setDraftYear} keyboardType="number-pad" maxLength={4} />
            {(infoError || !yearValid) && (
              <Text style={styles.energyError}>{infoError ?? 'Introduce un año válido.'}</Text>
            )}
            <PrimaryButton
              title="Guardar cambios"
              onPress={onSaveInfo}
              loading={savingInfo}
              disabled={!draftMake.trim() || !draftModel.trim() || !yearValid}
            />
            <PrimaryButton title="Cancelar" onPress={() => setEditingInfo(false)} variant="ghost" />
          </View>
        ) : (
          <Text style={styles.title}>
            {vehicle.make} {vehicle.model}
            {vehicle.year ? ` · ${vehicle.year}` : ''}
          </Text>
        )}
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
            { label: 'Mejor 0-100', value: stats.best0to100Seconds != null ? formatLaunchTime(stats.best0to100Seconds) : '—' },
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

        {isMine && <VehicleMaintenanceSection vehicleId={vehicle.id} />}

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
            {!editingInfo && <PrimaryButton title="Editar coche" onPress={onEditInfo} variant="secondary" />}
            <PrimaryButton title="Eliminar coche" onPress={onDelete} variant="danger" />
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
