import { Image, StyleSheet, Text, View } from 'react-native';
import type { LineString } from 'geojson';
import { colors, fonts, radius } from '../theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../utils/geo';
import { staticMapUrl } from '../utils/staticMap';
import type { Units } from '../types/database';

interface Props {
  distanceMeters: number;
  durationSeconds: number;
  maxSpeedKmh: number;
  units: Units;
  username: string;
  route?: LineString | null;
}

export default function TripShareCard({
  distanceMeters,
  durationSeconds,
  maxSpeedKmh,
  units,
  username,
  route,
}: Props) {
  const mapUrl = staticMapUrl(route ?? null, 620, 260);
  const [value, unitLabel] = formatDistance(distanceMeters, units).split(' ');

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

      <View style={styles.heroBlock}>
        <Text style={styles.heroValue}>
          {value}
          <Text style={styles.heroUnit}> {unitLabel}</Text>
        </Text>
        <Text style={styles.heroLabel}>recorridos</Text>
      </View>

      <View style={styles.statsRow}>
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
  brandMarkText: { fontFamily: fonts.numeralBold, color: colors.accent, fontSize: 15 },
  brand: { fontFamily: fonts.bodyExtraBold, color: colors.text, fontSize: 15 },
  username: { fontFamily: fonts.bodyMedium, color: colors.textMuted, fontSize: 12, marginTop: 1 },
  map: { width: '100%', height: 130, borderRadius: radius.lg, marginBottom: 24, backgroundColor: colors.surface },
  heroBlock: { alignItems: 'center', marginBottom: 28 },
  heroValue: { fontFamily: fonts.numeralBold, fontSize: 72, letterSpacing: -2, color: colors.accent },
  heroUnit: { fontFamily: fonts.numeralBold, fontSize: 28, color: colors.accent },
  heroLabel: {
    fontFamily: fonts.bodyBold,
    color: colors.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: fonts.numeralBold, color: colors.text, fontSize: 18 },
  statLabel: { fontFamily: fonts.bodyMedium, color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
