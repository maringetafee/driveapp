import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import type { Units } from '../../src/types/database';

export default function OnboardingScreen() {
  const session = useAuthStore((s) => s.session);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [units, setUnits] = useState<Units>('kmh');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const onFinish = async () => {
    if (!session) return;
    setError(null);
    setLoading(true);
    try {
      if (make.trim() && model.trim()) {
        const { error: vehicleError } = await supabase.from('vehicles').insert({
          user_id: session.user.id,
          make: make.trim(),
          model: model.trim(),
          is_default: true,
        });
        if (vehicleError) throw vehicleError;
      }
      await completeOnboarding({
        units,
        city: city.trim() || undefined,
        country: country.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (key: string) => [styles.input, focused === key && styles.inputFocused];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>PASO 1 DE 1</Text>
          <Text style={styles.title}>Tu primer coche</Text>
          <Text style={styles.subtitle}>
            Lo usaremos para personalizar tus estadísticas. Podrás añadir más coches luego.
          </Text>

          <View style={styles.section}>
            <TextInput
              style={inputStyle('make')}
              placeholder="Marca (ej. Volkswagen)"
              placeholderTextColor={colors.textFaint}
              value={make}
              onChangeText={setMake}
              onFocus={() => setFocused('make')}
              onBlur={() => setFocused(null)}
            />
            <TextInput
              style={inputStyle('model')}
              placeholder="Modelo (ej. Golf GTI)"
              placeholderTextColor={colors.textFaint}
              value={model}
              onChangeText={setModel}
              onFocus={() => setFocused('model')}
              onBlur={() => setFocused(null)}
            />
          </View>

          <Text style={styles.label}>Unidades</Text>
          <View style={styles.unitsRow}>
            {(['kmh', 'mph'] as Units[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => setUnits(u)}
                style={[styles.unitPill, units === u && styles.unitPillActive]}
              >
                <Text style={[styles.unitPillText, units === u && styles.unitPillTextActive]}>
                  {u === 'kmh' ? 'km/h' : 'mph'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Ciudad y país (opcional, para los rankings regionales)</Text>
          <View style={styles.section}>
            <TextInput
              style={inputStyle('city')}
              placeholder="Ciudad (ej. Getafe)"
              placeholderTextColor={colors.textFaint}
              value={city}
              onChangeText={setCity}
              onFocus={() => setFocused('city')}
              onBlur={() => setFocused(null)}
            />
            <TextInput
              style={inputStyle('country')}
              placeholder="País (ej. España)"
              placeholderTextColor={colors.textFaint}
              value={country}
              onChangeText={setCountry}
              onFocus={() => setFocused('country')}
              onBlur={() => setFocused(null)}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <PrimaryButton
            title="Empezar a conducir"
            onPress={onFinish}
            loading={loading}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  eyebrow: { ...type.label, color: colors.accent, marginBottom: spacing.sm },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.lg },
  section: { gap: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    color: colors.text,
    fontSize: 16,
  },
  inputFocused: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  label: { ...type.caption, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  unitsRow: { flexDirection: 'row', gap: spacing.sm },
  unitPill: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unitPillActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitPillText: { color: colors.textMuted, fontWeight: '700' },
  unitPillTextActive: { color: colors.accent },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
});
