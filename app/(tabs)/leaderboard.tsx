import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import Avatar from '../../src/components/ui/Avatar';
import Chip from '../../src/components/ui/Chip';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import EmptyState from '../../src/components/ui/EmptyState';
import { SkeletonList } from '../../src/components/ui/Skeleton';

import type { LeaderboardMetric, LeaderboardPeriod, LeaderboardScope } from '../../src/types/database';

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'max_speed', label: 'Vel. máxima' },
  { key: 'total_distance', label: 'Distancia' },
  { key: 'driving_score', label: 'Driving score' },
  { key: 'trip_count', label: 'Nº trayectos' },
];

const SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: 'friends', label: 'Amigos' },
  { key: 'city', label: 'Ciudad' },
  { key: 'country', label: 'País' },
  { key: 'global', label: 'Global' },
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

interface RecordItem {
  emoji: string;
  label: string;
  username: string;
  value: string;
}

export default function LeaderboardScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const units = profile?.units ?? 'kmh';

  const [metric, setMetric] = useState<LeaderboardMetric>('driving_score');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordItem[] | null>(null);

  const scopeValue = scope === 'city' ? profile?.city ?? null : scope === 'country' ? profile?.country ?? null : null;
  const scopeUnavailable = (scope === 'city' && !profile?.city) || (scope === 'country' && !profile?.country);

  const loadRows = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!session || scopeUnavailable) {
        setRows([]);
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase.rpc('compute_leaderboard', {
        p_metric: metric,
        p_scope: scope,
        p_scope_value: scopeValue,
        p_period: period,
        p_limit: 200,
      });
      if (error) setErrorMsg(error.message);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    },
    [session, metric, scope, period, scopeValue, scopeUnavailable]
  );

  useFocusEffect(
    useCallback(() => {
      loadRows();
    }, [loadRows])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRows({ silent: true });
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;

      Promise.all([
        supabase.rpc('compute_leaderboard', {
          p_metric: 'max_speed',
          p_scope: 'global',
          p_scope_value: null,
          p_period: 'all_time',
          p_limit: 1,
        }),
        supabase.rpc('compute_leaderboard', {
          p_metric: 'driving_score',
          p_scope: 'global',
          p_scope_value: null,
          p_period: 'all_time',
          p_limit: 1,
        }),
        supabase.rpc('compute_leaderboard', {
          p_metric: 'total_distance',
          p_scope: 'global',
          p_scope_value: null,
          p_period: 'all_time',
          p_limit: 1,
        }),
      ]).then(([speedRes, scoreRes, distRes]) => {
        if (cancelled) return;
        const items: RecordItem[] = [];
        const s = (speedRes.data as Row[] | null)?.[0];
        if (s) items.push({ emoji: '🏁', label: 'Vel. máxima', username: s.username, value: formatSpeed(s.value, units) });
        const sc = (scoreRes.data as Row[] | null)?.[0];
        if (sc) items.push({ emoji: '🎯', label: 'Mejor score', username: sc.username, value: sc.value.toFixed(0) });
        const d = (distRes.data as Row[] | null)?.[0];
        if (d) items.push({ emoji: '🛣️', label: 'Mayor distancia', username: d.username, value: formatDistance(d.value, units) });
        setRecords(items);
      });

      return () => {
        cancelled = true;
      };
    }, [session, units])
  );

  const formatValue = (row: Row) => {
    if (metric === 'max_speed') return formatSpeed(row.value, units);
    if (metric === 'total_distance') return formatDistance(row.value, units);
    if (metric === 'driving_score') return row.value.toFixed(0);
    return String(Math.round(row.value));
  };

  const myRankIndex = rows.findIndex((r) => r.user_id === session?.user.id);
  const top3 = rows.filter((r) => r.rank <= 3);
  const restRows = rows.filter((r) => r.rank > 3).slice(0, 27);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.topRow}>
          <Text style={styles.screenTitle}>Ranking</Text>
          <Pressable style={styles.groupsButton} onPress={() => router.push('/groups')} hitSlop={8}>
            <Ionicons name="people" size={15} color={colors.text} />
            <Text style={styles.groupsButtonText}>Grupos</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {METRICS.map((opt) => (
            <Chip key={opt.key} label={opt.label} active={metric === opt.key} onPress={() => setMetric(opt.key)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {SCOPES.map((opt) => (
            <Chip key={opt.key} label={opt.label} active={scope === opt.key} onPress={() => setScope(opt.key)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {PERIODS.map((opt) => (
            <Chip key={opt.key} label={opt.label} active={period === opt.key} onPress={() => setPeriod(opt.key)} />
          ))}
        </ScrollView>
      </View>

      {records && records.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recordsRow}>
          {records.map((r) => (
            <Pressable key={r.label} style={styles.recordCard} onPress={() => router.push(`/u/${r.username}`)}>
              <Text style={styles.recordEmoji}>{r.emoji}</Text>
              <Text style={styles.recordValue}>{r.value}</Text>
              <Text style={styles.recordLabel}>{r.label}</Text>
              <Text style={styles.recordUsername} numberOfLines={1}>
                @{r.username}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {scopeUnavailable ? (
        <View style={styles.centered}>
          <EmptyState
            emoji="📍"
            title="Falta tu ubicación"
            subtitle={`Añade tu ${scope === 'city' ? 'ciudad' : 'país'} en el perfil para ver este ranking.`}
          />
        </View>
      ) : loading ? (
        <View style={styles.list}>
          <SkeletonList />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState emoji="🏆" title="Sin datos todavía" subtitle="Nadie ha registrado trayectos con este filtro aún." />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        >
          {top3.length > 0 && <Podium rows={top3} formatValue={formatValue} />}

          {restRows.map((item, index) => (
            <FadeSlideIn key={item.user_id} index={index}>
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  item.user_id === session?.user.id && styles.rowMe,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push(`/u/${item.username}`)}
              >
                <Text style={styles.rank}>#{item.rank}</Text>
                <Avatar username={item.username} size={32} />
                <Text style={styles.username}>@{item.username}</Text>
                <Text style={styles.value}>{formatValue(item)}</Text>
              </Pressable>
            </FadeSlideIn>
          ))}

          {myRankIndex >= 0 && rows[myRankIndex].rank > 30 && (
            <View style={[styles.row, styles.rowMe, styles.rowMePinned]}>
              <Text style={styles.rank}>#{rows[myRankIndex].rank}</Text>
              <Avatar username={rows[myRankIndex].username} size={32} />
              <Text style={styles.username}>@{rows[myRankIndex].username} (tú)</Text>
              <Text style={styles.value}>{formatValue(rows[myRankIndex])}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </SafeAreaView>
  );
}

function Podium({ rows, formatValue }: { rows: Row[]; formatValue: (r: Row) => string }) {
  const first = rows.find((r) => r.rank === 1);
  const second = rows.find((r) => r.rank === 2);
  const third = rows.find((r) => r.rank === 3);

  return (
    <View style={styles.podiumRow}>
      <PodiumSlot row={second} place={2} color={colors.silver} avatarSize={44} riserHeight={52} formatValue={formatValue} />
      <PodiumSlot row={first} place={1} color={colors.gold} avatarSize={64} riserHeight={76} formatValue={formatValue} />
      <PodiumSlot row={third} place={3} color={colors.bronze} avatarSize={44} riserHeight={40} formatValue={formatValue} />
    </View>
  );
}

function PodiumSlot({
  row,
  place,
  color,
  avatarSize,
  riserHeight,
  formatValue,
}: {
  row?: Row;
  place: 1 | 2 | 3;
  color: string;
  avatarSize: number;
  riserHeight: number;
  formatValue: (r: Row) => string;
}) {
  if (!row) return <View style={styles.podiumSlot} />;
  return (
    <Pressable style={styles.podiumSlot} onPress={() => router.push(`/u/${row.username}`)}>
      {place === 1 && <Ionicons name="trophy" size={22} color={color} style={styles.podiumTrophy} />}
      <Avatar username={row.username} size={avatarSize} />
      <Text style={styles.podiumUsername} numberOfLines={1}>
        @{row.username}
      </Text>
      <Text style={[styles.podiumValue, { color }]}>{formatValue(row)}</Text>
      <View style={[styles.podiumRiser, { height: riserHeight, backgroundColor: color }]}>
        <Text style={styles.podiumRiserRank}>{place}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filters: { paddingTop: spacing.md, gap: spacing.sm },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  screenTitle: { ...type.title, color: colors.text },
  groupsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  groupsButtonText: { ...type.caption, fontFamily: fonts.bodyBold, color: colors.text },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  recordsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  recordCard: {
    width: 128,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  recordEmoji: { fontSize: 18, marginBottom: 4 },
  recordValue: { ...type.subheading, fontFamily: fonts.numeralBold, color: colors.text },
  recordLabel: { ...type.caption, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  recordUsername: { ...type.label, color: colors.accent, marginTop: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  list: { padding: spacing.lg, gap: spacing.sm },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  podiumSlot: { flex: 1, alignItems: 'center', gap: 6 },
  podiumTrophy: { marginBottom: 2 },
  podiumUsername: { ...type.caption, color: colors.text, maxWidth: 92 },
  podiumValue: { fontFamily: fonts.numeralBold, fontSize: 16, color: colors.text, marginBottom: spacing.sm },
  podiumRiser: {
    width: '100%',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  podiumRiserRank: { fontFamily: fonts.numeralBold, fontSize: 18, color: colors.onAccent },
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
  rowPressed: { backgroundColor: colors.surfaceAlt },
  rowMe: { borderColor: colors.accent, borderWidth: 1.5 },
  rowMePinned: { marginTop: spacing.sm },
  rank: { fontFamily: fonts.numeralSemiBold, fontSize: 15, color: colors.textMuted, width: 28, textAlign: 'center' },
  username: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text, flex: 1 },
  value: { fontFamily: fonts.numeralBold, fontSize: 15, color: colors.accent },
  error: { ...type.caption, color: colors.danger, textAlign: 'center', paddingBottom: 12 },
});
