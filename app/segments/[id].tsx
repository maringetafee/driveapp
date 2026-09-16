import { useCallback, useState } from 'react';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../../src/utils/geo';
import { formatRegularity } from '../../src/utils/segments';
import LinesMap from '../../src/components/LinesMap';
import Avatar from '../../src/components/ui/Avatar';
import Chip from '../../src/components/ui/Chip';
import SectionHeader from '../../src/components/ui/SectionHeader';
import StatRow from '../../src/components/ui/StatRow';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Segment, SegmentEffort } from '../../src/types/database';

type EffortRow = SegmentEffort & { profiles: { username: string } | null };

export default function SegmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useAuthStore((s) => s.session?.user.id);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [segment, setSegment] = useState<Segment | null>(null);
  const [efforts, setEfforts] = useState<EffortRow[]>([]);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([
        supabase.from('segments').select('*').eq('id', id).single(),
        supabase
          .from('segment_efforts')
          .select('*, profiles(username)')
          .eq('segment_id', id)
          .order('speed_stddev_kmh', { ascending: true })
          .limit(500),
        myId
          ? supabase.from('follows').select('followed_id').eq('follower_id', myId).eq('status', 'accepted')
          : Promise.resolve({ data: [] as { followed_id: string }[] }),
      ]).then(([segmentRes, effortsRes, followsRes]) => {
        if (cancelled) return;
        setSegment(segmentRes.data as Segment | null);
        setEfforts((effortsRes.data ?? []) as EffortRow[]);
        setFriendIds(new Set((followsRes.data ?? []).map((f) => f.followed_id)));
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [id, myId])
  );

  const onDelete = () => {
    Alert.alert('Eliminar tramo', 'Se borrarán también todos los intentos registrados.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('segments').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>
          <SkeletonList count={2} />
        </View>
      </SafeAreaView>
    );
  }

  if (!segment) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Text style={[styles.empty, styles.content]}>No se encontró el tramo.</Text>
      </SafeAreaView>
    );
  }

  // Mejor intento (el más regular) de cada conductor.
  const bestByUser = new Map<string, EffortRow>();
  for (const effort of efforts) {
    if (scope === 'friends' && effort.user_id !== myId && !friendIds.has(effort.user_id)) continue;
    if (!bestByUser.has(effort.user_id)) bestByUser.set(effort.user_id, effort);
  }
  const ranking = [...bestByUser.values()];
  const mine = efforts
    .filter((e) => e.user_id === myId)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  const myBest = mine.length ? Math.min(...mine.map((e) => e.speed_stddev_kmh)) : null;
  const myRank = ranking.findIndex((e) => e.user_id === myId);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: segment.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <LinesMap height={220} lines={[{ id: 'segment', shape: segment.geometry, color: colors.accent, width: 5 }]} />

        <StatRow
          items={[
            { label: 'Distancia', value: formatDistance(segment.distance_meters, units) },
            { label: 'Conductores', value: String(new Set(efforts.map((e) => e.user_id)).size) },
            { label: 'Tu posición', value: myRank >= 0 ? `${myRank + 1}º` : '—' },
          ]}
        />

        <Text style={styles.explain}>
          Gana quien conduce más regular: la cifra es cuánto varía la velocidad dentro del tramo. Menos variación
          significa menos acelerones y frenazos, no más velocidad.
        </Text>

        <SectionHeader title="Clasificación" />
        <View style={styles.chips}>
          <Chip label="Todos" active={scope === 'all'} onPress={() => setScope('all')} />
          <Chip label="Amigos" active={scope === 'friends'} onPress={() => setScope('friends')} />
        </View>

        {ranking.length === 0 && <Text style={styles.empty}>Aún nadie ha recorrido este tramo.</Text>}
        {ranking.map((effort, i) => {
          const isMe = effort.user_id === myId;
          return (
            <Pressable
              key={effort.id}
              style={({ pressed }) => [styles.rankRow, isMe && styles.rankRowMe, pressed && { opacity: 0.8 }]}
              onPress={() => router.push(`/trip/${effort.trip_id}`)}
            >
              <Text style={[styles.rankPos, i < 3 && styles.rankPosTop]}>{i + 1}</Text>
              <Avatar username={effort.profiles?.username ?? '?'} size={32} />
              <View style={styles.flex}>
                <Text style={styles.rankName} numberOfLines={1}>
                  {isMe ? 'Tú' : `@${effort.profiles?.username ?? '—'}`}
                </Text>
                <Text style={styles.rankSub}>
                  {formatDuration(effort.duration_seconds)} · {effort.stops} {effort.stops === 1 ? 'parada' : 'paradas'}
                </Text>
              </View>
              <Text style={styles.rankValue}>{formatRegularity(effort.speed_stddev_kmh)}</Text>
            </Pressable>
          );
        })}

        {mine.length > 0 && (
          <>
            <SectionHeader title="Tus intentos" />
            {mine.map((effort) => {
              const best = effort.speed_stddev_kmh === myBest;
              return (
                <Pressable
                  key={effort.id}
                  style={({ pressed }) => [styles.effortRow, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/trip/${effort.trip_id}`)}
                >
                  <View style={styles.flex}>
                    <Text style={styles.rankName}>
                      {new Date(effort.started_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {best ? '  🏅 Tu mejor' : ''}
                    </Text>
                    <Text style={styles.rankSub}>
                      {formatDuration(effort.duration_seconds)} · media {formatSpeed(effort.avg_speed_kmh, units)} ·{' '}
                      {effort.stops} {effort.stops === 1 ? 'parada' : 'paradas'}
                    </Text>
                  </View>
                  <Text style={[styles.rankValue, best && styles.rankValueBest]}>
                    {formatRegularity(effort.speed_stddev_kmh)}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}

        {segment.created_by === myId && (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={styles.delete}>Eliminar tramo</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.md },
  explain: { ...type.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', gap: spacing.sm },
  empty: { ...type.body, color: colors.textMuted },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rankRowMe: { borderColor: colors.accent },
  rankPos: { width: 24, textAlign: 'center', fontFamily: fonts.numeralBold, fontSize: 16, color: colors.textMuted },
  rankPosTop: { color: colors.gold },
  rankName: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text },
  rankSub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  rankValue: { fontFamily: fonts.numeralSemiBold, fontSize: 15, color: colors.text },
  rankValueBest: { color: colors.accent },
  effortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  delete: { ...type.caption, color: colors.danger, textAlign: 'center', marginTop: spacing.lg },
});
