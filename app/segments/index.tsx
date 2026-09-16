import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance } from '../../src/utils/geo';
import { formatRegularity } from '../../src/utils/segments';
import EmptyState from '../../src/components/ui/EmptyState';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Segment } from '../../src/types/database';

interface Row {
  segment: Segment;
  attempts: number;
  best: number | null;
}

export default function SegmentsScreen() {
  const myId = useAuthStore((s) => s.session?.user.id);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!myId) return;
      let cancelled = false;
      Promise.all([
        supabase.from('segments').select('*').eq('created_by', myId),
        supabase.from('segment_efforts').select('speed_stddev_kmh, segments(*)').eq('user_id', myId),
      ]).then(([created, efforts]) => {
        if (cancelled) return;
        const byId = new Map<string, Row>();
        for (const segment of (created.data ?? []) as Segment[]) byId.set(segment.id, { segment, attempts: 0, best: null });
        for (const effort of (efforts.data ?? []) as unknown as { speed_stddev_kmh: number; segments: Segment }[]) {
          const row = byId.get(effort.segments.id) ?? { segment: effort.segments, attempts: 0, best: null };
          row.attempts++;
          row.best = row.best == null ? effort.speed_stddev_kmh : Math.min(row.best, effort.speed_stddev_kmh);
          byId.set(effort.segments.id, row);
        }
        setRows([...byId.values()].sort((a, b) => b.attempts - a.attempts));
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [myId])
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(row) => row.segment.id}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Crea tramos desde el resumen de cualquier trayecto (botón «Crear tramo»). Cada vez que pases por uno se
            medirá lo regular que has conducido.
          </Text>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList count={3} />
          ) : (
            <EmptyState
              emoji="🏁"
              title="Aún no tienes tramos"
              subtitle="Abre uno de tus trayectos y pulsa «Crear tramo» para empezar."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
            onPress={() => router.push(`/segments/${item.segment.id}`)}
          >
            <View style={styles.icon}>
              <Ionicons name="flag" size={18} color={colors.accent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {item.segment.name}
              </Text>
              <Text style={styles.sub}>
                {formatDistance(item.segment.distance_meters, units)} · {item.attempts}{' '}
                {item.attempts === 1 ? 'intento' : 'intentos'}
              </Text>
            </View>
            {item.best != null && <Text style={styles.best}>{formatRegularity(item.best)}</Text>}
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md },
  intro: { ...type.caption, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  best: { fontFamily: fonts.numeralSemiBold, fontSize: 14, color: colors.accent },
});
