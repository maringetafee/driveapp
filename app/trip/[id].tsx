import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import { formatDistance, formatDuration, formatSpeed } from '../../src/utils/geo';
import { formatLaunchTime } from '../../src/utils/launchTimer';
import TripRouteMap from '../../src/components/TripRouteMap';
import TripHighlights from '../../src/components/TripHighlights';
import TripShareCard from '../../src/components/TripShareCard';
import Avatar from '../../src/components/ui/Avatar';
import Chip from '../../src/components/ui/Chip';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import StatRow from '../../src/components/ui/StatRow';
import SectionHeader from '../../src/components/ui/SectionHeader';
import Divider from '../../src/components/ui/Divider';
import LikeHeart from '../../src/components/ui/LikeHeart';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import {
  ensureTripEnergy,
  FUEL_INFO,
  formatDecimal,
  formatEuros,
  type EnergyEstimate,
  type PriceSource,
} from '../../src/utils/energyCost';
import type { Profile, Trip, TripMetrics, TripTag } from '../../src/types/database';

const PRICE_SOURCE_TEXT: Record<Exclude<PriceSource, 'saved'>, string> = {
  nearby: 'precio medio de las gasolineras cercanas',
  province: 'precio medio de tu provincia',
  fixed: 'tu precio',
  average: 'precio medio',
};

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const myUserId = useAuthStore((s) => s.session?.user.id);
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [tripMetrics, setTripMetrics] = useState<TripMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  // undefined = calculando; null = el coche no tiene consumo configurado.
  const [energy, setEnergy] = useState<EnergyEstimate | null | undefined>(undefined);
  const [energyVehicleId, setEnergyVehicleId] = useState<string | null>(null);
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
        // El gasto puede tardar (precio de la zona): se muestra cuando llega.
        if (tripData && tripData.user_id === myUserId) {
          const { data: vehicle } = tripData.vehicle_id
            ? await supabase.from('vehicles').select('*').eq('id', tripData.vehicle_id).maybeSingle()
            : { data: null };
          if (cancelled) return;
          setEnergyVehicleId(vehicle?.id ?? null);
          const estimate = await ensureTripEnergy(tripData, vehicle).catch(() => null);
          if (!cancelled) setEnergy(estimate);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, myUserId]);

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
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.content}>
          <SkeletonList count={1} />
        </View>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.title}>No se encontró el trayecto.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwnTrip = myUserId === trip.user_id;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          <Text style={styles.title}>{isOwnTrip ? 'Trayecto completado' : `Trayecto de @${owner?.username}`}</Text>

          <TripRouteMap route={trip.route_geojson} height={240} />

          <StatRow
            columns={2}
            items={[
              { label: 'Distancia', value: formatDistance(trip.distance_meters ?? 0, units) },
              { label: 'Duración', value: formatDuration(trip.duration_seconds ?? 0) },
              { label: 'Vel. media', value: formatSpeed(trip.avg_speed_kmh ?? 0, units) },
              { label: 'Vel. máxima', value: formatSpeed(trip.max_speed_kmh ?? 0, units) },
            ]}
          />

          {isOwnTrip && energy !== undefined && (
            <Pressable
              style={({ pressed }) => [styles.energyCard, pressed && !energy && { opacity: 0.8 }]}
              disabled={!!energy}
              onPress={() => router.push(energyVehicleId ? `/vehicle/${energyVehicleId}` : '/(tabs)/profile')}
            >
              <View style={styles.energyIcon}>
                <Ionicons
                  name={energy?.fuelType === 'electric' ? 'flash' : 'water'}
                  size={20}
                  color={colors.accent}
                />
              </View>
              {energy ? (
                <View style={styles.flex}>
                  <Text style={styles.energyLabel}>Gasto estimado</Text>
                  <Text style={styles.energyCost}>{formatEuros(energy.cost)}</Text>
                  <Text style={styles.energyDetail}>
                    {formatDecimal(energy.used, energy.used < 10 ? 2 : 1)} {FUEL_INFO[energy.fuelType].unit} a{' '}
                    {formatDecimal(energy.price, 3)} €/{FUEL_INFO[energy.fuelType].unit}
                    {energy.priceSource !== 'saved' ? ` · ${PRICE_SOURCE_TEXT[energy.priceSource]}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={styles.flex}>
                  <Text style={styles.energyLabel}>¿Cuánto te ha costado?</Text>
                  <Text style={styles.energyDetail}>
                    {energyVehicleId
                      ? 'Añade el consumo de tu coche para ver el gasto en combustible de cada trayecto.'
                      : 'Añade tu coche y su consumo para ver el gasto en combustible de cada trayecto.'}
                  </Text>
                </View>
              )}
              {!energy && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />}
            </Pressable>
          )}

          <TripHighlights trip={trip} isOwnTrip={isOwnTrip} units={units} />

          {(trip.zero_to_50_s != null || trip.zero_to_100_s != null) && (
            <View style={styles.subScores}>
              <SectionHeader title="Aceleración" />
              <StatRow
                items={[
                  { label: '0-50 km/h', value: formatLaunchTime(trip.zero_to_50_s) },
                  { label: '0-100 km/h', value: formatLaunchTime(trip.zero_to_100_s) },
                ]}
              />
            </View>
          )}

          {isOwnTrip && (
            <View style={styles.tagRow}>
              {TAG_OPTIONS.map((opt) => (
                <Chip key={opt.key} label={opt.label} active={trip.tag === opt.key} onPress={() => onSetTag(opt.key)} />
              ))}
            </View>
          )}

          {tripMetrics && (
            <View style={styles.subScores}>
              <SectionHeader title="Estilo de conducción" />
              <StatRow
                items={[
                  { label: 'Aceleraciones fuertes', value: String(tripMetrics.hard_accelerations) },
                  { label: 'Frenazos bruscos', value: String(tripMetrics.hard_brakes) },
                  { label: 'Curvas cerradas', value: String(tripMetrics.sharp_turns) },
                ]}
              />
            </View>
          )}

          <Divider />

          <View style={styles.socialRow}>
            <Pressable style={({ pressed }) => [styles.likeButton, pressed && { opacity: 0.8 }]} onPress={onToggleLike} disabled={!myUserId}>
              <LikeHeart liked={liked} size={19} />
              <Text style={[styles.likeCount, liked && styles.likeCountActive]}>{likeCount}</Text>
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
                <Input
                  variant="pill"
                  style={styles.commentInput}
                  placeholder="Escribe un comentario…"
                  value={commentText}
                  onChangeText={setCommentText}
                  maxLength={500}
                />
                <Pressable
                  onPress={onPostComment}
                  disabled={postingComment || !commentText.trim()}
                  style={[styles.commentSend, (postingComment || !commentText.trim()) && { opacity: 0.4 }]}
                  hitSlop={8}
                >
                  <Ionicons name="send" size={18} color={colors.accentAlt} />
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
  energyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  energyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  energyLabel: { ...type.caption, color: colors.textMuted },
  energyCost: { ...type.stat, color: colors.text, marginTop: 2 },
  energyDetail: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  subScores: { gap: spacing.md },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  likeCountActive: { color: colors.danger },
  likeCount: { fontFamily: fonts.numeralSemiBold, color: colors.text },
  commentsSection: { gap: spacing.sm },
  empty: { ...type.caption, color: colors.textMuted },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  commentDivider: { marginTop: 2 },
  commentAuthor: { ...type.caption, color: colors.accent, marginBottom: 2 },
  commentBody: { ...type.body, color: colors.text },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  commentInput: { flex: 1 },
  commentSend: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLink: { ...type.caption, color: colors.danger, textAlign: 'center' },
  offscreen: { position: 'absolute', top: -9999, left: -9999 },
});
