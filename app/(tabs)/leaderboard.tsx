import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import { formatLaunchTime } from '../../src/utils/launchTimer';
import Avatar from '../../src/components/ui/Avatar';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import EmptyState from '../../src/components/ui/EmptyState';
import type { LeaderboardMetric, LeaderboardPeriod, LeaderboardScope } from '../../src/types/database';

const METRICS: { key: LeaderboardMetric; label: string }[] = [
  { key: 'driving_score', label: 'Driving score' },
  { key: 'total_distance', label: 'Distancia' },
  { key: 'max_speed', label: 'Vel. máxima' },
  { key: 'zero_to_100', label: '0-100 km/h' },
  { key: 'trip_count', label: 'Nº trayectos' },
];

const SCOPES: { key: LeaderboardScope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'friends', label: 'Amigos' },
  { key: 'city', label: 'Ciudad' },
  { key: 'country', label: 'País' },
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
      if (error) setErrorMsg('No se pudo cargar el ranking. Desliza hacia abajo para reintentar.');
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

      const best = (p_metric: LeaderboardMetric) =>
        supabase.rpc('compute_leaderboard', {
          p_metric,
          p_scope: 'global',
          p_scope_value: null,
          p_period: 'all_time',
          p_limit: 1,
        });

      Promise.all([best('max_speed'), best('zero_to_100'), best('driving_score'), best('total_distance')]).then(
        ([speedRes, launchRes, scoreRes, distRes]) => {
          if (cancelled) return;
          const items: RecordItem[] = [];
          const s = (speedRes.data as Row[] | null)?.[0];
          if (s) items.push({ emoji: '🏁', label: 'Vel. máxima', username: s.username, value: formatSpeed(s.value, units) });
          const l = (launchRes.data as Row[] | null)?.[0];
          if (l) items.push({ emoji: '🚀', label: 'Mejor 0-100', username: l.username, value: formatLaunchTime(l.value) });
          const sc = (scoreRes.data as Row[] | null)?.[0];
          if (sc) items.push({ emoji: '🎯', label: 'Mejor score', username: sc.username, value: sc.value.toFixed(0) });
          const d = (distRes.data as Row[] | null)?.[0];
          if (d) items.push({ emoji: '🛣️', label: 'Más kilómetros', username: d.username, value: formatDistance(d.value, units) });
          setRecords(items);
        }
      );

      return () => {
        cancelled = true;
      };
    }, [session, units])
  );

  const formatValue = (row: Row) => {
    if (metric === 'max_speed') return formatSpeed(row.value, units);
    if (metric === 'total_distance') return formatDistance(row.value, units);
    if (metric === 'zero_to_100') return formatLaunchTime(row.value);
    if (metric === 'driving_score') return row.value.toFixed(0);
    return String(Math.round(row.value));
  };

  const myRankIndex = rows.findIndex((r) => r.user_id === session?.user.id);
  const top3 = rows.filter((r) => r.rank <= 3);
  const restRows = rows.filter((r) => r.rank > 3).slice(0, 27);

  const emptySubtitle =
    period === 'weekly'
      ? 'Nadie ha conducido todavía esta semana. ¡Sé el primero en el podio!'
      : period === 'monthly'
        ? 'Nadie ha conducido todavía este mes.'
        : 'Nadie ha registrado trayectos con este filtro aún.';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.topRow}>
          <Text style={styles.screenTitle}>Ranking</Text>
          <Pressable style={styles.groupsButton} onPress={() => router.push('/groups')} hitSlop={8}>
            <Text style={styles.groupsButtonText}>👥 Grupos</Text>
          </Pressable>
        </View>
        <FilterRow options={METRICS} value={metric} onChange={setMetric} />
        <FilterRow options={SCOPES} value={scope} onChange={setScope} />
        <FilterRow options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {scopeUnavailable ? (
          <EmptyState
            emoji="📍"
            title="Falta tu ubicación"
            subtitle={`Añade tu ${scope === 'city' ? 'ciudad' : 'país'} en Ajustes para ver este ranking.`}
          />
        ) : loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loader} />
        ) : rows.length === 0 ? (
          <EmptyState emoji="🏆" title="Sin datos todavía" subtitle={emptySubtitle} />
        ) : (
          <>
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
          </>
        )}

        {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

        {records && records.length > 0 && (
          <View style={styles.recordsBlock}>
            <Text style={styles.recordsLabel}>RÉCORDS DE ROADLY</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.recordsScroll}
              contentContainerStyle={styles.recordsRow}
            >
              {records.map((r) => (
                <Pressable
                  key={r.label}
                  style={({ pressed }) => [styles.recordCard, pressed && styles.rowPressed]}
                  onPress={() => router.push(`/u/${r.username}`)}
                >
                  <Text style={styles.recordEmoji}>{r.emoji}</Text>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={styles.recordValue}>{r.value}</Text>
                    <Text style={styles.recordLabel}>{r.label}</Text>
                    <Text style={styles.recordUsername} numberOfLines={1}>
                      @{r.username}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Podium({ rows, formatValue }: { rows: Row[]; formatValue: (r: Row) => string }) {
  const first = rows.find((r) => r.rank === 1);
  const second = rows.find((r) => r.rank === 2);
  const third = rows.find((r) => r.rank === 3);

  return (
    <View style={styles.podiumRow}>
      <PodiumSlot row={second} color={colors.silver} avatarSize={40} formatValue={formatValue} />
      <PodiumSlot row={first} color={colors.gold} avatarSize={56} emphasis formatValue={formatValue} />
      <PodiumSlot row={third} color={colors.bronze} avatarSize={40} formatValue={formatValue} />
    </View>
  );
}

function PodiumSlot({
  row,
  color,
  avatarSize,
  emphasis,
  formatValue,
}: {
  row?: Row;
  color: string;
  avatarSize: number;
  emphasis?: boolean;
  formatValue: (r: Row) => string;
}) {
  if (!row) return <View style={styles.podiumSlot} />;
  return (
    <Pressable
      style={[styles.podiumSlot, emphasis && styles.podiumSlotEmphasis]}
      onPress={() => router.push(`/u/${row.username}`)}
    >
      <View style={[styles.podiumRankBadge, { backgroundColor: color }]}>
        <Text style={styles.podiumRankText}>{row.rank}</Text>
      </View>
      <Avatar username={row.username} size={avatarSize} />
      <Text style={styles.podiumUsername} numberOfLines={1}>
        @{row.username}
      </Text>
      <Text style={[styles.podiumValue, { color }]}>{formatValue(row)}</Text>
    </Pressable>
  );
}

function FilterRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroll}
      contentContainerStyle={styles.filterRow}
    >
      {options.map((opt) => (
        <Pressable
          key={opt.key}
          style={[styles.pill, value === opt.key && styles.pillActive]}
          onPress={() => onChange(opt.key)}
        >
          <Text style={[styles.pillText, value === opt.key && styles.pillTextActive]}>{opt.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  filters: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  screenTitle: { ...type.title, color: colors.text },
  groupsButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  groupsButtonText: { color: colors.text, ...type.caption, fontWeight: '700' },
  filterScroll: { flexGrow: 0 },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  pill: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  pillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pillText: { color: colors.textMuted, ...type.caption },
  pillTextActive: { color: colors.accent },
  loader: { marginTop: spacing.xxxl },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  recordsBlock: { marginTop: spacing.xl, gap: spacing.sm },
  recordsLabel: { ...type.label, color: colors.textFaint },
  recordsScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  recordsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  recordCard: {
    minWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  recordEmoji: { fontSize: 22 },
  recordValue: { ...type.subheading, color: colors.text },
  recordLabel: { ...type.caption, color: colors.textMuted },
  recordUsername: { ...type.caption, color: colors.accent, fontWeight: '700', marginTop: 2 },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  podiumSlot: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: spacing.md },
  podiumSlotEmphasis: { paddingBottom: spacing.xl },
  podiumRankBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  podiumRankText: { fontSize: 11, fontWeight: '800', color: '#04140D' },
  podiumUsername: { ...type.caption, color: colors.text, fontWeight: '700', maxWidth: 92 },
  podiumValue: { fontSize: 15, fontWeight: '800' },
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
  rank: { color: colors.textMuted, fontWeight: '700', width: 28, textAlign: 'center' },
  username: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  value: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  error: { color: colors.danger, textAlign: 'center', marginTop: spacing.md, fontSize: 12 },
});
