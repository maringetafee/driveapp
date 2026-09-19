import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import { formatLaunchTime } from '../../src/utils/launchTimer';
import { Ionicons } from '@expo/vector-icons';
import Avatar from '../../src/components/ui/Avatar';
import Chip from '../../src/components/ui/Chip';
import EmptyState from '../../src/components/ui/EmptyState';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Group, LeaderboardMetric, LeaderboardPeriod } from '../../src/types/database';

/** Lunes 00:00 de la semana en curso (mismo criterio que date_trunc('week', now()) en Postgres). */
function currentWeekStart(): Date {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // lunes = 0 ... domingo = 6
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0);
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min`;
}

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'total_distance', label: 'Distancia' },
  { key: 'max_speed', label: 'Vel. máxima' },
  { key: 'zero_to_100', label: '0-100 km/h' },
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
  const [metric, setMetric] = useState<LeaderboardMetric>('total_distance');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

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
    if (metric === 'zero_to_100') return formatLaunchTime(row.value);
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
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
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
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text style={styles.title}>{group.name}</Text>
        <Text style={styles.subtitle}>{memberCount} miembro{memberCount === 1 ? '' : 's'}</Text>

        <Pressable style={styles.codeCard} onPress={onShareCode}>
          <Text style={styles.codeLabel}>Código de invitación · toca para compartir</Text>
          <Text style={styles.codeValue}>{group.invite_code}</Text>
        </Pressable>

        {period === 'weekly' && (
          <View style={styles.challengeCard}>
            <View style={styles.challengeTop}>
              <Ionicons name="flame" size={18} color={colors.accent} />
              <Text style={styles.challengeTitle}>Reto semanal · {METRICS.find((m) => m.key === metric)?.label}</Text>
            </View>
            {rows[0] ? (
              <Text style={styles.challengeLeader}>
                🥇 @{rows[0].username} manda con {formatValue(rows[0])}
              </Text>
            ) : (
              <Text style={styles.challengeLeader}>Nadie ha puntuado todavía esta semana.</Text>
            )}
            <Text style={styles.challengeCountdown}>
              Termina en {formatCountdown(currentWeekStart().getTime() + 7 * 24 * 60 * 60 * 1000 - now)}
            </Text>
          </View>
        )}

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
  challengeCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: 4,
  },
  challengeTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  challengeTitle: { ...type.label, color: colors.accent },
  challengeLeader: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text, marginTop: 2 },
  challengeCountdown: { ...type.caption, color: colors.textMuted },
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
