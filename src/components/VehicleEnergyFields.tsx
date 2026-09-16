import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { searchCarVersions, type CarVersion } from '../lib/carSpecs';
import { supabase } from '../lib/supabase';
import { colors, fonts, radius, spacing, type } from '../theme/colors';
import { FUEL_INFO, FUEL_TYPES, formatDecimal, parseDecimal } from '../utils/energyCost';
import type { FuelType, Vehicle } from '../types/database';
import Chip from './ui/Chip';
import Input from './ui/Input';

export interface EnergyDraft {
  fuelType: FuelType | null;
  consumption: string;
  price: string;
}

export const EMPTY_ENERGY_DRAFT: EnergyDraft = { fuelType: null, consumption: '', price: '' };

export function energyDraftFrom(vehicle: Vehicle): EnergyDraft {
  return {
    fuelType: vehicle.fuel_type ?? null,
    consumption: vehicle.consumption_per_100km ? formatDecimal(vehicle.consumption_per_100km, 1) : '',
    price: vehicle.energy_price ? formatDecimal(vehicle.energy_price, 3) : '',
  };
}

/** Columnas de `vehicles` a guardar, o null si el borrador no es válido. */
export function energyColumns(draft: EnergyDraft) {
  if (!draft.fuelType) return null;
  const consumption = parseDecimal(draft.consumption);
  if (consumption == null || consumption >= 100) return null;
  const price = draft.price.trim() ? parseDecimal(draft.price) : null;
  if (draft.price.trim() && (price == null || price >= 10)) return null;
  return { fuel_type: draft.fuelType, consumption_per_100km: consumption, energy_price: price };
}

/**
 * Guarda el consumo en un coche ya creado. Va aparte del insert para que, si la
 * migración 0010 aún no está aplicada, el coche se cree igualmente.
 */
export async function saveVehicleEnergy(vehicleId: string, draft: EnergyDraft): Promise<boolean> {
  const columns = energyColumns(draft);
  if (!columns) return false;
  const { error } = await supabase.from('vehicles').update(columns).eq('id', vehicleId);
  return !error;
}

/** Hay algo escrito pero no se puede guardar. */
export function energyDraftInvalid(draft: EnergyDraft) {
  const touched = draft.fuelType != null || !!draft.consumption.trim() || !!draft.price.trim();
  return touched && energyColumns(draft) == null;
}

interface Props {
  value: EnergyDraft;
  onChange: (draft: EnergyDraft) => void;
  /** Con marca y modelo se buscan sus versiones y el consumo homologado. */
  make?: string;
  model?: string;
}

type SearchState = { status: 'idle' | 'loading' | 'error' } | { status: 'done'; versions: CarVersion[] };

