import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
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
import { colors, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../../src/utils/geo';
import { scoreTone } from '../../src/utils/scoreTone';
import { accelerationScore, brakingScore, corneringScore } from '../../src/utils/subScores';
import TripRouteMap from '../../src/components/TripRouteMap';
import TripShareCard from '../../src/components/TripShareCard';
import Avatar from '../../src/components/ui/Avatar';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import ScoreDisplay from '../../src/components/ui/ScoreDisplay';
import StatRow from '../../src/components/ui/StatRow';
import ProgressBar from '../../src/components/ui/ProgressBar';
import SectionHeader from '../../src/components/ui/SectionHeader';
import Divider from '../../src/components/ui/Divider';
import type { Profile, Trip, TripMetrics, TripTag } from '../../src/types/database';

const TAG_OPTIONS: { key: TripTag; label: string }[] = [
  { key: 'commute', label: '🏢 Commute' },
  { key: 'road_trip', label: '🛣️ Viaje largo' },
  { key: 'night', label: '🌙 Nocturno' },
  { key: 'other', label: '📍 Otro' },
];

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  profiles: { username: string } | null;
}

export default function TripSummaryScreen() {
  const { id, justFinished } = useLocalSearchParams<{ id: string; justFinished?: string }>();
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

  const onSetTag = async (tag: TripTag) => {
    if (!trip) return;
    const nextTag = trip.tag === tag ? null : tag;
    setTrip({ ...trip, tag: nextTag });
    await supabase.from('trips').update({ tag: nextTag }).eq('id', trip.id);
  };

  const onDelete = () => {
    Alert.alert('Eliminar trayecto', 'Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('trips').delete().eq('id', id);
          router.back();
        },
      },
    ]);
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

          <TripRouteMap route={trip.route_geojson} height={240} />

          {trip.driving_score != null && (
            <ScoreDisplay score={trip.driving_score} size="hero" style={styles.score} reveal={!!justFinished} />
          )}

          <StatRow
            items={[
              { label: 'Distancia', value: formatDistance(trip.distance_meters ?? 0, units) },
              { label: 'Duración', value: formatDuration(trip.duration_seconds ?? 0) },
              { label: 'Vel. media', value: formatSpeed(trip.avg_speed_kmh ?? 0, units) },
              { label: 'Vel. máxima', value: formatSpeed(trip.max_speed_kmh ?? 0, units) },
            ]}
          />

          {isOwnTrip && (
            <View style={styles.tagRow}>
              {TAG_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.tagPill, trip.tag === opt.key && styles.tagPillActive]}
                  onPress={() => onSetTag(opt.key)}
                >
                  <Text style={[styles.tagPillText, trip.tag === opt.key && styles.tagPillTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {tripMetrics && (
            <View style={styles.subScores}>
              <SectionHeader title="Análisis de conducción" />
              <ProgressBar
                label="Aceleración"
                value={accelerationScore(tripMetrics.hard_accelerations)}
                tone={scoreTone(accelerationScore(tripMetrics.hard_accelerations))}
              />
              <ProgressBar
                label="Frenadas"
                value={brakingScore(tripMetrics.hard_brakes)}
                tone={scoreTone(brakingScore(tripMetrics.hard_brakes))}
              />
              <ProgressBar
                label="Curvas"
                value={corneringScore(tripMetrics.sharp_turns)}
                tone={scoreTone(corneringScore(tripMetrics.sharp_turns))}
              />
            </View>
          )}

          <Divider />

          <View style={styles.socialRow}>
            <Pressable style={({ pressed }) => [styles.likeButton, pressed && { opacity: 0.8 }]} onPress={onToggleLike} disabled={!myUserId}>
              <Text style={[styles.likeIcon, liked && styles.likeIconActive]}>{liked ? '♥' : '♡'}</Text>
              <Text style={[styles.likeCount, liked && styles.likeIconActive]}>{likeCount}</Text>
            </Pressable>
            <PrimaryButton
              title={sharing ? 'Generando…' : 'Compartir tarjeta'}
              onPress={onShare}
              loading={sharing}
              style={{ flex: 1 }}
            />
          </View>

          {isOwnTrip && (
            <Pressable onPress={onDelete} hitSlop={8}>
              <Text style={styles.deleteLink}>Eliminar trayecto</Text>
            </Pressable>
          )}

          <View style={styles.commentsSection}>
            <SectionHeader title="Comentarios" />
            {comments.length === 0 && <Text style={styles.empty}>Sé el primero en comentar.</Text>}
            {comments.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <Divider style={styles.commentDivider} />}
                <View style={styles.commentRow}>
                  <Avatar username={c.profiles?.username ?? '?'} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>@{c.profiles?.username ?? '—'}</Text>
                    <Text style={styles.commentBody}>{c.body}</Text>
                  </View>
                </View>
              </View>
            ))}

            {myUserId && (
              <View style={styles.commentInputRow}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Escribe un comentario…"
                  placeholderTextColor={colors.textFaint}
                  value={commentText}
                  onChangeText={setCommentText}
                  maxLength={500}
                />
                <Pressable onPress={onPostComment} disabled={postingComment || !commentText.trim()}>
                  <Text style={[styles.commentSend, (postingComment || !commentText.trim()) && { opacity: 0.4 }]}>
                    {postingComment ? '…' : 'Enviar'}
                  </Text>
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
                route={trip.route_geojson}
              />
            </ViewShot>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { ...type.heading, color: colors.text },
  score: { marginVertical: spacing.xs },
  subScores: { gap: spacing.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagPill: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
  },
  tagPillActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  tagPillText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  tagPillTextActive: { color: colors.accent },
  socialRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  likeIcon: { color: colors.textMuted, fontSize: 18 },
  likeIconActive: { color: colors.danger },
  likeCount: { color: colors.text, fontWeight: '700' },
  commentsSection: { gap: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 13 },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  commentDivider: { marginTop: 2 },
  commentAuthor: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 2 },
  commentBody: { color: colors.text, fontSize: 14 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    color: colors.text,
  },
  commentSend: { color: colors.accentAlt, fontWeight: '800' },
  deleteLink: { color: colors.danger, fontWeight: '700', textAlign: 'center' },
  offscreen: { position: 'absolute', top: -9999, left: -9999 },
});
