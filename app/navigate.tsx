import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AlertButton,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Mapbox from '@rnmapbox/maps';
import * as Location from 'expo-location';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import cameraData from '../src/data/speedCameras.json';
import { fetchDirections, searchPlaces, type Place } from '../src/lib/mapboxApi';
import { allowScreenOff, keepScreenOn, speak, stopSpeaking } from '../src/lib/voice';
import { useAuthStore } from '../src/state/authStore';
import { useTripStore } from '../src/state/tripStore';
import { colors, radius, semantic, shadow, spacing, type } from '../src/theme/colors';
import { finishTrip } from '../src/utils/finishTrip';
import {
  buildNavRoute,
  camerasAlongRoute,
  locateOnRoute,
  remainingDurationS,
  sliceRoute,
  stepIndexAt,
  type Maneuver,
  type NavRoute,
} from '../src/utils/navRoute';
import {
  bearingDeg,
  CameraIndex,
  distanceM,
  RadarWatcher,
  type ActiveSection,
  type CameraDataset,
  type LatLon,
  type RadarEvent,
  type RadarState,
  type RouteCameras,
  type UpcomingCamera,
} from '../src/utils/speedCameras';
import PrimaryButton from '../src/components/ui/PrimaryButton';

type Phase = 'explore' | 'preview' | 'navigating';

interface Fix extends LatLon {
  speedKmh: number;
  heading: number | null;
  accuracy: number | null;
}

const CAMERA_INDEX = CameraIndex.fromDataset(cameraData as unknown as CameraDataset);

const CAMERA_FEATURES: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [
    ...CAMERA_INDEX.fixed.map(
      (c): Feature<Point> => ({
        type: 'Feature',
        id: c.id,
        properties: { kind: 'fixed', limit: c.maxspeed != null ? String(c.maxspeed) : '' },
        geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      })
    ),
    ...CAMERA_INDEX.sections.flatMap((s) =>
      [s.start, s.end].map(
        (p, i): Feature<Point> => ({
          type: 'Feature',
          id: `${s.id}-${i}`,
          properties: { kind: 'section', limit: s.maxspeed != null ? String(s.maxspeed) : '' },
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        })
      )
    ),
  ],
};

const RADAR_RED = '#E5322D';
const MADRID: [number, number] = [-3.7038, 40.4168];
// El logo y la atribución de Mapbox (obligatorios) van justo encima del panel inferior.
const MAP_LOGO_CLEARANCE = 44;
const ARRIVAL_M = 25;
const REROUTE_AFTER_FIXES = 3;
const REROUTE_COOLDOWN_MS = 10_000;
const COURSE_BASELINE_M = 20;
// Un salto mayor es un fallo del GPS (o del simulador), no un desplazamiento real.
const MAX_COURSE_JUMP_M = 500;
// Una instrucción de voz que se quedó atrás más de esto ya no se dice.
const STALE_VOICE_M = 150;

function formatNavDistance(m: number): string {
  if (m < 1000) return `${m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km)} km`;
}

function formatEtaDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

