import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../../src/utils/geo';
import TripRouteMap from '../../src/components/TripRouteMap';
import TripShareCard from '../../src/components/TripShareCard';
import type { Profile, Trip, TripMetrics } from '../../src/types/database';

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { username: string } | null;
}

export default function TripSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [tripMetrics, setTripMetrics] = useState<TripMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<ViewShotRef>(null);

  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .single()
      .then(async ({ data: tripData }) => {
        if (cancelled) return;
        setTrip(tripData);
        if (tripData) {
          const [{ data: ownerData }, metricsRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', tripData.user_id).single(),
            supabase.from('trip_metrics').select('*').eq('trip_id', id).maybeSingle(),
          ]);
          if (cancelled) return;
          setOwner(ownerData);
          setTripMetrics(metricsRes.data);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loadSocial = useCallback(async () => {
    const [{ count }, myLike, { data: commentRows }] = await Promise.all([
      supabase.from('trip_likes').select('trip_id', { count: 'exact', head: true }).eq('trip_id', id),
      myUserId
        ? supabase.from('trip_likes').select('trip_id').eq('trip_id', id).eq('user_id', myUserId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('trip_comments')
        .select('id, body, created_at, user_id, profiles(username)')
        .eq('trip_id', id)
        .order('created_at', { ascending: true }),
    ]);
    setLikeCount(count ?? 0);
    setLiked(!!myLike?.data);
    setComments((commentRows as unknown as CommentRow[]) ?? []);
  }, [id, myUserId]);

  useFocusEffect(
    useCallback(() => {
      loadSocial();
    }, [loadSocial])
  );

  const onToggleLike = async () => {
    if (!myUserId) return;
    if (liked) {
      await supabase.from('trip_likes').delete().eq('trip_id', id).eq('user_id', myUserId);
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from('trip_likes').insert({ trip_id: id, user_id: myUserId });
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
  };

  const onPostComment = async () => {
    if (!myUserId || !commentText.trim()) return;
    setPostingComment(true);
    const { error } = await supabase
      .from('trip_comments')
      .insert({ trip_id: id, user_id: myUserId, body: commentText.trim() });
    setPostingComment(false);
    if (!error) {
      setCommentText('');
      loadSocial();
    }
  };

  const onShare = async () => {
    if (!shareCardRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await shareCardRef.current.capture();
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      }
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.title}>No se encontró el trayecto.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwnTrip = myUserId === trip.user_id;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isOwnTrip ? 'Trayecto completado' : `Trayecto de @${owner?.username}`}</Text>

          <TripRouteMap route={trip.route_geojson} />

          <View style={styles.grid}>
            <Stat label="Distancia" value={formatDistance(trip.distance_meters ?? 0, units)} />
            <Stat label="Duración" value={formatDuration(trip.duration_seconds ?? 0)} />
            <Stat label="Vel. media" value={formatSpeed(trip.avg_speed_kmh ?? 0, units)} />
            <Stat label="Vel. máxima" value={formatSpeed(trip.max_speed_kmh ?? 0, units)} />
          </View>

          {trip.driving_score != null && (
            <View style={styles.scoreCard}>
              <Text style={styles.scoreValue}>{trip.driving_score}</Text>
              <Text style={styles.scoreLabel}>driving score</Text>
            </View>
          )}

          {tripMetrics && (
            <View style={styles.metricsRow}>
              <MiniStat label="Aceleraciones bruscas" value={tripMetrics.hard_accelerations} />
              <MiniStat label="Frenazos" value={tripMetrics.hard_brakes} />
              <MiniStat label="Curvas cerradas" value={tripMetrics.sharp_turns} />
            </View>
          )}

          <View style={styles.socialRow}>
            <Pressable style={styles.likeButton} onPress={onToggleLike} disabled={!myUserId}>
              <Text style={[styles.likeIcon, liked && styles.likeIconActive]}>{liked ? '♥' : '♡'}</Text>
              <Text style={styles.likeCount}>{likeCount}</Text>
            </Pressable>
            <Pressable style={styles.shareButtonInline} onPress={onShare} disabled={sharing}>
              <Text style={styles.shareButtonText}>{sharing ? 'Generando…' : 'Compartir tarjeta'}</Text>
            </Pressable>
          </View>

          <View style={styles.commentsSection}>
            <Text style={styles.commentsTitle}>Comentarios</Text>
            {comments.length === 0 && <Text style={styles.empty}>Sé el primero en comentar.</Text>}
            {comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Text style={styles.commentAuthor}>@{c.profiles?.username ?? '—'}</Text>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            ))}

            {myUserId && (
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Escribe un comentario…"
                  placeholderTextColor={colors.textMuted}
                  value={commentText}
                  onChangeText={setCommentText}
                  maxLength={500}
                />
                <Pressable onPress={onPostComment} disabled={postingComment || !commentText.trim()}>
                  <Text style={styles.commentSend}>{postingComment ? '…' : 'Enviar'}</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.offscreen} pointerEvents="none">
            <ViewShot ref={shareCardRef} options={{ format: 'png', quality: 1 }}>
              <TripShareCard
                distanceMeters={trip.distance_meters ?? 0}
                durationSeconds={trip.duration_seconds ?? 0}
                maxSpeedKmh={trip.max_speed_kmh ?? 0}
                drivingScore={trip.driving_score}
                units={units}
                username={owner?.username ?? ''}
              />
            </ViewShot>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, gap: 20 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    flexBasis: '47%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  scoreCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 20,
  },
  scoreValue: { color: colors.accent, fontSize: 48, fontWeight: '800' },
  scoreLabel: { color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  miniStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
  },
  miniStatValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  miniStatLabel: { color: colors.textMuted, fontSize: 11, marginTop: 2, textAlign: 'center' },
  socialRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  likeIcon: { color: colors.textMuted, fontSize: 18 },
  likeIconActive: { color: colors.danger },
  likeCount: { color: colors.text, fontWeight: '700' },
  shareButtonInline: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareButtonText: { color: colors.background, fontWeight: '700', fontSize: 15 },
  commentsSection: { gap: 10 },
  commentsTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: 13 },
  commentRow: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  commentAuthor: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  commentBody: { color: colors.text, fontSize: 14 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
  },
  commentSend: { color: colors.accentAlt, fontWeight: '700' },
  offscreen: { position: 'absolute', top: -9999, left: -9999 },
});
