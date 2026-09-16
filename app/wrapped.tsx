import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Image as RemoteImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../src/theme/colors';
import { formatEuros } from '../src/utils/energyCost';
import { formatDistance } from '../src/utils/geo';
import {
  fetchWrapped,
  periodLabel,
  previousMonth,
  shiftPeriod,
  type WrappedData,
  type WrappedPeriod,
} from '../src/utils/wrapped';
import { PROVINCE_COUNT } from '../src/utils/places';
import LinesMap from '../src/components/LinesMap';
import ProgressBar from '../src/components/ui/ProgressBar';
import Chip from '../src/components/ui/Chip';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Tone = 'accent' | 'blue' | 'green' | 'purple' | 'gold' | 'surface';

const TONES: Record<Tone, { bg: string; border: string; tint: string; tintSoft: string; onBg: string; onBgMuted: string }> = {
  accent: {
    bg: colors.accent,
    border: colors.accent,
    tint: colors.onAccent,
    tintSoft: 'rgba(36, 16, 0, 0.14)',
    onBg: colors.onAccent,
    onBgMuted: 'rgba(36, 16, 0, 0.72)',
  },
  blue: { bg: '#12213F', border: '#24406F', tint: '#8FB4FF', tintSoft: 'rgba(143, 180, 255, 0.16)', onBg: colors.text, onBgMuted: colors.textMuted },
  green: { bg: '#122A1D', border: '#255238', tint: '#4CD98A', tintSoft: 'rgba(76, 217, 138, 0.16)', onBg: colors.text, onBgMuted: colors.textMuted },
  purple: { bg: '#221A3D', border: '#3E2E68', tint: '#B79BFF', tintSoft: 'rgba(183, 155, 255, 0.16)', onBg: colors.text, onBgMuted: colors.textMuted },
  gold: { bg: '#2B2110', border: '#4A3A1C', tint: colors.gold, tintSoft: 'rgba(240, 180, 41, 0.16)', onBg: colors.text, onBgMuted: colors.textMuted },
  surface: { bg: colors.surface, border: colors.border, tint: colors.accent, tintSoft: colors.accentSoft, onBg: colors.text, onBgMuted: colors.textMuted },
};