function versionTitle(version: CarVersion) {
  // Cilindrada con punto, como se nombran los motores ("2.0 TDI").
  const parts = [
    FUEL_INFO[version.fuelType].label,
    version.engineCc ? (version.engineCc / 1000).toFixed(1) : null,
    version.powerCv ? `${version.powerCv} CV` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/** Tipo de energía, consumo medio y precio opcional de un coche. */
export default function VehicleEnergyFields({ value, onChange, make = '', model = '' }: Props) {
  const info = value.fuelType ? FUEL_INFO[value.fuelType] : null;
  const price = parseDecimal(value.price);
  const priceInvalid = !!value.price.trim() && (price == null || price >= 10);
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  const canSearch = make.trim().length >= 2 && model.trim().length >= 1;
  useEffect(() => {
    if (!canSearch) {
      setSearch({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    // Espera a que el usuario deje de escribir antes de consultar.
    const timer = setTimeout(() => {
      setSearch({ status: 'loading' });
      searchCarVersions(make, model, controller.signal)
        .then((versions) => setSearch({ status: 'done', versions }))
        .catch(() => {
          if (!controller.signal.aborted) setSearch({ status: 'error' });
        });
    }, 700);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [make, model, canSearch]);

  const isSelected = (version: CarVersion) =>
    value.fuelType === version.fuelType && parseDecimal(value.consumption) === version.consumption;

  return (
    <View style={styles.wrap}>
      {search.status === 'loading' && (
        <View style={styles.searchRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.hint}>Buscando el consumo del {make.trim()} {model.trim()}…</Text>
        </View>
      )}
      {search.status === 'error' && (
        <Text style={styles.hint}>No se pudo consultar el consumo ahora. Escríbelo a mano.</Text>
      )}
      {search.status === 'done' && search.versions.length === 0 && (
        <Text style={styles.hint}>No encontramos ese modelo. Elige el combustible y escribe el consumo.</Text>
      )}
      {search.status === 'done' && search.versions.length > 0 && (
        <View style={styles.versions}>
          <Text style={styles.hint}>Elige tu versión (consumo real estimado):</Text>
          {search.versions.map((version, i) => {
            const selected = isSelected(version);
            const unit = FUEL_INFO[version.fuelType].unit;
            return (
              <Pressable
                key={version.key}
                style={({ pressed }) => [styles.version, selected && styles.versionSelected, pressed && { opacity: 0.8 }]}
                onPress={() =>
                  onChange({
                    ...value,
                    fuelType: version.fuelType,
                    consumption: formatDecimal(version.consumption, 1),
                  })
                }
              >
                <View style={styles.versionText}>
                  <Text style={styles.versionTitle} numberOfLines={1}>
                    {versionTitle(version)}
                  </Text>
                  <Text style={styles.versionSub} numberOfLines={1}>
                    Oficial {formatDecimal(version.officialConsumption, 1)} {unit}
                    {i === 0 ? ' · la más vendida' : ''}
                  </Text>
                </View>
                <Text style={[styles.versionValue, selected && styles.versionValueSelected]}>
                  {formatDecimal(version.consumption, 1)} {unit}
                </Text>
              </Pressable>
            );
          })}
          <Text style={styles.hint}>¿No está tu versión? Elige el combustible y escribe el consumo.</Text>
        </View>
      )}

      <View style={styles.chips}>
        {FUEL_TYPES.map((fuel) => (
          <Chip
            key={fuel}
            label={FUEL_INFO[fuel].label}
            active={value.fuelType === fuel}
            onPress={() => onChange({ ...value, fuelType: fuel })}
          />
        ))}
      </View>

      {info && (
        <>
          <Input
            placeholder={`Consumo en ${info.unit}/100 km (ej. ${formatDecimal(info.typicalConsumption, 1)})`}
            value={value.consumption}
            onChangeText={(consumption) => onChange({ ...value, consumption })}
            keyboardType="decimal-pad"
          />
          <Input
            placeholder={`Precio €/${info.unit} (opcional)`}
            value={value.price}
            onChangeText={(price) => onChange({ ...value, price })}
            keyboardType="decimal-pad"
          />
          <Text style={[styles.hint, priceInvalid && styles.error]}>
            {priceInvalid
              ? `Precio no válido: escríbelo en euros, por ejemplo ${formatDecimal(info.fallbackPrice)}.`
              : info.productId == null
              ? `El consumo aparece en el ordenador de a bordo. Sin precio usamos ${formatDecimal(info.fallbackPrice)} €/kWh; si cargas en casa, pon el de tu tarifa.`
              : 'El consumo aparece en el ordenador de a bordo. Sin precio, usamos el de las gasolineras cercanas al final de cada trayecto.'}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { ...type.caption, color: colors.textMuted },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  versions: { gap: spacing.sm },
  version: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  versionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  versionText: { flex: 1 },
  versionTitle: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text },
  versionSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  versionValue: { fontFamily: fonts.numeralSemiBold, fontSize: 16, color: colors.textMuted },
  versionValueSelected: { color: colors.accent },
  error: { color: colors.danger },
});
