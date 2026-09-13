import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import PrimaryButton from '../../src/components/ui/PrimaryButton';

const STYLE_PRESETS = ['Wide body deportivo', 'JDM bajado', 'Off-road elevado', 'Look eléctrico neón'];

export default function ModCarScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();

  const [sourceImage, setSourceImage] = useState<{ uri: string; base64: string } | null>(null);
  const [prompt, setPrompt] = useState('');
  const [resultUri, setResultUri] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      setError('Permiso de galería denegado.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setSourceImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
      setResultUri(null);
    }
  };

  const onGenerate = async () => {
    if (!sourceImage) return;
    setGenerating(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mod-car', {
        body: { imageBase64: sourceImage.base64, prompt: prompt.trim() || STYLE_PRESETS[0] },
      });
      if (fnError) throw fnError;
      if (!data?.imageBase64) throw new Error('La función no devolvió una imagen.');
      setResultUri(`data:image/png;base64,${data.imageBase64}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo generar la imagen. Revisa que la Edge Function "mod-car" esté desplegada.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const onSaveAsVehiclePhoto = async () => {
    if (!resultUri) return;
    setSaving(true);
    setError(null);
    try {
      const base64 = resultUri.split(',')[1];
      const path = `${vehicleId}/mod-car-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage
        .from('vehicle-photos')
        .upload(path, decodeBase64(base64), { contentType: 'image/png', upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('vehicle-photos').getPublicUrl(path);
      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ image_url: publicUrlData.publicUrl })
        .eq('id', vehicleId);
      if (updateError) throw updateError;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la foto del coche.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.title}>Mod Car</Text>
        <Text style={styles.subtitle}>
          Sube una foto de tu coche y genera una versión modificada solo estética con IA, para tu perfil.
        </Text>

        <Pressable style={styles.imagePicker} onPress={pickImage}>
          {sourceImage ? (
            <Image source={{ uri: sourceImage.uri }} style={styles.image} />
          ) : (
            <Text style={styles.imagePickerText}>Toca para elegir una foto</Text>
          )}
        </Pressable>

        <Text style={styles.label}>Estilo</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
          {STYLE_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.presetPill, prompt === preset && styles.presetPillActive]}
              onPress={() => setPrompt(preset)}
            >
              <Text style={[styles.presetText, prompt === preset && styles.presetTextActive]}>{preset}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={styles.input}
          placeholder="O describe tu propio estilo…"
          placeholderTextColor={colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <PrimaryButton
          title="✨ Generar"
          onPress={onGenerate}
          disabled={!sourceImage}
          loading={generating}
        />

        {resultUri && (
          <View style={styles.resultBlock}>
            <Image source={{ uri: resultUri }} style={styles.image} />
            <PrimaryButton
              title={saving ? 'Guardando…' : 'Usar como foto del coche'}
              onPress={onSaveAsVehiclePhoto}
              loading={saving}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...type.heading, color: colors.text, fontSize: 26 },
  subtitle: { ...type.body, color: colors.textMuted, lineHeight: 19 },
  imagePicker: {
    height: 200,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerText: { color: colors.textMuted, fontWeight: '600' },
  image: { width: '100%', height: '100%', borderRadius: radius.xl },
  label: { ...type.caption, color: colors.textMuted, marginTop: spacing.xs },
  presetRow: { gap: spacing.sm },
  presetPill: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  presetPillActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  presetText: { color: colors.textMuted, ...type.caption },
  presetTextActive: { color: colors.accent },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  resultBlock: { gap: spacing.md },
});