function arrivalTime(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function spokenDistance(m: number): string {
  if (m >= 950) return 'un kilómetro';
  return `${Math.max(100, Math.round(m / 100) * 100)} metros`;
}

function radarSpeech(event: RadarEvent, speedKmh: number): string {
  switch (event.type) {
    case 'approaching': {
      const c = event.camera;
      const what = c.kind === 'fixed' ? 'Radar fijo' : 'Tramo controlado';
      return `${what} a ${spokenDistance(c.distanceM)}.${c.maxspeed ? ` Límite ${c.maxspeed}.` : ''}`;
    }
    case 'close': {
      const c = event.camera;
      const over = c.maxspeed != null && speedKmh > c.maxspeed + 2;
      return `${c.kind === 'fixed' ? 'Radar' : 'Inicio de tramo'} a ${spokenDistance(c.distanceM)}.${over ? ' Reduce la velocidad.' : ''}`;
    }
    case 'section-start':
      return `Inicio de tramo controlado.${event.section.maxspeed ? ` Límite ${event.section.maxspeed}.` : ''}`;
    case 'section-end':
      return `Fin del tramo. Tu media ha sido ${Math.round(event.section.avgKmh)} kilómetros por hora.`;
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function NavigateScreen() {
  const insets = useSafeAreaInsets();
  const tripStatus = useTripStore((s) => s.status);

  const [phase, setPhase] = useState<Phase>('explore');
  const [fix, setFix] = useState<Fix | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [routeCams, setRouteCams] = useState<RouteCameras | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ along: 0, step: 0, segment: 0 });
  const [radar, setRadar] = useState<RadarState>({ upcoming: null, section: null });
  const [following, setFollowing] = useState(true);
  const [rerouting, setRerouting] = useState(false);
  const [panelHeight, setPanelHeight] = useState(140);

  const watcher = useRef(new RadarWatcher(CAMERA_INDEX)).current;
  const phaseRef = useRef<Phase>('explore');
  const routeRef = useRef<NavRoute | null>(null);
  const destinationRef = useRef<Place | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const courseAnchor = useRef<LatLon | null>(null);
  const course = useRef<number | null>(null);
  const nav = useRef({
    segment: 0,
    step: 0,
    offRoute: 0,
    lastReroute: 0,
    rerouting: false,
    spoken: new Set<string>(),
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  const applyRoute = useCallback(
    (next: NavRoute | null) => {
      routeRef.current = next;
      const cams = next ? camerasAlongRoute(next, CAMERA_INDEX) : null;
      setRoute(next);
      setRouteCams(cams);
      watcher.setRoute(cams);
      const n = nav.current;
      n.segment = 0;
      n.step = 0;
      n.offRoute = 0;
      n.spoken.clear();
      setProgress({ along: 0, step: 0, segment: 0 });
    },
    [watcher]
  );

  const endNavigation = useCallback(() => {
    setPhase('explore');
    setDestination(null);
    setQuery('');
    setRouteError(null);
    setFollowing(true);
    applyRoute(null);
  }, [applyRoute]);

  const onArrive = useCallback(() => {
    const name = destinationRef.current?.name ?? 'tu destino';
    speak(`Has llegado a ${name}.`);
    endNavigation();
    const userId = useAuthStore.getState().session?.user.id;
    if (userId && useTripStore.getState().status === 'tracking') {
      Alert.alert('Has llegado', `Estás en ${name}. ¿Guardamos el trayecto?`, [
        { text: 'Seguir grabando', style: 'cancel' },
        { text: 'Guardar trayecto', onPress: () => finishTrip(userId, { replace: true }) },
      ]);
    } else {
      Alert.alert('Has llegado', `Estás en ${name}.`);
    }
  }, [endNavigation]);

  const reroute = useCallback(
    async (from: LatLon, heading: number | null) => {
      const n = nav.current;
      const dest = destinationRef.current;
      if (!dest || n.rerouting || Date.now() - n.lastReroute < REROUTE_COOLDOWN_MS) return;
      n.rerouting = true;
      n.lastReroute = Date.now();
      setRerouting(true);
      speak('Recalculando la ruta.');
      try {
        applyRoute(buildNavRoute(await fetchDirections(from, dest, heading)));
      } catch {
        // Se vuelve a intentar en la siguiente lectura fuera de ruta.
      } finally {
        n.rerouting = false;
        n.offRoute = 0;
        setRerouting(false);
      }
    },
    [applyRoute]
  );

  const speakDueInstructions = (r: NavRoute, along: number) => {
    const n = nav.current;
    for (let s = Math.max(0, n.step - 1); s <= Math.min(r.steps.length - 1, n.step + 1); s++) {
      r.steps[s].voice.forEach((v, i) => {
        const key = `${s}:${i}`;
        if (n.spoken.has(key) || v.along > along) return;
        n.spoken.add(key);
        if (along - v.along < STALE_VOICE_M) speak(v.text);
      });
    }
  };

  const handleLocation = (loc: Location.LocationObject) => {
    const p = { lat: loc.coords.latitude, lon: loc.coords.longitude };
    const speedKmh = loc.coords.speed != null && loc.coords.speed > 0 ? loc.coords.speed * 3.6 : 0;
    // El rumbo sale del propio desplazamiento, en tramos de unos metros: el que
    // da la ubicación fusionada puede desviarse decenas de grados.
    const anchor = courseAnchor.current;
    const moved = anchor ? distanceM(anchor, p) : 0;
    if (!anchor || moved > MAX_COURSE_JUMP_M) courseAnchor.current = p;
    else if (moved >= COURSE_BASELINE_M) {
      course.current = bearingDeg(anchor, p);
      courseAnchor.current = p;
    }
    const gpsHeading = loc.coords.heading != null && loc.coords.heading > 0 ? loc.coords.heading : null;
    const heading = course.current ?? gpsHeading;
    const nextFix = { ...p, speedKmh, heading, accuracy: loc.coords.accuracy ?? null };
    fixRef.current = nextFix;
    setFix(nextFix);

    let along: number | null = null;
    const r = routeRef.current;
    const n = nav.current;
    if (r && phaseRef.current === 'navigating' && !n.rerouting) {
      const pos = locateOnRoute(r, p, n.segment);
      const tolerance = Math.max(40, (loc.coords.accuracy ?? 20) * 1.5);
      if (pos.offsetM > tolerance) {
        n.offRoute += 1;
        if (n.offRoute >= REROUTE_AFTER_FIXES) reroute(p, heading);
      } else {
        n.offRoute = 0;
        n.segment = pos.segment;
        n.step = stepIndexAt(r, pos.along, n.step);
        along = pos.along;
        setProgress({ along: pos.along, step: n.step, segment: pos.segment });
        speakDueInstructions(r, pos.along);
        if (r.total - pos.along < ARRIVAL_M) {
          onArrive();
          return;
        }
      }
    }

    const { state, events } = watcher.update({ ...p, speedKmh, headingDeg: heading, timestamp: loc.timestamp, along });
    setRadar(state);
    for (const event of events) speak(radarSpeech(event, speedKmh));
  };

  const onLocationRef = useRef(handleLocation);
  useEffect(() => {
    onLocationRef.current = handleLocation;
  });

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError('Necesitamos tu ubicación para avisarte de los radares.');
        return;
      }
      const sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => onLocationRef.current(loc)
      );
      if (cancelled) sub.remove();
      else subscription = sub;
    })().catch(() => setGpsError('No se pudo acceder al GPS.'));
    keepScreenOn();
    return () => {
      cancelled = true;
      subscription?.remove();
      allowScreenOff();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (phase !== 'explore' || text.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(text, fixRef.current, controller.signal)
        .then(setResults)
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, phase]);

  const confirmExit = useCallback(() => {
    const userId = useAuthStore.getState().session?.user.id;
    const tracking = useTripStore.getState().status === 'tracking';
    const buttons: AlertButton[] = [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Terminar ruta', onPress: endNavigation },
    ];
    if (tracking && userId) {
      buttons.push({
        text: 'Terminar y guardar',
        onPress: () => {
          endNavigation();
          finishTrip(userId, { replace: true });
        },
      });
    }
    Alert.alert(
      '¿Terminar la navegación?',
      tracking ? 'Si solo terminas la ruta, el trayecto se sigue grabando.' : undefined,
      buttons
    );
  }, [endNavigation]);

  useEffect(() => {
    if (phase !== 'navigating') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmExit();
      return true;
    });
    return () => sub.remove();
  }, [phase, confirmExit]);

  const choosePlace = async (place: Place) => {
    Keyboard.dismiss();
    setDestination(place);
    setResults([]);
    setQuery(place.name);
    setPhase('preview');
    setRouteError(null);
    applyRoute(null);
    const from = fixRef.current;
    if (!from) {
      setRouteError('Esperando señal GPS… vuelve a intentarlo en unos segundos.');
      return;
    }
    setRouteLoading(true);
    try {
      applyRoute(buildNavRoute(await fetchDirections(from, place, from.speedKmh > 8 ? from.heading : null)));
    } catch {
      setRouteError('No hemos podido calcular la ruta. Comprueba tu conexión.');
    } finally {
      setRouteLoading(false);
    }
  };

  const startNavigation = () => {
    if (!route) return;
    nav.current.spoken.clear();
    setPhase('navigating');
    setFollowing(true);
    // Navegar también cuenta como trayecto de Roadly.
    if (useTripStore.getState().status === 'idle') useTripStore.getState().start();
  };

  const openInWaze = () => {
    if (!destination) return;
    Linking.openURL(`https://waze.com/ul?ll=${destination.lat},${destination.lon}&navigate=yes`);
  };

  const routeBounds = useMemo(() => {
    if (!route) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (const c of route.coords) {
      minLat = Math.min(minLat, c.lat);
      maxLat = Math.max(maxLat, c.lat);
      minLon = Math.min(minLon, c.lon);
      maxLon = Math.max(maxLon, c.lon);
    }
    return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
  }, [route]);

  const sectionShapes = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!route || !routeCams?.sections.length) return null;
    return {
      type: 'FeatureCollection',
      features: routeCams.sections.map((s) => ({
        type: 'Feature',
        properties: {},
        geometry: sliceRoute(route, s.startAlong, s.endAlong),
      })),
    };
  }, [route, routeCams]);

  const areaKey = fix ? `${fix.lat.toFixed(2)},${fix.lon.toFixed(2)}` : '';
  const nearbyCount = useMemo(() => {
    const here = fixRef.current;
    if (!here) return 0;
    return CAMERA_INDEX.fixedNear(here, 10_000).length + CAMERA_INDEX.sectionsStartingNear(here, 10_000).length;
  }, [areaKey]);

  const step = route && phase === 'navigating' ? route.steps[progress.step] : null;
  const toManeuverM = step ? Math.max(0, step.endAlong - progress.along) : 0;
  const remainingM = route ? Math.max(0, route.total - progress.along) : 0;
  const remainingS = route ? remainingDurationS(route, progress.along) : 0;
  const speed = fix?.speedKmh ?? 0;
  const limit = phase === 'navigating' && route ? (route.maxspeed[progress.segment] ?? null) : null;
  const overLimit = limit != null && speed > limit + 2;
  const showAlerts = phase !== 'preview' && results.length === 0;
  const navigating = phase === 'navigating';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        styleURL={Mapbox.StyleURL.Dark}
        scaleBarEnabled={false}
        compassEnabled={!navigating}
        compassViewMargins={{ x: 16, y: insets.top + 80 }}
        logoPosition={{ bottom: panelHeight + 8, left: 12 }}
        attributionPosition={{ bottom: panelHeight + 8, left: 100 }}
      >
        <Mapbox.Camera
          // Mapbox no aplica un cambio de inclinación mientras ya sigue al usuario: al empezar a navegar se recrea.
          key={navigating ? 'camera-navigating' : 'camera-map'}
          followUserLocation={following && phase !== 'preview'}
          followUserMode={navigating ? Mapbox.UserTrackingMode.FollowWithCourse : Mapbox.UserTrackingMode.Follow}
          followZoomLevel={navigating ? 16.5 : 14.5}
          followPitch={navigating ? 55 : 0}
          followPadding={{ paddingTop: navigating ? 220 : 0, paddingBottom: panelHeight }}
          bounds={
            phase === 'preview' && routeBounds
              ? {
                  ...routeBounds,
                  paddingTop: insets.top + 100,
                  paddingBottom: panelHeight + 40,
                  paddingLeft: 48,
                  paddingRight: 48,
                }
              : undefined
          }
          defaultSettings={{ centerCoordinate: MADRID, zoomLevel: 5 }}
          animationDuration={800}
          onUserTrackingModeChange={(e) => {
            if (!e.nativeEvent.payload.followUserLocation && phaseRef.current !== 'preview') setFollowing(false);
          }}
        />

        {route && (
          <Mapbox.ShapeSource id="nav-route" shape={route.geometry}>
            <Mapbox.LineLayer
              id="nav-route-casing"
              style={{ lineColor: '#0B3D2A', lineWidth: 12, lineCap: 'round', lineJoin: 'round' }}
            />
            <Mapbox.LineLayer
              id="nav-route-line"
              aboveLayerID="nav-route-casing"
              style={{ lineColor: colors.accent, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }}
            />
          </Mapbox.ShapeSource>
        )}

        {sectionShapes && (
          <Mapbox.ShapeSource id="nav-sections" shape={sectionShapes}>
            <Mapbox.LineLayer
              id="nav-sections-line"
              style={{ lineColor: semantic.warning, lineWidth: 7, lineCap: 'round', lineJoin: 'round' }}
            />
          </Mapbox.ShapeSource>
        )}

        <Mapbox.ShapeSource id="speed-cameras" shape={CAMERA_FEATURES}>
          <Mapbox.CircleLayer
            id="speed-camera-dot"
            minZoomLevel={9}
            style={{
              circleRadius: ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 11],
              circleColor: ['match', ['get', 'kind'], 'section', semantic.warning, '#FFFFFF'],
              circleStrokeColor: ['match', ['get', 'kind'], 'section', '#8A6410', RADAR_RED],
              circleStrokeWidth: ['interpolate', ['linear'], ['zoom'], 9, 1, 14, 3],
            }}
          />
          <Mapbox.SymbolLayer
            id="speed-camera-limit"
            minZoomLevel={13}
            style={{
              textField: ['get', 'limit'],
              textSize: 10,
              textColor: '#111111',
              textFont: ['DIN Pro Bold', 'Arial Unicode MS Bold'],
              textAllowOverlap: true,
              textIgnorePlacement: true,
            }}
          />
        </Mapbox.ShapeSource>

        <Mapbox.LocationPuck
          puckBearingEnabled
          puckBearing="course"
          pulsing={{ isEnabled: !navigating, color: colors.accent }}
        />
      </Mapbox.MapView>

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        {navigating ? (
          <View style={styles.maneuverBanner}>
            {step?.next && !rerouting && <ManeuverIcon maneuver={step.next.maneuver} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.maneuverDistance}>{rerouting ? 'Recalculando…' : formatNavDistance(toManeuverM)}</Text>
              <Text style={styles.maneuverText} numberOfLines={2}>
                {step?.next?.text ?? destination?.name ?? ''}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.searchRow}>
            <Pressable
              onPress={phase === 'preview' ? endNavigation : () => router.back()}
              style={styles.roundButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Text style={styles.roundButtonText}>‹</Text>
            </Pressable>
            {phase === 'explore' ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="¿A dónde vas?"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                returnKeyType="search"
                autoCorrect={false}
                selectionColor={colors.accent}
              />
            ) : (
              <View style={styles.destinationPill}>
                <Text style={styles.destinationName} numberOfLines={1}>
                  {destination?.name}
                </Text>
                {!!destination?.address && (
                  <Text style={styles.destinationAddress} numberOfLines={1}>
                    {destination.address}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {phase === 'explore' && (results.length > 0 || searching) && (
          <View style={styles.results}>
            {results.length === 0 ? (
              <ActivityIndicator color={colors.textMuted} style={{ paddingVertical: spacing.lg }} />
            ) : (
              results.map((place, i) => (
                <Pressable
                  key={place.id}
                  onPress={() => choosePlace(place)}
                  style={({ pressed }) => [styles.resultRow, i > 0 && styles.resultDivider, pressed && styles.pressed]}
                >
                  <Text style={styles.resultName} numberOfLines={1}>
                    {place.name}
                  </Text>
                  {!!place.address && (
                    <Text style={styles.resultAddress} numberOfLines={1}>
                      {place.address}
                    </Text>
                  )}
                </Pressable>
              ))
            )}
          </View>
        )}

        {showAlerts && radar.section && <SectionCard section={radar.section} />}
        {showAlerts && radar.upcoming && <RadarCard camera={radar.upcoming} speedKmh={speed} />}
      </View>

      {phase !== 'preview' && (
        <View style={[styles.speedCluster, { bottom: panelHeight + MAP_LOGO_CLEARANCE }]} pointerEvents="none">
          <View style={[styles.speedBubble, overLimit && styles.speedBubbleOver]}>
            <Text style={[styles.speedValue, overLimit && { color: colors.danger }]}>{Math.round(speed)}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          {limit != null && <LimitSign value={limit} size={50} />}
        </View>
      )}

      {!following && phase !== 'preview' && (
        <Pressable
          onPress={() => setFollowing(true)}
          style={[styles.recenter, { bottom: panelHeight + MAP_LOGO_CLEARANCE }]}
          accessibilityRole="button"
        >
          <Text style={styles.recenterText}>◎ Recentrar</Text>
        </Pressable>
      )}

      <View
        style={[styles.panel, { bottom: insets.bottom + spacing.md }]}
        onLayout={(e) => setPanelHeight(Math.round(e.nativeEvent.layout.height + insets.bottom + spacing.md))}
      >
        {phase === 'explore' && (
          <>
            <View style={styles.panelRow}>
              <View style={[styles.radarDot, !fix && { backgroundColor: colors.textFaint }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.panelTitle}>Modo radar activo</Text>
                <Text style={styles.panelSubtitle}>
                  {gpsError ??
                    (fix
                      ? `${plural(nearbyCount, 'radar', 'radares')} en 10 km a la redonda`
                      : 'Buscando señal GPS…')}
                </Text>
              </View>
            </View>
            <Text style={styles.attribution}>
              Radares fijos y de tramo: DGT y © OpenStreetMap. Avisos orientativos: respeta siempre los límites.
            </Text>
          </>
        )}

        {phase === 'preview' &&
          (routeLoading ? (
            <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />
          ) : routeError ? (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.errorText}>{routeError}</Text>
              {destination && <PrimaryButton title="Reintentar" onPress={() => choosePlace(destination)} />}
            </View>
          ) : (
            route && (
              <View style={{ gap: spacing.md }}>
                <View>
                  <Text style={styles.previewDuration}>{formatEtaDuration(route.durationS)}</Text>
                  <Text style={styles.previewMeta}>
                    {formatNavDistance(route.total)} · llegada {arrivalTime(route.durationS)}
                  </Text>
                </View>
                {routeCams && (
                  <View style={styles.previewRadars}>
                    <View style={styles.previewRadarChip}>
                      <View style={[styles.chipDot, { borderColor: RADAR_RED }]} />
                      <Text style={styles.previewRadarText}>
                        {plural(routeCams.fixed.length, 'radar fijo', 'radares fijos')}
                      </Text>
                    </View>
                    <View style={styles.previewRadarChip}>
                      <View style={[styles.chipDot, { backgroundColor: semantic.warning, borderColor: semantic.warning }]} />
                      <Text style={styles.previewRadarText}>
                        {plural(routeCams.sections.length, 'tramo', 'tramos')}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={styles.previewButtons}>
                  <PrimaryButton title="Iniciar" onPress={startNavigation} style={{ flex: 1 }} />
                  <PrimaryButton title="Waze" variant="ghost" onPress={openInWaze} style={{ minWidth: 104 }} />
                </View>
              </View>
            )
          ))}

        {navigating && route && (
          <View style={styles.panelRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.navEta}>{arrivalTime(remainingS)}</Text>
              <Text style={styles.navMeta}>
                {formatEtaDuration(remainingS)} · {formatNavDistance(remainingM)}
              </Text>
              {tripStatus === 'tracking' && <Text style={styles.recText}>● Grabando trayecto</Text>}
            </View>
            <Pressable
              onPress={confirmExit}
              style={styles.exitButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Terminar navegación"
            >
              <Text style={styles.exitText}>✕</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const ARROW_ROTATION: Record<string, number> = {
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  uturn: 180,
  'sharp left': -135,
  left: -90,
  'slight left': -45,
};

function ManeuverIcon({ maneuver }: { maneuver: Maneuver }) {
  if (maneuver.type === 'arrive') return <Text style={styles.maneuverGlyph}>🏁</Text>;
  if (maneuver.type === 'roundabout' || maneuver.type === 'rotary' || maneuver.type === 'exit roundabout') {
    return (
      <View style={styles.maneuverIcon}>
        <Text style={styles.maneuverGlyph}>↺</Text>
        {maneuver.exit != null && <Text style={styles.maneuverExit}>{maneuver.exit}ª</Text>}
      </View>
    );
  }
  const rotation = ARROW_ROTATION[maneuver.modifier ?? 'straight'] ?? 0;
  return (
    <View style={styles.maneuverIcon}>
      <Text style={[styles.maneuverGlyph, { transform: [{ rotate: `${rotation}deg` }] }]}>↑</Text>
    </View>
  );
}

function LimitSign({ value, size = 44 }: { value: number; size?: number }) {
  return (
    <View
      style={[styles.limitSign, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.round(size * 0.12) }]}
      accessibilityLabel={`Límite ${value} kilómetros por hora`}
    >
      <Text style={[styles.limitText, { fontSize: Math.round(size * (value >= 100 ? 0.34 : 0.4)) }]}>{value}</Text>
    </View>
  );
}

function RadarCard({ camera, speedKmh }: { camera: UpcomingCamera; speedKmh: number }) {
  const over = camera.maxspeed != null && speedKmh > camera.maxspeed + 2;
  return (
    <View style={[styles.alertCard, over && styles.alertCardOver]}>
      <View style={[styles.alertIcon, camera.kind === 'section' && { borderColor: semantic.warning }]}>
        <Text style={styles.alertIconText}>{camera.kind === 'fixed' ? '📷' : '⏱️'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertTitle} numberOfLines={1}>
          {camera.kind === 'fixed' ? 'Radar fijo' : 'Tramo controlado'}
          {camera.road ? ` · ${camera.road}` : ''}
        </Text>
        <Text style={styles.alertDistance}>{formatNavDistance(camera.distanceM)}</Text>
        {over && <Text style={styles.alertOver}>Vas por encima del límite</Text>}
      </View>
      {camera.maxspeed != null && <LimitSign value={camera.maxspeed} size={48} />}
    </View>
  );
}

function SectionCard({ section }: { section: ActiveSection }) {
  const over = section.maxspeed != null && section.avgKmh > section.maxspeed;
  const tone = section.maxspeed == null ? colors.text : over ? colors.danger : colors.accent;
  return (
    <View style={[styles.sectionCard, over && styles.alertCardOver]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionLabel}>
          {section.finished ? 'TRAMO COMPLETADO' : 'TRAMO CONTROLADO'}
          {section.road ? ` · ${section.road}` : ''}
        </Text>
        <Text style={[styles.sectionAvg, { color: tone }]}>
          {Math.round(section.avgKmh)}
          <Text style={styles.sectionUnit}> km/h de media</Text>
        </Text>
        {!section.finished && <Text style={styles.sectionMeta}>Quedan {formatNavDistance(section.remainingM)}</Text>}
      </View>
      {section.maxspeed != null && <LimitSign value={section.maxspeed} size={52} />}
    </View>
  );
}

const glass = {
  backgroundColor: 'rgba(19, 21, 32, 0.96)',
  borderWidth: 1,
  borderColor: colors.border,
  ...shadow.floating,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.md, gap: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  roundButton: {
    ...glass,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundButtonText: { color: colors.text, fontSize: 30, lineHeight: 34, fontWeight: '600', marginTop: -2 },
  searchInput: {
    ...glass,
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    ...type.body,
  },
  destinationPill: { ...glass, flex: 1, minHeight: 48, borderRadius: 24, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  destinationName: { ...type.body, color: colors.text, fontWeight: '700' },
  destinationAddress: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  results: { ...glass, borderRadius: radius.md, overflow: 'hidden' },
  resultRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultName: { ...type.body, color: colors.text, fontWeight: '700' },
  resultAddress: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  pressed: { backgroundColor: colors.surfaceAlt },

  maneuverBanner: {
    ...glass,
    backgroundColor: '#0E3B2A',
    borderColor: 'rgba(79, 227, 161, 0.35)',
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  maneuverIcon: { width: 48, alignItems: 'center', justifyContent: 'center' },
  maneuverGlyph: { color: colors.text, fontSize: 40, fontWeight: '800', lineHeight: 46 },
  maneuverExit: { color: colors.accent, fontSize: 12, fontWeight: '800', marginTop: -4 },
  maneuverDistance: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  maneuverText: { ...type.subheading, color: 'rgba(247, 248, 252, 0.85)' },

  alertCard: {
    ...glass,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  alertCardOver: { borderColor: colors.danger, backgroundColor: 'rgba(58, 18, 22, 0.97)' },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: RADAR_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIconText: { fontSize: 18 },
  alertTitle: { ...type.caption, color: colors.textMuted },
  alertDistance: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  alertOver: { ...type.caption, color: colors.danger },
  sectionCard: {
    ...glass,
    borderColor: semantic.warning,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: { ...type.label, color: semantic.warning },
  sectionAvg: { fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  sectionUnit: { ...type.caption, color: colors.textMuted },
  sectionMeta: { ...type.caption, color: colors.textMuted },

  limitSign: { backgroundColor: '#FFFFFF', borderColor: RADAR_RED, alignItems: 'center', justifyContent: 'center' },
  limitText: { color: '#111111', fontWeight: '900', letterSpacing: -0.5 },

  speedCluster: { position: 'absolute', left: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  speedBubble: {
    ...glass,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBubbleOver: { borderColor: colors.danger, borderWidth: 2 },
  speedValue: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -1, lineHeight: 30 },
  speedUnit: { ...type.label, color: colors.textMuted },
  recenter: {
    ...glass,
    position: 'absolute',
    right: spacing.md,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  recenterText: { ...type.caption, color: colors.text },

  panel: {
    ...glass,
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  radarDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  panelTitle: { ...type.subheading, color: colors.text },
  panelSubtitle: { ...type.caption, color: colors.textMuted, fontWeight: '500' },
  attribution: { ...type.caption, color: colors.textFaint, fontWeight: '500', fontSize: 11, lineHeight: 15 },
  errorText: { ...type.body, color: colors.danger },
  previewDuration: { ...type.title, color: colors.accent },
  previewMeta: { ...type.body, color: colors.textMuted },
  previewRadars: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  previewRadarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, backgroundColor: '#FFFFFF' },
  previewRadarText: { ...type.caption, color: colors.text },
  previewButtons: { flexDirection: 'row', gap: spacing.sm },
  navEta: { ...type.title, color: colors.text },
  navMeta: { ...type.body, color: colors.textMuted },
  recText: { ...type.caption, color: colors.danger, marginTop: 2 },
  exitButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitText: { color: colors.danger, fontSize: 22, fontWeight: '800' },
});
