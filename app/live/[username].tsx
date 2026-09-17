import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { FeatureCollection, Point } from 'geojson';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, spacing, type } from '../../src/theme/colors';
import { subscribeToLiveFixes, type LiveFix } from '../../src/lib/liveShare';
import LinesMap from '../../src/components/LinesMap';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import { SkeletonList } from '../../src/components/ui/Skeleton';

type LoadState = 'checking' | 'not-allowed' | 'waiting' | 'live' | 'stopped';

export default function LiveShareScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const myId = useAuthStore((s) => s.session?.user.id);
  const [state, setState] = useState<LoadState>('checking');
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof subscribeToLiveFixes> | null = null;
    (async () => {
      if (!username || !myId) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
      if (cancelled) return;
      if (!profile) {
        setState('not-allowed');
        return;
      }
      const { data: share } = await supabase
        .from('live_shares')
        .select('expires_at')
        .eq('sharer_id', profile.id)
        .eq('viewer_id', myId)
        .maybeSingle();
      if (cancelled) return;
      if (!share || new Date(share.expires_at).getTime() < Date.now()) {
        setState('not-allowed');
        return;
      }
      setState('waiting');
      channel = subscribeToLiveFixes(
        profile.id,
        (f) => {
          if (cancelled) return;
          setFix(f);
          setUpdatedAt(Date.now());
          setState('live');
        },
        () => {
          if (!cancelled) setState('stopped');
        }
      );
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [username, myId]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const points: FeatureCollection<Point> | undefined = fix
    ? {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] } }],
      }
    : undefined;

  const secondsAgo = updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : null;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Ionicons name="location" size={20} color={colors.accent} />
        <Text style={styles.title}>@{username} en directo</Text>
      </View>

      {state === 'checking' && <SkeletonList count={1} />}

      {state === 'not-allowed' && (
        <View style={styles.centered}>
          <Text style={styles.hint}>@{username} no está compartiendo su ubicación contigo ahora mismo.</Text>
        </View>
      )}

      {state === 'stopped' && (
        <View style={styles.centered}>
          <Text style={styles.hint}>@{username} ha dejado de compartir su ubicación.</Text>
        </View>
      )}

      {(state === 'waiting' || state === 'live') && (
        <>
          {points ? (
            <LinesMap height={420} lines={[]} points={points} pointColor={colors.accent} />
          ) : (
            <View style={styles.centered}>
              <Text style={styles.hint}>Esperando la primera posición…</Text>
            </View>
          )}
          {fix && (
            <View style={styles.statsRow}>
              <Text style={styles.stat}>{Math.round(fix.speedKmh)} km/h</Text>
              {secondsAgo != null && <Text style={styles.updated}>actualizado hace {secondsAgo}s</Text>}
            </View>
          )}
        </>
      )}

      <PrimaryButton title="Volver" onPress={() => router.back()} variant="ghost" style={{ marginTop: spacing.lg }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.title, color: colors.text, fontSize: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { ...type.body, color: colors.textMuted, textAlign: 'center' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stat: { fontFamily: fonts.numeralBold, fontSize: 22, color: colors.accent },
  updated: { ...type.caption, color: colors.textFaint },
});
