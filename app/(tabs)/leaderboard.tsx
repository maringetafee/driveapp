import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance, formatSpeed } from '../../src/utils/geo';
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
              style={[styles.row, item.user_id === session?.user.id && styles.rowMe]}
              onPress={() => router.push(`/u/${item.username}`)}
            >
              <Text style={styles.rank}>#{item.rank}</Text>
              <Text style={styles.username}>@{item.username}</Text>
              <Text style={styles.value}>{formatValue(item)}</Text>
            </Pressable>
          )}
          ListFooterComponent={
            myRankIndex >= 30 ? (
              <View style={[styles.row, styles.rowMe, styles.rowMePinned]}>
                <Text style={styles.rank}>#{rows[myRankIndex].rank}</Text>
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
  filters: { paddingTop: 12, gap: 8 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pillActive: { backgroundColor: colors.surfaceAlt, borderColor: colors.accent },
  pillText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: colors.accent },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  rowMe: { borderColor: colors.accent },
  rowMePinned: { marginHorizontal: 16 },
  rank: { color: colors.textMuted, fontWeight: '700', width: 36 },
  username: { color: colors.text, fontWeight: '600', flex: 1 },
  value: { color: colors.accent, fontWeight: '700' },
  empty: { color: colors.textMuted, textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center', paddingBottom: 12, fontSize: 12 },
});
