import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../../src/lib/supabase';
import { colors } from '../../src/theme/colors';

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

        <Pressable
          style={styles.generateButton}
          onPress={onGenerate}
          disabled={!sourceImage || generating}
        >
          {generating ? <ActivityIndicator color={colors.background} /> : <Text style={styles.generateButtonText}>Generar</Text>}
        </Pressable>

        {resultUri && (
          <View style={styles.resultBlock}>
            <Image source={{ uri: resultUri }} style={styles.image} />
            <Pressable style={styles.saveButton} onPress={onSaveAsVehiclePhoto} disabled={saving}>
              <Text style={styles.saveButtonText}>{saving ? 'Guardando…' : 'Usar como foto del coche'}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 14 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  imagePicker: {
    height: 200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerText: { color: colors.textMuted },
  image: { width: '100%', height: '100%', borderRadius: 16 },
  label: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  presetRow: { gap: 8 },
  presetPill: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  presetPillActive: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  presetText: { color: colors.textMuted, fontSize: 13 },
  presetTextActive: { color: colors.accent },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13 },
  generateButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  generateButtonText: { color: colors.background, fontWeight: '700', fontSize: 16 },
  resultBlock: { gap: 12 },
  saveButton: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveButtonText: { color: colors.accent, fontWeight: '700' },
});
