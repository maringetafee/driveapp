import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type AlertButton,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Mapbox from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import cameraData from '../src/data/speedCameras.json';
import { fetchDirections, searchPlaces, type Place } from '../src/lib/mapboxApi';
import { weatherAlertAt, type WeatherAlert } from '../src/lib/weatherApi';
import { broadcastLiveFix, broadcastLiveStop, openSharerChannel, type LiveFix } from '../src/lib/liveShare';
import { supabase } from '../src/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { allowScreenOff, keepScreenOn, setVoiceMode, speak, stopSpeaking, type VoiceMode } from '../src/lib/voice';
import { LaneGlyph, ManeuverGlyph } from '../src/components/nav/ManeuverGlyph';
import { useAuthStore } from '../src/state/authStore';
import { useTripStore } from '../src/state/tripStore';
import { colors, fonts, radius, semantic, shadow, spacing, type } from '../src/theme/colors';
import { finishTrip } from '../src/utils/finishTrip';
import {
  bannerAt,
  buildNavRoute,
  camerasAlongRoute,
  lineProgressAt,
  locateOnRoute,
  remainingDurationS,
  sliceRoute,
  stepIndexAt,
  type Banner,
  type Congestion,
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
// La ruta va en el azul secundario: el ámbar de marca se confundiría con el dorado
// de los tramos y el rojo de los radares.
const ROUTE_COLOR = colors.accentAlt;
const ROUTE_CASING = '#0D2350';
const TRAFFIC_COLOR: Record<Congestion, string> = {
  low: ROUTE_COLOR,
  moderate: '#FF9F1A',
  heavy: '#F0433A',
  severe: '#A3161C',
};
const MAP_IMAGES = {
  'nav-arrow': require('../assets/nav-arrow.png'),
  'nav-empty': require('../assets/nav-empty.png'),
};
const MADRID: [number, number] = [-3.7038, 40.4168];
const BANNER_BG = '#0F2347';
// El zoom se aleja con la velocidad para ver más carretera por delante.
const ZOOM_CITY = 17;
const ZOOM_ROAD = 16;
const ZOOM_HIGHWAY = 15;
// Por debajo de esto, la maniobra siguiente se anuncia ya ("Después…").
const THEN_STEP_MAX_M = 250;
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const tripStatus = useTripStore((s) => s.status);
  const destParams = useLocalSearchParams<{
    destLat?: string;
    destLon?: string;
    destName?: string;
    destAddress?: string;
  }>();

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
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>('voice');
  const [overview, setOverview] = useState(false);
  const [navZoom, setNavZoom] = useState(ZOOM_CITY);
  const [weatherAlert, setWeatherAlert] = useState<WeatherAlert | null>(null);
  const [weatherDismissed, setWeatherDismissed] = useState(false);
  const weatherFetched = useRef(false);
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([]);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [sharingWith, setSharingWith] = useState<{ id: string; username: string } | null>(null);
  const liveChannelRef = useRef<RealtimeChannel | null>(null);
  const lastBroadcastRef = useRef(0);

  const watcher = useRef(new RadarWatcher(CAMERA_INDEX)).current;
  const cameraRef = useRef<Mapbox.Camera>(null);
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
    setOverview(false);
    applyRoute(null);
  }, [applyRoute]);

  useEffect(() => {
    setVoiceMode(voiceMode);
  }, [voiceMode]);
  useEffect(() => () => setVoiceMode('voice'), []);

  const cycleVoiceMode = () =>
    setVoiceModeState((m) => (m === 'voice' ? 'alerts' : m === 'alerts' ? 'off' : 'voice'));

  const stopSharing = useCallback(async () => {
    const myId = useAuthStore.getState().session?.user.id;
    const channel = liveChannelRef.current;
    if (channel) {
      broadcastLiveStop(channel);
      supabase.removeChannel(channel);
      liveChannelRef.current = null;
    }
    if (myId && sharingWith) {
      await supabase.from('live_shares').delete().eq('sharer_id', myId).eq('viewer_id', sharingWith.id);
    }
    setSharingWith(null);
  }, [sharingWith]);

  const openSharePicker = async () => {
    if (sharingWith) {
      stopSharing();
      return;
    }
    const myId = useAuthStore.getState().session?.user.id;
    if (!myId) return;
    const { data: follows } = await supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', myId)
      .eq('status', 'accepted');
    const ids = (follows ?? []).map((f) => f.followed_id);
    if (ids.length === 0) {
      setFriends([]);
      setSharePickerOpen(true);
      return;
    }
    const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', ids);
    setFriends((profiles as { id: string; username: string }[]) ?? []);
    setSharePickerOpen(true);
  };

  const startSharing = async (friend: { id: string; username: string }) => {
    const myId = useAuthStore.getState().session?.user.id;
    if (!myId) return;
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await supabase
      .from('live_shares')
      .upsert({ sharer_id: myId, viewer_id: friend.id, expires_at: expiresAt }, { onConflict: 'sharer_id,viewer_id' });
    liveChannelRef.current = openSharerChannel(myId);
    setSharingWith(friend);
    setSharePickerOpen(false);
  };

  const sharingWithRef = useRef<{ id: string; username: string } | null>(null);
  useEffect(() => {
    sharingWithRef.current = sharingWith;
  }, [sharingWith]);

  useEffect(() => {
    if (phase !== 'navigating' && liveChannelRef.current) stopSharing();
  }, [phase, stopSharing]);

  useEffect(() => {
    return () => {
      const channel = liveChannelRef.current;
      if (channel) {
        broadcastLiveStop(channel);
        supabase.removeChannel(channel);
      }
      const myId = useAuthStore.getState().session?.user.id;
      if (myId && sharingWithRef.current) {
        supabase.from('live_shares').delete().eq('sharer_id', myId).eq('viewer_id', sharingWithRef.current.id);
      }
    };
  }, []);

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
    // Escalones con histéresis para que el zoom no oscile en torno a un umbral.
    setNavZoom((z) => {
      if (z === ZOOM_CITY) return speedKmh > 60 ? ZOOM_ROAD : z;
      if (z === ZOOM_ROAD) return speedKmh > 100 ? ZOOM_HIGHWAY : speedKmh < 40 ? ZOOM_CITY : z;
      return speedKmh < 80 ? ZOOM_ROAD : z;
    });

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
    for (const event of events) speak(radarSpeech(event, speedKmh), 'alert');

    if (liveChannelRef.current && Date.now() - lastBroadcastRef.current > 3000) {
      lastBroadcastRef.current = Date.now();
      broadcastLiveFix(liveChannelRef.current, { lat: p.lat, lon: p.lon, speedKmh, heading });
    }
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

  useEffect(() => {
    if (weatherFetched.current || !fix) return;
    weatherFetched.current = true;
    weatherAlertAt(fix.lat, fix.lon)
      .then(setWeatherAlert)
      .catch(() => {});
  }, [fix]);

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

  const autoDestApplied = useRef(false);
  useEffect(() => {
    if (autoDestApplied.current || phase !== 'explore' || !fix) return;
    const { destLat, destLon } = destParams;
    if (!destLat || !destLon) return;
    autoDestApplied.current = true;
    choosePlace({
      id: 'shared-destination',
      name: destParams.destName ?? 'Destino',
      address: destParams.destAddress ?? '',
      lat: Number(destLat),
      lon: Number(destLon),
    });
  }, [phase, fix, destParams.destLat, destParams.destLon, destParams.destName, destParams.destAddress]);

  const startNavigation = () => {
    if (!route) return;
    nav.current.spoken.clear();
    setPhase('navigating');
    setFollowing(true);
    setOverview(false);
    // Navegar también cuenta como trayecto de Roadly.
    if (useTripStore.getState().status === 'idle') useTripStore.getState().start();
  };

  const recenter = () => {
    setOverview(false);
    setFollowing(true);
  };

  const toggleOverview = () => {
    if (overview) {
      recenter();
      return;
    }
    setOverview(true);
    setFollowing(false);
    if (!routeBounds) return;
    // En plano y con el norte arriba, encuadrando lo que queda de ruta. Centro y zoom
    // se calculan aquí: el encuadre por límites de Mapbox no respeta la inclinación previa.
    const [east, north] = routeBounds.ne;
    const [west, south] = routeBounds.sw;
    const padding = { paddingTop: insets.top + 240, paddingBottom: panelHeight + 40, paddingLeft: 56, paddingRight: 88 };
    const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const lonSpan = Math.max(((east - west) * Math.PI) / 180, 1e-6);
    const latSpan = Math.max(mercY(north) - mercY(south), 1e-6);
    const availW = Math.max(80, windowWidth - padding.paddingLeft - padding.paddingRight);
    const availH = Math.max(80, windowHeight - padding.paddingTop - padding.paddingBottom);
    // Mapbox: el mundo mide 512 · 2^zoom puntos y abarca 2π radianes.
    const zoom = Math.min(Math.log2((availW * 2 * Math.PI) / (lonSpan * 512)), Math.log2((availH * 2 * Math.PI) / (latSpan * 512)));
    const midY = (mercY(north) + mercY(south)) / 2;
    const centerLat = ((2 * Math.atan(Math.exp(midY)) - Math.PI / 2) * 180) / Math.PI;
    // Se espera a que la cámara deje de seguir al usuario; si no, el seguimiento pisa el encuadre.
    setTimeout(
      () =>
        cameraRef.current?.setCamera({
          centerCoordinate: [(east + west) / 2, centerLat],
          zoomLevel: Math.min(17, Math.max(3, zoom)),
          padding,
          pitch: 0,
          heading: 0,
          animationDuration: 900,
          animationMode: 'easeTo',
        }),
      120
    );
  };

  // En la vista general solo interesa lo que queda; se recalcula cada pocos segmentos.
  const boundsFrom = phase === 'navigating' ? Math.floor(progress.segment / 25) * 25 : 0;
  const routeBounds = useMemo(() => {
    if (!route) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    for (let i = Math.min(boundsFrom, route.coords.length - 1); i < route.coords.length; i++) {
      const c = route.coords[i];
      minLat = Math.min(minLat, c.lat);
      maxLat = Math.max(maxLat, c.lat);
      minLon = Math.min(minLon, c.lon);
      maxLon = Math.max(maxLon, c.lon);
    }
    return { ne: [maxLon, maxLat], sw: [minLon, minLat] };
  }, [route, boundsFrom]);

  const trafficGradient = useMemo(() => {
    if (!route || route.traffic.length < 2) return null;
    const expr: unknown[] = ['step', ['line-progress'], TRAFFIC_COLOR[route.traffic[0].level]];
    let last = 0;
    for (const run of route.traffic.slice(1)) {
      const at = lineProgressAt(route, run.fromAlong);
      if (at <= last + 1e-6 || at >= 1) continue;
      expr.push(at, TRAFFIC_COLOR[run.level]);
      last = at;
    }
    return expr.length > 3 ? expr : null;
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

  const navigating = phase === 'navigating';
  const step = route && navigating ? route.steps[progress.step] : null;
  const banner = step ? bannerAt(step, progress.along) : null;
  const toManeuverM = step ? Math.max(0, step.endAlong - progress.along) : 0;
  const afterStep = route && step ? route.steps[progress.step + 1] : undefined;
  // Dos maniobras seguidas (salir de la autovía y rotonda): se anuncia ya la segunda.
  const thenBanner =
    afterStep?.banners.length && afterStep.endAlong - afterStep.startAlong < THEN_STEP_MAX_M && toManeuverM < 800
      ? afterStep.banners[0]
      : null;
  const remainingM = route ? Math.max(0, route.total - progress.along) : 0;
  const remainingS = route ? remainingDurationS(route, progress.along, progress.step) : 0;
  const speed = fix?.speedKmh ?? 0;
  const limit = navigating && route ? (route.maxspeed[progress.segment] ?? null) : null;
  const overLimit = limit != null && speed > limit + 2;
  const showAlerts = phase !== 'preview' && results.length === 0;
  // La parte ya recorrida se recorta de la línea (un poco por detrás de la flecha).
  const traveled = navigating && route ? lineProgressAt(route, Math.max(0, progress.along - 15)) : 0;
  const bannerSpace = navigating ? 230 : 100;
  // La flecha va en el tercio inferior para ver más carretera por delante.
  const followTop = navigating ? Math.max(0, Math.round(2 * 0.68 * windowHeight - (windowHeight - panelHeight))) : 0;

  const mainRoad = useMemo(() => {
    if (!route) return null;
    let best: { road: string; len: number } | null = null;
    for (const s of route.steps) {
      const len = s.endAlong - s.startAlong;
      if (s.road && (!best || len > best.len)) best = { road: s.road, len };
    }
    return best?.road ?? null;
  }, [route]);
  const heavyTraffic = !!route?.traffic.some((t) => t.level === 'heavy' || t.level === 'severe');

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
          ref={cameraRef}
          followUserLocation={following && !overview && phase !== 'preview'}
          followUserMode={navigating ? Mapbox.UserTrackingMode.FollowWithCourse : Mapbox.UserTrackingMode.Follow}
          followZoomLevel={navigating ? navZoom : 14.5}
          followPitch={navigating ? 60 : 0}
          followPadding={{ paddingTop: followTop, paddingBottom: panelHeight }}
          bounds={
            phase === 'preview' && routeBounds
              ? {
                  ...routeBounds,
                  paddingTop: insets.top + bannerSpace,
                  paddingBottom: panelHeight + 40,
                  paddingLeft: 48,
                  paddingRight: 72,
                }
              : undefined
          }
          defaultSettings={{ centerCoordinate: MADRID, zoomLevel: 5 }}
          animationDuration={900}
          onUserTrackingModeChange={(e) => {
            if (!e.nativeEvent.payload.followUserLocation && phaseRef.current !== 'preview') setFollowing(false);
          }}
        />

        <Mapbox.Images images={MAP_IMAGES} />

        {route && (
          <Mapbox.ShapeSource id="nav-route" shape={route.geometry} lineMetrics>
            <Mapbox.LineLayer
              id="nav-route-casing"
              style={{
                lineColor: ROUTE_CASING,
                lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 11, 18, 24],
                lineCap: 'round',
                lineJoin: 'round',
                lineTrimOffset: [0, traveled],
              }}
            />
            <Mapbox.LineLayer
              id="nav-route-line"
              aboveLayerID="nav-route-casing"
              style={{
                lineColor: ROUTE_COLOR,
                ...(trafficGradient ? { lineGradient: trafficGradient as never } : null),
                lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7, 18, 16],
                lineCap: 'round',
                lineJoin: 'round',
                lineTrimOffset: [0, traveled],
              }}
            />
          </Mapbox.ShapeSource>
        )}

        {sectionShapes && (
          <Mapbox.ShapeSource id="nav-sections" shape={sectionShapes}>
            <Mapbox.LineLayer
              id="nav-sections-line"
              style={{
                lineColor: semantic.warning,
                lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 7, 18, 16],
                lineCap: 'round',
                lineJoin: 'round',
              }}
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
              circlePitchAlignment: 'map',
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
          topImage="nav-empty"
          shadowImage="nav-empty"
          bearingImage="nav-arrow"
          scale={['interpolate', ['linear'], ['zoom'], 8, 0.6, 15, 0.9, 18, 1.1]}
          pulsing={{ isEnabled: false }}
        />
      </Mapbox.MapView>

      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        {navigating ? (
          <NavBanner
            banner={banner}
            distanceM={toManeuverM}
            rerouting={rerouting}
            fallback={destination?.name ?? ''}
            then={thenBanner}
          />
        ) : (
          <View style={styles.searchRow}>
            <Pressable
              onPress={phase === 'preview' ? endNavigation : () => router.back()}
              style={styles.roundButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
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
                  <Ionicons name="location-outline" size={20} color={colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {place.name}
                    </Text>
                    {!!place.address && (
                      <Text style={styles.resultAddress} numberOfLines={1}>
                        {place.address}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}

        {sharePickerOpen && (
          <View style={styles.results}>
            {friends.length === 0 ? (
              <View style={styles.resultRow}>
                <Text style={styles.resultAddress}>Sigue a algún amigo para poder compartir tu ubicación con él.</Text>
              </View>
            ) : (
              friends.map((friend, i) => (
                <Pressable
                  key={friend.id}
                  onPress={() => startSharing(friend)}
                  style={({ pressed }) => [styles.resultRow, i > 0 && styles.resultDivider, pressed && styles.pressed]}
                >
                  <Ionicons name="person-circle-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.resultName}>@{friend.username}</Text>
                </Pressable>
              ))
            )}
            <Pressable onPress={() => setSharePickerOpen(false)} style={[styles.resultRow, styles.resultDivider]}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
              <Text style={styles.resultAddress}>Cancelar</Text>
            </Pressable>
          </View>
        )}

        {phase === 'explore' && !weatherDismissed && weatherAlert && results.length === 0 && !searching && (
          <Pressable style={styles.weatherBanner} onPress={() => setWeatherDismissed(true)}>
            <Ionicons name={weatherAlert.icon} size={18} color={colors.text} />
            <Text style={styles.weatherText} numberOfLines={2}>
              {weatherAlert.text}
            </Text>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}

        {showAlerts && radar.section && <SectionCard section={radar.section} />}
        {showAlerts && radar.upcoming && <RadarCard camera={radar.upcoming} speedKmh={speed} />}
      </View>

      {phase !== 'preview' && (
        <View style={[styles.speedCluster, { bottom: panelHeight + MAP_LOGO_CLEARANCE }]} pointerEvents="none">
          {limit != null && <LimitSign value={limit} size={54} />}
          <View style={[styles.speedBubble, overLimit && styles.speedBubbleOver]}>
            <Text style={[styles.speedValue, overLimit && { color: colors.danger }]}>{Math.round(speed)}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
        </View>
      )}

      {navigating && (
        <View style={[styles.sideControls, { bottom: panelHeight + MAP_LOGO_CLEARANCE }]}>
          <MapControl
            icon={voiceMode === 'voice' ? 'volume-high' : voiceMode === 'alerts' ? 'warning' : 'volume-mute'}
            label={
              voiceMode === 'voice'
                ? 'Voz completa: toca para solo alertas de radar'
                : voiceMode === 'alerts'
                  ? 'Solo alertas de radar: toca para silenciar todo'
                  : 'Todo silenciado: toca para activar la voz'
            }
            active={voiceMode !== 'voice'}
            onPress={cycleVoiceMode}
          />
          <MapControl
            icon={overview ? 'navigate' : 'git-branch-outline'}
            label={overview ? 'Volver a la navegación' : 'Ver la ruta completa'}
            active={overview}
            onPress={toggleOverview}
          />
          <MapControl
            icon="location"
            label={sharingWith ? `Compartiendo con @${sharingWith.username}: toca para dejar de compartir` : 'Compartir ubicación en directo'}
            active={!!sharingWith}
            onPress={openSharePicker}
          />
        </View>
      )}

      {(!following || overview) && phase !== 'preview' && (
        <View style={[styles.recenterWrap, { bottom: panelHeight + spacing.md }]} pointerEvents="box-none">
          <Pressable onPress={recenter} style={styles.recenter} accessibilityRole="button">
            <Ionicons name="navigate" size={16} color={colors.onAccent} />
            <Text style={styles.recenterText}>Recentrar</Text>
          </Pressable>
        </View>
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
                  <Text style={[styles.previewDuration, heavyTraffic && { color: TRAFFIC_COLOR.moderate }]}>
                    {formatEtaDuration(route.durationS)}
                  </Text>
                  <Text style={styles.previewMeta}>
                    {formatNavDistance(route.total)} · llegada {arrivalTime(route.durationS)}
                  </Text>
                  <Text style={styles.previewRoad} numberOfLines={1}>
                    {heavyTraffic ? 'Ruta más rápida · hay tráfico denso' : 'Ruta más rápida con el tráfico actual'}
                    {mainRoad ? ` · por ${mainRoad.split(' · ')[0]}` : ''}
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
                <PrimaryButton title="Iniciar navegación" onPress={startNavigation} />
              </View>
            )
          ))}

        {navigating && route && (
          <View style={styles.panelRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.navEta}>{formatEtaDuration(remainingS)}</Text>
              <Text style={styles.navMeta}>
                {formatNavDistance(remainingM)} · llegada {arrivalTime(remainingS)}
              </Text>
              {!!step?.road && (
                <Text style={styles.navRoad} numberOfLines={1}>
                  Por {step.road}
                </Text>
              )}
              {tripStatus === 'tracking' && <Text style={styles.recText}>● Grabando trayecto</Text>}
            </View>
            <Pressable
              onPress={confirmExit}
              style={styles.exitButton}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Terminar navegación"
            >
              <Ionicons name="close" size={26} color={colors.danger} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const ORDINAL = ['', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª'];
const ROUNDABOUTS = new Set(['roundabout', 'rotary', 'roundabout turn']);

function NavBanner({
  banner,
  distanceM,
  rerouting,
  fallback,
  then,
}: {
  banner: Banner | null;
  distanceM: number;
  rerouting: boolean;
  fallback: string;
  then: Banner | null;
}) {
  if (rerouting) {
    return (
      <View style={styles.banner}>
        <View style={styles.bannerMain}>
          <ActivityIndicator color="#FFFFFF" style={styles.bannerGlyph} />
          <Text style={styles.maneuverDistance}>Recalculando…</Text>
        </View>
      </View>
    );
  }
  const exit = banner && ROUNDABOUTS.has(banner.maneuver.type) ? banner.maneuver.exit : undefined;
  return (
    <View style={styles.banner} accessibilityRole="header">
      <View style={styles.bannerMain}>
        <View style={styles.bannerGlyph}>
          {banner && <ManeuverGlyph maneuver={banner.maneuver} size={64} />}
          {exit != null && <Text style={styles.bannerExitOrdinal}>{ORDINAL[exit] ?? `${exit}ª`} salida</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.maneuverDistance}>{formatNavDistance(distanceM)}</Text>
          {banner ? (
            <View style={styles.partsRow}>
              {banner.parts.map((p, i) =>
                p.kind === 'shield' ? (
                  <RoadShield key={i} text={p.text} shield={p.shield} />
                ) : p.kind === 'exit' ? (
                  <View key={i} style={styles.exitBadge}>
                    <Text style={styles.exitBadgeText}>Salida {p.text}</Text>
                  </View>
                ) : (
                  <Text key={i} style={styles.maneuverText} numberOfLines={2}>
                    {p.text}
                  </Text>
                )
              )}
            </View>
          ) : (
            <Text style={styles.maneuverText} numberOfLines={2}>
              {fallback}
            </Text>
          )}
          {!!banner?.secondary && (
            <Text style={styles.bannerSecondary} numberOfLines={1}>
              Dirección {banner.secondary}
            </Text>
          )}
        </View>
      </View>
      {!!banner?.lanes && (
        <View style={styles.lanes} accessibilityLabel="Carriles recomendados">
          {banner.lanes.map((lane, i) => (
            <View key={i} style={[styles.lane, i > 0 && styles.laneDivider]}>
              <LaneGlyph {...lane} size={34} />
            </View>
          ))}
        </View>
      )}
      {!!then && (
        <View style={styles.thenRow}>
          <Text style={styles.thenText}>Después</Text>
          <ManeuverGlyph maneuver={then.maneuver} size={24} />
        </View>
      )}
    </View>
  );
}

function shieldColors(name: string): { bg: string; fg: string; border?: string } {
  if (name.includes('blue')) return { bg: '#1B5FC9', fg: '#FFFFFF', border: '#FFFFFF' };
  if (name.includes('red')) return { bg: '#D1232A', fg: '#FFFFFF', border: '#FFFFFF' };
  if (name.includes('green')) return { bg: '#1E7B3F', fg: '#FFFFFF', border: '#FFFFFF' };
  if (name.includes('orange')) return { bg: '#F28A1E', fg: '#111111' };
  if (name.includes('yellow')) return { bg: '#F4C21D', fg: '#111111' };
  return { bg: '#FFFFFF', fg: '#111111' };
}

function RoadShield({ text, shield }: { text: string; shield: string }) {
  const c = shieldColors(shield);
  return (
    <View style={[styles.shield, { backgroundColor: c.bg, borderColor: c.border ?? c.bg }]}>
      <Text style={[styles.shieldText, { color: c.fg }]}>{text}</Text>
    </View>
  );
}

function MapControl({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.mapControl, active && styles.mapControlActive, pressed && { opacity: 0.8 }]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={22} color={active ? colors.onAccent : colors.text} />
    </Pressable>
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
        <Ionicons
          name={camera.kind === 'fixed' ? 'camera' : 'stopwatch'}
          size={20}
          color={camera.kind === 'fixed' ? RADAR_RED : semantic.warning}
        />
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
  destinationName: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text },
  destinationAddress: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  results: { ...glass, borderRadius: radius.md, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  resultName: { ...type.body, fontFamily: fonts.bodyBold, color: colors.text },
  resultAddress: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  pressed: { backgroundColor: colors.surfaceAlt },
  weatherBanner: {
    ...glass,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  weatherText: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.text, flex: 1 },

  banner: {
    ...shadow.floating,
    backgroundColor: BANNER_BG,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(78, 139, 255, 0.35)',
    overflow: 'hidden',
  },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  bannerGlyph: { width: 68, alignItems: 'center', justifyContent: 'center' },
  bannerExitOrdinal: { ...type.label, color: colors.text, marginTop: 4 },
  maneuverDistance: { fontFamily: fonts.numeralBold, color: colors.text, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  partsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  maneuverText: { ...type.subheading, color: colors.text, flexShrink: 1 },
  bannerSecondary: { ...type.caption, fontFamily: fonts.bodySemiBold, color: 'rgba(249, 247, 245, 0.7)' },
  shield: { borderRadius: 5, borderWidth: 1.5, paddingHorizontal: 6, paddingVertical: 1 },
  shieldText: { fontFamily: fonts.bodyExtraBold, fontSize: 15, letterSpacing: 0.2 },
  exitBadge: { backgroundColor: colors.accent, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  exitBadgeText: { fontFamily: fonts.bodyExtraBold, fontSize: 14, color: colors.onAccent },
  lanes: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  lane: { paddingHorizontal: 8 },
  laneDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255, 255, 255, 0.18)' },
  thenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    paddingVertical: 6,
    paddingHorizontal: spacing.lg,
  },
  thenText: { ...type.caption, fontFamily: fonts.bodySemiBold, color: colors.text },

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
  alertTitle: { ...type.caption, color: colors.textMuted },
  alertDistance: { fontFamily: fonts.numeralBold, color: colors.text, fontSize: 24, letterSpacing: -0.4 },
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
  sectionAvg: { fontFamily: fonts.numeralBold, fontSize: 34, letterSpacing: -1, marginTop: 2 },
  sectionUnit: { ...type.caption, color: colors.textMuted },
  sectionMeta: { ...type.caption, color: colors.textMuted },

  limitSign: { backgroundColor: '#FFFFFF', borderColor: RADAR_RED, alignItems: 'center', justifyContent: 'center' },
  limitText: { fontFamily: fonts.numeralBold, color: '#111111', letterSpacing: -0.5 },

  speedCluster: { position: 'absolute', left: spacing.md, alignItems: 'center', gap: spacing.sm },
  sideControls: { position: 'absolute', right: spacing.md, gap: spacing.sm },
  mapControl: {
    ...glass,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapControlActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  recenterWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  speedBubble: {
    ...glass,
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedBubbleOver: { borderColor: colors.danger, borderWidth: 2 },
  speedValue: { fontFamily: fonts.numeralBold, color: colors.text, fontSize: 28, letterSpacing: -1, lineHeight: 32 },
  speedUnit: { ...type.label, color: colors.textMuted },
  recenter: {
    ...shadow.floating,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  recenterText: { ...type.caption, fontFamily: fonts.bodyBold, color: colors.onAccent },

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
  panelSubtitle: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted },
  attribution: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 11, lineHeight: 15 },
  errorText: { ...type.body, color: colors.danger },
  previewDuration: { ...type.title, color: colors.accent },
  previewMeta: { ...type.body, color: colors.textMuted },
  previewRoad: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textFaint, marginTop: 2 },
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
  navEta: { ...type.title, color: colors.accent },
  navMeta: { ...type.body, color: colors.text },
  navRoad: { ...type.caption, fontFamily: fonts.bodyMedium, color: colors.textMuted, marginTop: 2 },
  recText: { ...type.caption, color: colors.danger, marginTop: 2 },
  exitButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
