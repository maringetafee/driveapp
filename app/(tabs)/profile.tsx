import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import type { Vehicle } from '../../src/types/database';
import { disableAutoTracking, enableAutoTracking, isAutoTrackingEnabled } from '../../src/background/autoTripTask';
import BadgesRow from '../../src/components/BadgesRow';

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
              <Text style={styles.username}>{profile?.username ?? '—'}</Text>
              {profile?.username && (
                <Pressable onPress={() => router.push(`/u/${profile.username}`)}>
                  <Text style={styles.viewPublicLink}>Ver perfil público</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.autoTrackRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.autoTrackTitle}>Detección automática</Text>
                <Text style={styles.autoTrackSubtitle}>
                  Registra trayectos en segundo plano sin pulsar iniciar/terminar.
                </Text>
              </View>
              <Switch value={autoTracking} onValueChange={onToggleAutoTracking} />
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
                  placeholderTextColor={colors.textMuted}
                  value={newMake}
                  onChangeText={setNewMake}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Modelo"
                  placeholderTextColor={colors.textMuted}
                  value={newModel}
                  onChangeText={setNewModel}
                />
                <Pressable
                  style={styles.addVehicleButton}
                  onPress={onAddVehicle}
                  disabled={savingVehicle || !newMake.trim() || !newModel.trim()}
                >
                  <Text style={styles.addVehicleButtonText}>{savingVehicle ? 'Guardando…' : 'Guardar coche'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Aún no has añadido coches.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/vehicle/${item.id}`)}>
            <Text style={styles.vehicleName}>
              {item.make} {item.model}
              {item.year ? ` · ${item.year}` : ''}
            </Text>
            {item.is_default && <Text style={styles.defaultBadge}>Principal</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable style={styles.signOut} onPress={() => signOut()}>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  headerBlock: { marginBottom: 16, gap: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  username: { color: colors.text, fontSize: 28, fontWeight: '800' },
  viewPublicLink: { color: colors.accentAlt, fontSize: 13 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  garageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addVehicleForm: { gap: 8 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  addVehicleButton: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  addVehicleButtonText: { color: colors.background, fontWeight: '700' },
  autoTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  autoTrackTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  autoTrackSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  defaultBadge: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  signOut: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  signOutText: { color: colors.danger, fontWeight: '700' },
});
