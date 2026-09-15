import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useAuthStore } from '../src/state/authStore';
import { colors, radius, spacing, type } from '../src/theme/colors';
import { disableAutoTracking, enableAutoTracking, isAutoTrackingEnabled } from '../src/background/autoTripTask';
import PrimaryButton from '../src/components/ui/PrimaryButton';
import type { Units } from '../src/types/database';

export default function SettingsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const email = useAuthStore((s) => s.session?.user.email);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  const [city, setCity] = useState(profile?.city ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [focused, setFocused] = useState<'city' | 'country' | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const [autoTracking, setAutoTracking] = useState(false);
  const [autoTrackingError, setAutoTrackingError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'units' | 'privacy' | 'delete' | null>(null);

  useEffect(() => {
    isAutoTrackingEnabled().then(setAutoTracking);
  }, []);

  const locationDirty = city.trim() !== (profile?.city ?? '') || country.trim() !== (profile?.country ?? '');

  const run = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
    } catch (e) {
      Alert.alert('Algo ha fallado', e instanceof Error ? e.message : fallback);
    }
  };

  const onSaveLocation = async () => {
    setSavingLocation(true);
    await run(
      () => updateProfile({ city: city.trim() || null, country: country.trim() || null }),
      'No se pudo guardar tu ubicación.'
    );
    setSavingLocation(false);
  };

  const onChangeUnits = async (units: Units) => {
    if (units === profile?.units) return;
    setBusy('units');
    await run(() => updateProfile({ units }), 'No se pudieron cambiar las unidades.');
    setBusy(null);
  };

  const onTogglePrivacy = async (value: boolean) => {
    setBusy('privacy');
    await run(() => updateProfile({ is_private: value }), 'No se pudo cambiar la privacidad.');
    setBusy(null);
  };

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

  const onSignOut = async () => {
    await disableAutoTracking().catch(() => {});
    await signOut();
  };

  const onDeleteAccount = () => {
    Alert.alert(
      '¿Eliminar tu cuenta?',
      'Se borrarán para siempre tu perfil, tus coches, tus trayectos, tus insignias y los grupos que hayas creado. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar cuenta',
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            await disableAutoTracking().catch(() => {});
            await run(deleteAccount, 'No se pudo eliminar la cuenta.');
            setBusy(null);
          },
        },
      ]
    );
  };

  const inputStyle = (key: 'city' | 'country') => [styles.input, focused === key && styles.inputFocused];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Section title="Ubicación" footer="Se usa para los rankings de tu ciudad y de tu país.">
            <TextInput
              style={inputStyle('city')}
              placeholder="Ciudad"
              placeholderTextColor={colors.textFaint}
              value={city}
              onChangeText={setCity}
              onFocus={() => setFocused('city')}
              onBlur={() => setFocused(null)}
              maxLength={60}
            />
            <TextInput
              style={inputStyle('country')}
              placeholder="País"
              placeholderTextColor={colors.textFaint}
              value={country}
              onChangeText={setCountry}
              onFocus={() => setFocused('country')}
              onBlur={() => setFocused(null)}
              maxLength={60}
            />
            <PrimaryButton
              title="Guardar ubicación"
              onPress={onSaveLocation}
              loading={savingLocation}
              disabled={!locationDirty}
            />
          </Section>

          <Section title="Unidades">
            <View style={styles.segment}>
              {(['kmh', 'mph'] as Units[]).map((u) => {
                const active = (profile?.units ?? 'kmh') === u;
                return (
                  <Pressable
                    key={u}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    onPress={() => onChangeUnits(u)}
                    disabled={busy === 'units'}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {u === 'kmh' ? 'Kilómetros (km/h)' : 'Millas (mph)'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Privacidad">
            <ToggleRow
              title="Cuenta privada"
              subtitle="Solo tus seguidores aceptados verán tus trayectos, coches y estadísticas."
              value={profile?.is_private ?? false}
              onValueChange={onTogglePrivacy}
              disabled={busy === 'privacy'}
            />
          </Section>

          <Section title="Trayectos">
            <ToggleRow
              title="Detección automática"
              subtitle="Registra trayectos en segundo plano sin pulsar iniciar/terminar."
              value={autoTracking}
              onValueChange={onToggleAutoTracking}
            />
            {autoTrackingError && <Text style={styles.error}>{autoTrackingError}</Text>}
          </Section>

          <Section title="Cuenta">
            {email && (
              <View style={styles.emailRow}>
                <Text style={styles.emailLabel}>Email</Text>
                <Text style={styles.emailValue} numberOfLines={1}>
                  {email}
                </Text>
              </View>
            )}
            <PrimaryButton title="Cerrar sesión" variant="ghost" onPress={onSignOut} />
          </Section>

          <Pressable
            onPress={onDeleteAccount}
            disabled={busy === 'delete'}
            hitSlop={8}
            style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.deleteText}>{busy === 'delete' ? 'Eliminando cuenta…' : 'Eliminar cuenta'}</Text>
          </Pressable>

          <Text style={styles.version}>Roadly · versión {Constants.expoConfig?.version ?? '—'}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
      {footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { ...type.label, color: colors.textFaint, marginLeft: spacing.xs },
  sectionFooter: { ...type.caption, color: colors.textFaint, fontWeight: '500', marginLeft: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.text,
    fontSize: 15,
  },
  inputFocused: { borderColor: colors.accent },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentItem: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  segmentItemActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  segmentText: { ...type.caption, color: colors.textMuted },
  segmentTextActive: { color: colors.accent, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleTitle: { ...type.subheading, color: colors.text },
  toggleSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2, fontWeight: '500' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  emailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  emailLabel: { ...type.body, color: colors.textMuted },
  emailValue: { ...type.body, color: colors.text, fontWeight: '600', flexShrink: 1 },
  deleteButton: { alignSelf: 'center', paddingVertical: spacing.sm },
  deleteText: { color: colors.danger, ...type.body, fontWeight: '700' },
  version: { ...type.caption, color: colors.textFaint, textAlign: 'center', fontWeight: '500' },
});
