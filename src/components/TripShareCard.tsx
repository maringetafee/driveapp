import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../utils/geo';
import type { Units } from '../types/database';

interface Props {
  distanceMeters: number;
  durationSeconds: number;
  maxSpeedKmh: number;
  drivingScore: number | null;
  units: Units;
  username: string;
}

export default function TripShareCard({
  distanceMeters,
  durationSeconds,
  maxSpeedKmh,
  drivingScore,
  units,
  username,
}: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.brand}>DriveRank</Text>
      <Text style={styles.username}>@{username}</Text>

      <View style={styles.scoreBlock}>
        <Text style={styles.scoreValue}>{drivingScore ?? '—'}</Text>
        <Text style={styles.scoreLabel}>driving score</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat value={formatDistance(distanceMeters, units)} label="Distancia" />
        <Stat value={formatSpeed(maxSpeedKmh, units)} label="Vel. máx." />
        <Stat value={formatDuration(durationSeconds)} label="Duración" />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 360,
    padding: 28,
    backgroundColor: colors.background,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brand: { color: colors.accent, fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  username: { color: colors.textMuted, fontSize: 13, marginTop: 2, marginBottom: 24 },
  scoreBlock: { alignItems: 'center', marginBottom: 28 },
  scoreValue: { color: colors.text, fontSize: 88, fontWeight: '800', letterSpacing: -3 },
  scoreLabel: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
