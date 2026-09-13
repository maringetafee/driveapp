import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme/colors';
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Text style={styles.title}>Tu primer coche</Text>
          <Text style={styles.subtitle}>
            Lo usaremos para personalizar tus estadísticas. Podrás añadir más coches luego.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Marca (ej. Volkswagen)"
            placeholderTextColor={colors.textMuted}
            value={make}
            onChangeText={setMake}
          />
          <TextInput
            style={styles.input}
            placeholder="Modelo (ej. Golf GTI)"
            placeholderTextColor={colors.textMuted}
            value={model}
            onChangeText={setModel}
          />

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
          <TextInput
            style={styles.input}
            placeholder="Ciudad (ej. Getafe)"
            placeholderTextColor={colors.textMuted}
            value={city}
            onChangeText={setCity}
          />
          <TextInput
            style={styles.input}
            placeholder="País (ej. España)"
            placeholderTextColor={colors.textMuted}
            value={country}
            onChangeText={setCountry}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={onFinish}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Guardando…' : 'Empezar a conducir'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 12, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  unitsRow: { flexDirection: 'row', gap: 10 },
  unitPill: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unitPillActive: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  unitPillText: { color: colors.textMuted, fontWeight: '600' },
  unitPillTextActive: { color: colors.accent },
  error: { color: colors.danger, fontSize: 13 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.background, fontWeight: '700', fontSize: 16 },
});
