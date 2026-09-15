import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/state/authStore';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, type } from '../../src/theme/colors';
import Chip from '../../src/components/ui/Chip';
import Input from '../../src/components/ui/Input';
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
          <Text style={styles.eyebrow}>ÚLTIMO PASO</Text>
          <Text style={styles.title}>Tu primer coche</Text>
          <Text style={styles.subtitle}>
            Lo usaremos para personalizar tus estadísticas. Podrás añadir más coches luego.
          </Text>

          <View style={styles.section}>
            <Input placeholder="Marca (ej. Volkswagen)" value={make} onChangeText={setMake} />
            <Input placeholder="Modelo (ej. Golf GTI)" value={model} onChangeText={setModel} />
          </View>

          <Text style={styles.label}>Unidades</Text>
          <View style={styles.unitsRow}>
            {(['kmh', 'mph'] as Units[]).map((u) => (
              <Chip
                key={u}
                label={u === 'kmh' ? 'km/h' : 'mph'}
                active={units === u}
                onPress={() => setUnits(u)}
                style={styles.unitChip}
              />
            ))}
          </View>

          <Text style={styles.label}>Ciudad y país (opcional, para los rankings regionales)</Text>
          <View style={styles.section}>
            <Input placeholder="Ciudad (ej. Getafe)" value={city} onChangeText={setCity} />
            <Input placeholder="País (ej. España)" value={country} onChangeText={setCountry} />
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
  label: { ...type.caption, color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.sm },
  unitsRow: { flexDirection: 'row', gap: spacing.sm },
  unitChip: { flex: 1, paddingVertical: 12 },
  error: { ...type.caption, color: colors.danger, marginTop: spacing.sm },
});