// Fotos de stock (Unsplash, uso libre) para dar textura a las tarjetas que no llevan mapa.
const PHOTOS = {
  intro: 'https://images.unsplash.com/photo-1564668836804-05a2de350bb6?fm=jpg&q=70&w=1200&fit=crop',
  money: 'https://images.unsplash.com/photo-1637417168775-532c76fa4fa4?fm=jpg&q=70&w=1200&fit=crop',
  places: 'https://images.unsplash.com/photo-1547482812-2432c5425f2c?fm=jpg&q=70&w=1200&fit=crop',
  habits: 'https://images.unsplash.com/photo-1632992170998-fa0dbe0a31e0?fm=jpg&q=70&w=1200&fit=crop',
  marks: 'https://images.unsplash.com/photo-1514820720301-4c4790309f46?fm=jpg&q=70&w=1200&fit=crop',
} as const;

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hours(seconds: number) {
  const h = seconds / 3600;
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1).replace('.', ',')} h`;
}

function IconBadge({ icon, tone, size = 36 }: { icon: IconName; tone: Tone; size?: number }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.tintSoft }]}>
      <Ionicons name={icon} size={size * 0.52} color={t.tint} />
    </View>
  );
}

function Kicker({ icon, label, tone }: { icon: IconName; label: string; tone: Tone }) {
  return (
    <View style={styles.kickerRow}>
      <IconBadge icon={icon} tone={tone} size={30} />
      <Text style={[styles.kicker, { color: TONES[tone].tint }]}>{label}</Text>
    </View>
  );
}

function MarkRow({
  icon,
  tone,
  value,
  label,
  onPress,
}: {
  icon: IconName;
  tone: Tone;
  value: string;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <IconBadge icon={icon} tone={tone} size={40} />
      <View style={styles.flex}>
        <Text style={styles.markValue}>{value}</Text>
        <Text style={styles.markLabel}>{label}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
    </>
  );
  if (onPress) {
    return (
      <Pressable style={({ pressed }) => [styles.markRow, pressed && { opacity: 0.75 }]} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.markRow}>{content}</View>;
}

function Card({
  tone = 'surface',
  width,
  photo,
  children,
}: {
  tone?: Tone;
  width: number;
  photo?: string;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View style={[styles.card, { width, backgroundColor: t.bg, borderColor: t.border }]}>
      {photo ? (
        <>
          <RemoteImage source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={200} />
          <View pointerEvents="none" style={[styles.photoScrim, { backgroundColor: hexToRgba(t.bg, 0.78) }]} />
        </>
      ) : (
        <>
          <View pointerEvents="none" style={[styles.blobA, { backgroundColor: t.tintSoft }]} />
          <View pointerEvents="none" style={[styles.blobB, { backgroundColor: t.tintSoft }]} />
        </>
      )}
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

export default function WrappedScreen() {
  const params = useLocalSearchParams<{ kind?: string; year?: string; month?: string }>();
  const myId = useAuthStore((s) => s.session?.user.id);
  const username = useAuthStore((s) => s.profile?.username ?? '');
  const units = useAuthStore((s) => s.profile?.units ?? 'kmh');
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = screenWidth - spacing.xl * 2;
  const cardStep = cardWidth + spacing.md;

  const [period, setPeriod] = useState<WrappedPeriod>(() => {
    if (params.kind === 'year' && params.year) return { kind: 'year', year: Number(params.year) };
    if (params.year && params.month) return { kind: 'month', year: Number(params.year), month: Number(params.month) };
    return previousMonth();
  });
  const [data, setData] = useState<WrappedData | null>(null);
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const shareRef = useRef<ViewShotRef>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!myId) return;
    let cancelled = false;
    setData(null);
    setPage(0);
    scrollX.setValue(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    fetchWrapped(myId, period).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [myId, period, scrollX]);

  const now = new Date();
  // Se puede avanzar hasta el mes/año en curso (resumen parcial), no más allá.
  const isFuture =
    period.kind === 'year'
      ? period.year >= now.getFullYear()
      : period.year > now.getFullYear() || (period.year === now.getFullYear() && period.month >= now.getMonth());

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / cardStep));
  };

  const onShare = async () => {
    if (!shareRef.current?.capture) return;
    setSharing(true);
    try {
      const uri = await shareRef.current.capture();
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } finally {
      setSharing(false);
    }
  };

  const label = periodLabel(period);
  const cards: ReactNode[] = [];

  if (data && data.tripCount > 0) {
    const perHundred = data.costedDistanceMeters ? (data.energyCostEur / data.costedDistanceMeters) * 100_000 : 0;
    const costedShare = data.distanceMeters ? (data.costedDistanceMeters / data.distanceMeters) * 100 : 0;
    const provinceShare = (data.provinces / PROVINCE_COUNT) * 100;

    cards.push(
      <Card key="intro" tone="accent" width={cardWidth} photo={PHOTOS.intro}>
        <Kicker icon="car-sport-outline" label={`TU ${label.toUpperCase()} AL VOLANTE`} tone="accent" />
        <Text style={[styles.giant, styles.onAccent]}>{data.tripCount}</Text>
        <Text style={[styles.big, styles.onAccent]}>{data.tripCount === 1 ? 'trayecto' : 'trayectos'}</Text>
        <View style={styles.introPill}>
          <Ionicons name="calendar-outline" size={16} color={colors.onAccent} />
          <Text style={[styles.introPillText, styles.onAccent]}>
            {data.activeDays} {data.activeDays === 1 ? 'día al volante' : 'días al volante'}
          </Text>
        </View>
        <View style={styles.swipeHint}>
          <Text style={[styles.body, styles.onAccentMuted]}>Desliza para ver el resto</Text>
          <Ionicons name="chevron-forward" size={16} color={TONES.accent.onBgMuted} />
        </View>
      </Card>,
      <Card key="distance" tone="surface" width={cardWidth}>
        {data.routes.length > 0 && (
          <LinesMap
            height={190}
            lines={[
              {
                id: 'wrapped-routes',
                shape: { type: 'MultiLineString', coordinates: data.routes.map((r) => r.coordinates) },
                color: colors.accent,
                width: 3,
              },
            ]}
          />
        )}
        <Kicker icon="map-outline" label="KILÓMETROS" tone="surface" />
        <Text style={styles.giant}>{formatDistance(data.distanceMeters, units).replace(/\.\d+/, '')}</Text>
        <Text style={styles.body}>
          {hours(data.durationSeconds)} al volante.{' '}
          {data.madridBarcelonaTimes >= 0.5
            ? `Como ir de Madrid a Barcelona ${data.madridBarcelonaTimes.toFixed(1).replace('.', ',')} veces.`
            : `Un ${Math.round(data.madridBarcelonaTimes * 100)} % del camino de Madrid a Barcelona.`}
        </Text>
      </Card>
    );

    if (data.energyCostEur > 0) {
      cards.push(
        <Card key="money" tone="green" width={cardWidth} photo={PHOTOS.money}>
          <Kicker icon="cash-outline" label="DINERO EN COMBUSTIBLE" tone="green" />
          <Text style={styles.giant}>{formatEuros(data.energyCostEur)}</Text>
          <Text style={styles.body}>
            Unos {formatEuros(perHundred)} cada 100 km
            {data.tripCount ? `, ${formatEuros(data.energyCostEur / data.tripCount)} por trayecto de media` : ''}.
          </Text>
          {costedShare > 0 && costedShare < 100 && (
            <ProgressBar label="Trayectos con coste calculado" value={costedShare} tone={TONES.green.tint} suffix=" %" />
          )}
        </Card>
      );
    }

    if (data.municipalities > 0) {
      cards.push(
        <Card key="places" tone="purple" width={cardWidth} photo={PHOTOS.places}>
          <Kicker icon="location-outline" label="LUGARES" tone="purple" />
          <Text style={styles.giant}>{data.municipalities}</Text>
          <Text style={styles.big}>{data.municipalities === 1 ? 'municipio' : 'municipios'}</Text>
          <ProgressBar label={`${data.provinces} de ${PROVINCE_COUNT} provincias`} value={provinceShare} tone={TONES.purple.tint} suffix=" %" />
          {(data.newMunicipalities > 0 || data.newProvinces.length > 0) && (
            <Text style={styles.body}>
              {data.newMunicipalities > 0 ? `${data.newMunicipalities} eran nuevos para ti. ` : ''}
              {data.newProvinces.length ? `Estrenaste: ${data.newProvinces.join(', ')}.` : ''}
            </Text>
          )}
        </Card>
      );
    }

    cards.push(
      <Card key="habits" tone="blue" width={cardWidth} photo={PHOTOS.habits}>
        <Kicker icon="time-outline" label="TUS COSTUMBRES" tone="blue" />
        {data.favouritePartOfDay && (
          <View style={styles.habitRow}>
            <Text style={styles.emoji}>{data.favouritePartOfDay.emoji}</Text>
            <View style={styles.flex}>
              <Text style={styles.big}>Conduces sobre todo {data.favouritePartOfDay.label}</Text>
              <ProgressBar
                label="de tus kilómetros"
                value={data.favouritePartOfDay.share * 100}
                tone={TONES.blue.tint}
                suffix=" %"
              />
            </View>
          </View>
        )}
        {data.favouriteWeekday && (
          <Text style={styles.body}>
            Tu día fuerte es el {data.favouriteWeekday.label}: {formatDistance(data.favouriteWeekday.distanceMeters, units)}.
          </Text>
        )}
      </Card>,
      <Card key="marks" tone="gold" width={cardWidth} photo={PHOTOS.marks}>
        <Kicker icon="trophy-outline" label="MARCAS DEL PERIODO" tone="gold" />
        {data.longestTrip && (
          <MarkRow
            icon="trail-sign-outline"
            tone="gold"
            value={formatDistance(data.longestTrip.distance_meters ?? 0, units)}
            label="Trayecto más largo"
            onPress={() => router.push(`/trip/${data.longestTrip?.id}`)}
          />
        )}
        {data.bestDay && (
          <MarkRow
            icon="calendar-outline"
            tone="gold"
            value={formatDistance(data.bestDay.distanceMeters, units)}
            label={`Más km en un día (${new Date(`${data.bestDay.day}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })})`}
          />
        )}
        {data.smoothestTrip && (
          <MarkRow
            icon="water-outline"
            tone="gold"
            value={`${data.smoothestTrip.eventsPer100Km.toFixed(1).replace('.', ',')} bruscos/100 km`}
            label="Trayecto más suave"
            onPress={() => router.push(`/trip/${data.smoothestTrip?.id}`)}
          />
        )}
        {data.segmentEfforts > 0 && (
          <MarkRow
            icon="flag-outline"
            tone="gold"
            value={`${data.segmentEfforts} ${data.segmentEfforts === 1 ? 'tramo' : 'tramos'}`}
            label={data.segmentPersonalBests ? `${data.segmentPersonalBests} con mejora de tu regularidad` : 'recorridos en el periodo'}
          />
        )}
      </Card>,
      <Card key="share" tone="accent" width={cardWidth}>
        <ViewShot ref={shareRef} options={{ format: 'png', quality: 1 }} style={styles.shareShot}>
          <View style={styles.shareHeader}>
            <Image source={require('../assets/icon.png')} style={styles.shareLogo} />
            <View style={styles.flex}>
              <Text style={[styles.shareBrand, styles.onAccent]}>Roadly</Text>
              <Text style={[styles.shareBrandSub, styles.onAccentMuted]}>
                {username ? `@${username} · ` : ''}
                {label}
              </Text>
            </View>
          </View>
          {data.routes.length > 0 && (
            <LinesMap
              height={130}
              lines={[
                {
                  id: 'wrapped-share-routes',
                  shape: { type: 'MultiLineString', coordinates: data.routes.map((r) => r.coordinates) },
                  color: colors.accent,
                  width: 3,
                },
              ]}
            />
          )}
          <View style={styles.shareGrid}>
            <View style={styles.shareItem}>
              <Text style={[styles.shareValue, styles.onAccent]}>{formatDistance(data.distanceMeters, units).replace(/\.\d+/, '')}</Text>
              <Text style={[styles.shareLabel, styles.onAccentMuted]}>recorridos</Text>
            </View>
            <View style={styles.shareItem}>
              <Text style={[styles.shareValue, styles.onAccent]}>{data.tripCount}</Text>
              <Text style={[styles.shareLabel, styles.onAccentMuted]}>trayectos</Text>
            </View>
            <View style={styles.shareItem}>
              <Text style={[styles.shareValue, styles.onAccent]}>{data.municipalities}</Text>
              <Text style={[styles.shareLabel, styles.onAccentMuted]}>municipios</Text>
            </View>
            <View style={styles.shareItem}>
              <Text style={[styles.shareValue, styles.onAccent]}>{hours(data.durationSeconds)}</Text>
              <Text style={[styles.shareLabel, styles.onAccentMuted]}>al volante</Text>
            </View>
          </View>
        </ViewShot>
        <Pressable
          style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.85 }]}
          onPress={onShare}
          disabled={sharing}
        >
          {sharing ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color={colors.accent} />
              <Text style={styles.shareButtonText}>Compartir resumen</Text>
            </>
          )}
        </Pressable>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.kindRow}>
          <Chip
            label="Mes"
            active={period.kind === 'month'}
            onPress={() => setPeriod(period.kind === 'month' ? period : previousMonth())}
          />
          <Chip
            label="Año"
            active={period.kind === 'year'}
            onPress={() => setPeriod({ kind: 'year', year: period.year })}
          />
        </View>
        <View style={styles.periodRow}>
          <Pressable hitSlop={10} onPress={() => setPeriod(shiftPeriod(period, -1))} style={styles.arrow}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.periodLabel}>{label}</Text>
          <Pressable
            hitSlop={10}
            onPress={() => !isFuture && setPeriod(shiftPeriod(period, 1))}
            style={[styles.arrow, isFuture && { opacity: 0.3 }]}
            disabled={isFuture}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {!data ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : data.tripCount === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🛣️</Text>
          <Text style={styles.big}>Sin trayectos en {label}</Text>
          <Text style={[styles.body, styles.center]}>Prueba con otro periodo.</Text>
        </View>
      ) : (
        <>
          <Animated.ScrollView
            ref={scrollRef}
            style={styles.pagerScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardStep}
            decelerationRate="fast"
            contentContainerStyle={styles.pager}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
              useNativeDriver: true,
            })}
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
          >
            {cards.map((card, i) => {
              const inputRange = [(i - 1) * cardStep, i * cardStep, (i + 1) * cardStep];
              const scale = scrollX.interpolate({ inputRange, outputRange: [0.92, 1, 0.92], extrapolate: 'clamp' });
              const opacity = scrollX.interpolate({ inputRange, outputRange: [0.55, 1, 0.55], extrapolate: 'clamp' });
              return (
                <Animated.View key={i} style={{ transform: [{ scale }], opacity }}>
                  {card}
                </Animated.View>
              );
            })}
          </Animated.ScrollView>
          <View style={styles.dots}>
            {cards.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { padding: spacing.xs },
  periodLabel: { ...type.subheading, fontSize: 20, color: colors.text, textTransform: 'capitalize' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyEmoji: { fontSize: 40 },
  pagerScroll: { flex: 1 },
  pager: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingVertical: spacing.lg, alignItems: 'stretch' },
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.xl,
    borderWidth: 1,
    flex: 1,
  },
  cardContent: { flex: 1, padding: spacing.xl, gap: spacing.md, justifyContent: 'center' },
  photo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  photoScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blobA: { position: 'absolute', top: -70, right: -50, width: 190, height: 190, borderRadius: 95 },
  blobB: { position: 'absolute', bottom: -60, left: -40, width: 140, height: 140, borderRadius: 70 },
  badge: { alignItems: 'center', justifyContent: 'center' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kicker: { ...type.label },
  giant: { fontFamily: fonts.numeralBold, fontSize: 64, lineHeight: 70, letterSpacing: -2, color: colors.text },
  big: { fontFamily: fonts.bodyExtraBold, fontSize: 24, lineHeight: 30, color: colors.text },
  body: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  emoji: { fontSize: 44 },
  onAccent: { color: colors.onAccent },
  onAccentMuted: { color: 'rgba(36, 16, 0, 0.72)' },
  introPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(36, 16, 0, 0.14)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  introPillText: { ...type.caption, fontFamily: fonts.bodyBold },
  swipeHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  markValue: { fontFamily: fonts.numeralBold, fontSize: 20, color: colors.text },
  markLabel: { ...type.caption, color: colors.textMuted },
  shareShot: { backgroundColor: colors.accent, gap: spacing.md, paddingVertical: spacing.md },
  shareHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  shareLogo: { width: 40, height: 40, borderRadius: radius.md },
  shareBrand: { fontFamily: fonts.numeralBold, fontSize: 20, letterSpacing: -0.4 },
  shareBrandSub: { ...type.caption, textTransform: 'capitalize' },
  shareGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.lg },
  shareItem: { width: '50%' },
  shareValue: { fontFamily: fonts.numeralBold, fontSize: 30, letterSpacing: -1 },
  shareLabel: { ...type.caption },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.onAccent,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  shareButtonText: { ...type.body, fontFamily: fonts.bodyBold, color: colors.accent },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: spacing.lg },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotActive: { width: 18, backgroundColor: colors.accent },
});
