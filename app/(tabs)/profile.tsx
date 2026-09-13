import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import type { Vehicle } from '../../src/types/database';
import { disableAutoTracking, enableAutoTracking, isAutoTrackingEnabled } from '../../src/background/autoTripTask';
import BadgesRow from '../../src/components/BadgesRow';
import Avatar from '../../src/components/ui/Avatar';
import PrimaryButton from '../../src/components/ui/PrimaryButton';

export default function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [autoTracking, setAutoTracking] = useState(false);
  const [autoTrackingError, setAutoTrackingError] = useState<string | null>(null);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [newMake, setNewMake] = useState('');
  const [newModel, setNewModel] = useState('');
  const [savingVehicle, setSavingVehicle] = useState(false);

  useEffect(() => {
    isAutoTrackingEnabled().then(setAutoTracking);
  }, []);

  const onToggleAutoTracking = async (value: boolean) => {
    setAutoTrackingError(null);
    if (value) {
      const result = await enableAutoTracking();
      if (!result.ok) {
        setAutoTrackingError(result.error ?? 'No se pudo activar.');
        return;
      }
      setAutoTracking(true);
    } else {
      await disableAutoTracking();
      setAutoTracking(false);
    }
  };

  const loadVehicles = useCallback(() => {
    if (!session) return;
    supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setVehicles(data ?? []));
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadVehicles();
    }, [loadVehicles])
  );

  const onAddVehicle = async () => {
    if (!session || !newMake.trim() || !newModel.trim()) return;
    setSavingVehicle(true);
    await supabase.from('vehicles').insert({
      user_id: session.user.id,
      make: newMake.trim(),
      model: newModel.trim(),
      is_default: vehicles.length === 0,
    });
    setSavingVehicle(false);
    setNewMake('');
    setNewModel('');
    setAddingVehicle(false);
    loadVehicles();
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={vehicles}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.headerRow}>
              <Avatar username={profile?.username ?? '?'} size={56} />
              <View style={{ flex: 1 }}>
                <Text style={styles.username}>{profile?.username ?? '—'}</Text>
                {profile?.username && (
                  <Pressable onPress={() => router.push(`/u/${profile.username}`)}>
                    <Text style={styles.viewPublicLink}>Ver perfil público ›</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.autoTrackRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoTrackTitle}>Detección automática</Text>
                <Text style={styles.autoTrackSubtitle}>
                  Registra trayectos en segundo plano sin pulsar iniciar/terminar.
                </Text>
              </View>
              <Switch
                value={autoTracking}
                onValueChange={onToggleAutoTracking}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
              />
            </View>
            {autoTrackingError && <Text style={styles.error}>{autoTrackingError}</Text>}

            {session && <BadgesRow userId={session.user.id} />}

            <View style={styles.garageHeaderRow}>
              <Text style={styles.subtitle}>Garaje</Text>
              <Pressable onPress={() => setAddingVehicle((v) => !v)}>
                <Text style={styles.viewPublicLink}>{addingVehicle ? 'Cancelar' : '+ Añadir coche'}</Text>
              </Pressable>
            </View>

            {addingVehicle && (
              <View style={styles.addVehicleForm}>
                <TextInput
                  style={styles.input}
                  placeholder="Marca"
                  placeholderTextColor={colors.textFaint}
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Modelo"
                  placeholderTextColor={colors.textFaint}
                  value={newModel}
                  onChangeText={setNewModel}
                />
                <PrimaryButton
                  title="Guardar coche"
                  onPress={onAddVehicle}
                  loading={savingVehicle}
                  disabled={!newMake.trim() || !newModel.trim()}
                />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Aún no has añadido coches.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(`/vehicle/${item.id}`)}
          >
            <View style={[styles.vehicleDot, item.is_default && styles.vehicleDotActive]} />
            <Text style={styles.vehicleName}>
              {item.make} {item.model}
              {item.year ? ` · ${item.year}` : ''}
            </Text>
            {item.is_default && <Text style={styles.defaultBadge}>Principal</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          <PrimaryButton title="Cerrar sesión" onPress={() => signOut()} variant="ghost" style={{ marginTop: spacing.xl }} />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  headerBlock: { marginBottom: spacing.sm, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  username: { ...type.title, color: colors.text },
  viewPublicLink: { color: colors.accentAlt, ...type.caption, fontWeight: '700', marginTop: 2 },
  subtitle: { ...type.subheading, color: colors.text, marginTop: spacing.sm },
  garageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addVehicleForm: { gap: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  autoTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  autoTrackTitle: { ...type.subheading, color: colors.text },
  autoTrackSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  vehicleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  vehicleDotActive: { backgroundColor: colors.accent },
  vehicleName: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  defaultBadge: { color: colors.accent, fontSize: 12, fontWeight: '800' },
});
