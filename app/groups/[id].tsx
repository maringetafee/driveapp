import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import Avatar from '../../src/components/ui/Avatar';
import Chip from '../../src/components/ui/Chip';
import EmptyState from '../../src/components/ui/EmptyState';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Group, LeaderboardMetric, LeaderboardPeriod } from '../../src/types/database';

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'driving_score', label: 'Driving score' },
  { key: 'total_distance', label: 'Distancia' },
  { key: 'max_speed', label: 'Vel. máxima' },
  { key: 'trip_count', label: 'Nº trayectos' },
];

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: 'weekly', label: 'Semana' },
  { key: 'monthly', label: 'Mes' },
  { key: 'all_time', label: 'Histórico' },
];

interface Row {
  user_id: string;
  username: string;
  value: number;
  rank: number;
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useAuthStore((s) => s.session);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  const [metric, setMetric] = useState<LeaderboardMetric>('driving_score');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      supabase
        .from('groups')
        .select('*')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (!cancelled) {
            setGroup(data);
            setGroupLoading(false);
          }
        });
      supabase
        .from('group_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('group_id', id)
        .then(({ count }) => {
          if (!cancelled) setMemberCount(count ?? 0);
        });
      return () => {
        cancelled = true;
      };
    }, [id])
  );

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      supabase
        .rpc('compute_group_leaderboard', { p_group_id: id, p_metric: metric, p_period: period, p_limit: 100 })
        .then(({ data }) => {
          if (cancelled) return;
          setRows((data as Row[]) ?? []);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [id, metric, period])
  );

  const formatValue = (row: Row) => {
    if (metric === 'max_speed') return formatSpeed(row.value, units);
    if (metric === 'total_distance') return formatDistance(row.value, units);
    if (metric === 'driving_score') return row.value.toFixed(0);
    return String(Math.round(row.value));
  };

  const onShareCode = () => {
    if (!group) return;
    Share.share({ message: `Únete a mi grupo "${group.name}" en Roadly con el código: ${group.invite_code}` });
  };

  const onLeave = () => {
    if (!session || !group) return;
    Alert.alert('Salir del grupo', `¿Seguro que quieres salir de "${group.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('group_members').delete().eq('group_id', group.id).eq('user_id', session.user.id);
          router.back();
        },
      },
    ]);
  };

  const onDeleteGroup = () => {
    if (!group) return;
    Alert.alert('Eliminar grupo', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('groups').delete().eq('id', group.id);
          router.back();
        },
      },
    ]);
  };

  if (!group) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          {groupLoading ? (
            <SkeletonList count={1} />
          ) : (
            <EmptyState emoji="🔍" title="Grupo no encontrado" subtitle="Puede que ya no exista o que no tengas acceso." />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = session?.user.id === group.owner_id;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.title}>{group.name}</Text>
        <Text style={styles.subtitle}>{memberCount} miembro{memberCount === 1 ? '' : 's'}</Text>

        <Pressable style={styles.codeCard} onPress={onShareCode}>
          <Text style={styles.codeLabel}>Código de invitación · toca para compartir</Text>
          <Text style={styles.codeValue}>{group.invite_code}</Text>
        </Pressable>

        <View style={styles.filterRow}>
          {METRICS.map((m) => (
            <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />
          ))}
        </View>
        <View style={styles.filterRow}>
          {PERIODS.map((p) => (
            <Chip key={p.key} label={p.label} active={period === p.key} onPress={() => setPeriod(p.key)} />
          ))}
        </View>

        {loading ? (
          <SkeletonList count={4} />
        ) : rows.length === 0 ? (
          <EmptyState emoji="🏆" title="Sin datos todavía" subtitle="Nadie del grupo ha registrado trayectos con este filtro." />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {rows.map((row, index) => (
              <FadeSlideIn key={row.user_id} index={index}>
                <Pressable style={styles.row} onPress={() => router.push(`/u/${row.username}`)}>
                  <Text style={styles.rank}>#{row.rank}</Text>
                  <Avatar username={row.username} size={32} />
                  <Text style={styles.username}>@{row.username}</Text>
                  <Text style={styles.value}>{formatValue(row)}</Text>
                </Pressable>
              </FadeSlideIn>
            ))}
          </View>
        )}

        <Pressable onPress={isOwner ? onDeleteGroup : onLeave} hitSlop={8} style={styles.leaveLink}>
          <Text style={styles.leaveLinkText}>{isOwner ? 'Eliminar grupo' : 'Salir del grupo'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted, marginTop: -spacing.md },
  codeCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  codeLabel: { ...type.caption, color: colors.textMuted },
  codeValue: { fontFamily: fonts.numeralBold, color: colors.accent, fontSize: 26, letterSpacing: 4 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rank: { fontFamily: fonts.numeralSemiBold, fontSize: 15, color: colors.textMuted, width: 28, textAlign: 'center' },
  username: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text, flex: 1 },
  value: { fontFamily: fonts.numeralBold, fontSize: 15, color: colors.accent },
  leaveLink: { alignSelf: 'center', marginTop: spacing.md },
  leaveLinkText: { ...type.caption, color: colors.danger },
});
