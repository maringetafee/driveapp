import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance, formatDuration } from '../../src/utils/geo';
import type { Trip } from '../../src/types/database';

export default function HistoryScreen() {
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [trips, setTrips] = useState<Trip[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('trips')
        .select('*')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .then(({ data }) => setTrips(data ?? []));
    }, [session])
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={trips}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.header}>Historial</Text>}
        ListEmptyComponent={<Text style={styles.empty}>Aún no has registrado trayectos.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/trip/${item.id}`)}>
            <Text style={styles.date}>
              {new Date(item.started_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
            <View style={styles.row}>
              <Text style={styles.metric}>{formatDistance(item.distance_meters ?? 0, units)}</Text>
              <Text style={styles.metric}>{formatDuration(item.duration_seconds ?? 0)}</Text>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  header: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  date: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 20 },
  metric: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
