import { Image, StyleSheet, Text, View } from 'react-native';
import type { LineString } from 'geojson';
import { colors, radius } from '../theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../utils/geo';
import { staticMapUrl } from '../utils/staticMap';
import type { Units } from '../types/database';

function scoreTone(score: number | null) {
  if (score == null) return colors.text;
  if (score >= 85) return colors.accent;
  if (score >= 60) return colors.gold;
  return colors.danger;
}

interface Props {
  distanceMeters: number;
  durationSeconds: number;
  maxSpeedKmh: number;
  drivingScore: number | null;
  units: Units;
  username: string;
  route?: LineString | null;
}

export default function TripShareCard({
  distanceMeters,
  durationSeconds,
  maxSpeedKmh,
  drivingScore,
  units,
  username,
  route,
}: Props) {
  const mapUrl = staticMapUrl(route ?? null, 620, 260);

  return (
    <View style={styles.card}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>R</Text>
        </View>
        <View>
          <Text style={styles.brand}>Roadly</Text>
          <Text style={styles.username}>@{username}</Text>
        </View>
      </View>

      {mapUrl && <Image source={{ uri: mapUrl }} style={styles.map} />}

      <View style={styles.scoreBlock}>
        <Text style={[styles.scoreValue, { color: scoreTone(drivingScore) }]}>{drivingScore ?? '—'}</Text>
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
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  brand: { color: colors.text, fontSize: 15, fontWeight: '800' },
  username: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  map: { width: '100%', height: 130, borderRadius: radius.lg, marginBottom: 24, backgroundColor: colors.surface },
  scoreBlock: { alignItems: 'center', marginBottom: 28 },
  scoreValue: { fontSize: 88, fontWeight: '800', letterSpacing: -3 },
  scoreLabel: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
