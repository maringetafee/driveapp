import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
import Avatar from '../../src/components/ui/Avatar';

const MEDAL_COLOR: Record<number, string> = { 1: colors.gold, 2: colors.silver, 3: colors.bronze };
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

export default function LeaderboardScreen() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const units = profile?.units ?? 'kmh';

  const [metric, setMetric] = useState<LeaderboardMetric>('driving_score');
  const [scope, setScope] = useState<LeaderboardScope>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scopeValue = scope === 'city' ? profile?.city ?? null : scope === 'country' ? profile?.country ?? null : null;
  const scopeUnavailable = (scope === 'city' && !profile?.city) || (scope === 'country' && !profile?.country);

  useFocusEffect(
    useCallback(() => {
      if (!session || scopeUnavailable) {
        setRows([]);
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      setErrorMsg(null);

      supabase
        .rpc('compute_leaderboard', {
          p_metric: metric,
          p_scope: scope,
          p_scope_value: scopeValue,
          p_period: period,
          p_limit: 200,
        })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) setErrorMsg(error.message);
          setRows((data as Row[]) ?? []);
          setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [session, metric, scope, period, scopeValue, scopeUnavailable])
  );

  const formatValue = (row: Row) => {
    if (metric === 'max_speed') return formatSpeed(row.value, units);
    if (metric === 'total_distance') return formatDistance(row.value, units);
    if (metric === 'driving_score') return row.value.toFixed(0);
    return String(Math.round(row.value));
  };

  const myRankIndex = rows.findIndex((r) => r.user_id === session?.user.id);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.filters}>
        <FilterRow options={METRICS} value={metric} onChange={setMetric} />
        <FilterRow options={SCOPES} value={scope} onChange={setScope} />
        <FilterRow options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      {scopeUnavailable ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>
            Añade tu {scope === 'city' ? 'ciudad' : 'país'} en el perfil para ver este ranking.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={rows.slice(0, 30)}
          keyExtractor={(item) => item.user_id}
          ListEmptyComponent={<Text style={styles.empty}>Sin datos todavía para este filtro.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                item.user_id === session?.user.id && styles.rowMe,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push(`/u/${item.username}`)}
            >
              {MEDAL_COLOR[item.rank] ? (
                <View style={[styles.medal, { borderColor: MEDAL_COLOR[item.rank] }]}>
                  <Text style={[styles.medalText, { color: MEDAL_COLOR[item.rank] }]}>{item.rank}</Text>
                </View>
              ) : (
                <Text style={styles.rank}>#{item.rank}</Text>
              )}
              <Avatar username={item.username} size={32} />
              <Text style={styles.username}>@{item.username}</Text>
              <Text style={styles.value}>{formatValue(item)}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            myRankIndex >= 30 ? (
              <View style={[styles.row, styles.rowMe, styles.rowMePinned]}>
                <Text style={styles.rank}>#{rows[myRankIndex].rank}</Text>
                <Avatar username={rows[myRankIndex].username} size={32} />
                <Text style={styles.username}>@{rows[myRankIndex].username} (tú)</Text>
                <Text style={styles.value}>{formatValue(rows[myRankIndex])}</Text>
              </View>
            ) : null
          }
          ListFooterComponentStyle={{ marginTop: myRankIndex >= 30 ? 12 : 0 }}
        />
      )}

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}
    </SafeAreaView>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
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
  filters: { paddingTop: spacing.md, gap: spacing.sm },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  pill: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
  },
  pillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pillText: { color: colors.textMuted, ...type.caption },
  pillTextActive: { color: colors.accent },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  list: { padding: spacing.lg, gap: spacing.sm },
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
  rowMePinned: { marginHorizontal: spacing.lg },
  rank: { color: colors.textMuted, fontWeight: '700', width: 28, textAlign: 'center' },
  medal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalText: { fontWeight: '800', fontSize: 13 },
  username: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  value: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  empty: { color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center', paddingBottom: 12, fontSize: 12 },
});
