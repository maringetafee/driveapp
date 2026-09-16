// Pictogramas de maniobra (giros, rotondas, salidas, carriles) dibujados con
// Views: no necesitan ninguna librería nativa extra.
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Maneuver } from '../../utils/navRoute';

const GRID = 26;
type Pt = [number, number];

/** Ángulo de giro: 0 recto, positivo a la derecha. */
const TURN_ANGLE: Record<string, number> = {
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  'slight left': -45,
  left: -90,
  'sharp left': -135,
};

// Grados recorridos en la rotonda (sentido antihorario) si Mapbox no los da.
const ROUNDABOUT_DEGREES: Record<string, number> = {
  'sharp right': 45,
  right: 90,
  'slight right': 135,
  straight: 180,
  'slight left': 225,
  left: 270,
  'sharp left': 315,
  uturn: 350,
};

const BRANCH_TYPES = new Set(['fork', 'off ramp', 'on ramp', 'merge']);
const ROUNDABOUT_TYPES = new Set(['roundabout', 'rotary', 'roundabout turn', 'exit roundabout', 'exit rotary']);

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Dirección en pantalla para un ángulo (0 = arriba, sentido horario). */
const dir = (deg: number): Pt => [Math.sin(rad(deg)), -Math.cos(rad(deg))];

function Bar({ a, b, w, color, s }: { a: Pt; b: Pt; w: number; color: string; s: number }) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = (Math.hypot(dx, dy) + w) * s;
  const width = w * s;
  return (
    <View
      style={{
        position: 'absolute',
        left: ((a[0] + b[0]) / 2) * s - len / 2,
        top: ((a[1] + b[1]) / 2) * s - width / 2,
        width: len,
        height: width,
        borderRadius: width / 2,
        backgroundColor: color,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
      }}
    />
  );
}

/** Punta de flecha con la base centrada en `at`, apuntando hacia `angle`. */
function Head({ at, angle, size, color, s }: { at: Pt; angle: number; size: number; color: string; s: number }) {
  const half = (size / 2) * s;
  const length = size * 0.72 * s;
  const [ux, uy] = dir(angle);
  const cx = at[0] * s + (ux * length) / 2;
  const cy = at[1] * s + (uy * length) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - half,
        top: cy - length / 2,
        width: 0,
        height: 0,
        borderLeftWidth: half,
        borderRightWidth: half,
        borderBottomWidth: length,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: color,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function TurnArrow({ maneuver, color, dim, s }: { maneuver: Maneuver; color: string; dim: string; s: number }) {
  const w = 3.4;
  const head = 10;
  const modifier = maneuver.modifier ?? 'straight';
  const parts: ReactNode[] = [];

  if (modifier === 'uturn') {
    // En España el cambio de sentido se hace por la izquierda.
    const r = 4;
    const ring = (2 * r + w) * s;
    parts.push(
      <Bar key="stem" a={[17, 24]} b={[17, 11]} w={w} color={color} s={s} />,
      <View
        key="arc"
        style={{
          position: 'absolute',
          left: 13 * s - ring / 2,
          top: 11 * s - ring / 2,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: w * s,
          borderTopColor: color,
          borderRightColor: color,
          borderBottomColor: 'transparent',
          borderLeftColor: 'transparent',
          transform: [{ rotate: '-45deg' }],
        }}
      />,
      <Bar key="down" a={[9, 11]} b={[9, 14]} w={w} color={color} s={s} />,
      <Head key="head" at={[9, 14]} angle={180} size={head} color={color} s={s} />
    );
    return <>{parts}</>;
  }

  const angle = TURN_ANGLE[modifier] ?? 0;
  const branch = BRANCH_TYPES.has(maneuver.type) && angle !== 0;
  if (angle === 0) {
    parts.push(
      <Bar key="stem" a={[13, 24]} b={[13, 9]} w={w} color={color} s={s} />,
      <Head key="head" at={[13, 9]} angle={0} size={head} color={color} s={s} />
    );
    return <>{parts}</>;
  }

  // Bifurcaciones y salidas: la vía principal en tenue y el ramal destacado.
  const stemX = branch ? 13 : 13 - Math.sign(angle) * (Math.abs(angle) >= 90 ? 5 : 3);
  const kneeY = branch ? 16 : Math.abs(angle) > 90 ? 10 : Math.abs(angle) === 90 ? 13 : 14;
  if (branch) {
    parts.push(
      <Bar key="ghost" a={[13, 24]} b={[13, 9]} w={w} color={dim} s={s} />,
      <Head key="ghost-head" at={[13, 9]} angle={0} size={head} color={dim} s={s} />
    );
  }
  const [ux, uy] = dir(angle);
  const arm = Math.abs(angle) > 90 ? 5 : 6.5;
  const end: Pt = [stemX + ux * arm, kneeY + uy * arm];
  parts.push(
    <Bar key="stem" a={[stemX, 24]} b={[stemX, kneeY]} w={w} color={color} s={s} />,
    <Bar key="arm" a={[stemX, kneeY]} b={end} w={w} color={color} s={s} />,
    <Head key="head" at={end} angle={angle} size={head} color={color} s={s} />
  );
  return <>{parts}</>;
}

function RoundaboutArrow({ maneuver, color, dim, s }: { maneuver: Maneuver; color: string; dim: string; s: number }) {
  const w = 3;
  const cx = 13;
  const cy = 12;
  const r = 4.5;
  // Se entra un poco a la derecha del eje (se circula por la derecha) para que una
  // salida de vuelta hacia atrás no se monte sobre la entrada.
  const entry = 20;
  const raw = maneuver.degrees ?? ROUNDABOUT_DEGREES[maneuver.modifier ?? 'straight'] ?? 180;
  const degrees = Math.min(335, Math.max(entry + 25, raw));
  // Se recorre en sentido antihorario visto desde arriba: abajo → derecha → arriba → izquierda.
  const at = (deg: number, radius = r): Pt => [cx + radius * Math.sin(rad(deg)), cy + radius * Math.cos(rad(deg))];
  const ring = (2 * r + w) * s;
  const parts: ReactNode[] = [
    <View
      key="ring"
      style={{
        position: 'absolute',
        left: cx * s - ring / 2,
        top: cy * s - ring / 2,
        width: ring,
        height: ring,
        borderRadius: ring / 2,
        borderWidth: w * s,
        borderColor: dim,
      }}
    />,
    <Bar key="entry" a={[at(entry)[0], 25]} b={at(entry)} w={w} color={color} s={s} />,
  ];
  const step = 15;
  for (let d = entry; d < degrees; d += step) {
    parts.push(<Bar key={`arc-${d}`} a={at(d)} b={at(Math.min(degrees, d + step))} w={w} color={color} s={s} />);
  }
  const exitEnd = at(degrees, r + 3.5);
  const [ox, oy] = [Math.sin(rad(degrees)), Math.cos(rad(degrees))];
  parts.push(
    <Bar key="exit" a={at(degrees)} b={exitEnd} w={w} color={color} s={s} />,
    <Head
      key="head"
      at={exitEnd}
      angle={(Math.atan2(ox, -oy) * 180) / Math.PI}
      size={8.5}
      color={color}
      s={s}
    />
  );
  return <>{parts}</>;
}

interface GlyphProps {
  maneuver: Maneuver;
  size: number;
  color?: string;
  dimColor?: string;
}

export const ManeuverGlyph = memo(function ManeuverGlyph({
  maneuver,
  size,
  color = '#FFFFFF',
  dimColor = 'rgba(255,255,255,0.28)',
}: GlyphProps) {
  const s = size / GRID;
  let content: ReactNode;
  if (maneuver.type === 'arrive') {
    content = <Ionicons name="flag" size={size * 0.8} color={color} style={styles.centerIcon} />;
  } else if (ROUNDABOUT_TYPES.has(maneuver.type)) {
    content = <RoundaboutArrow maneuver={maneuver} color={color} dim={dimColor} s={s} />;
  } else {
    content = <TurnArrow maneuver={maneuver} color={color} dim={dimColor} s={s} />;
  }
  return (
    <View style={[styles.box, { width: size, height: size }]} pointerEvents="none">
      {content}
    </View>
  );
});

export const LaneGlyph = memo(function LaneGlyph({
  directions,
  active,
  activeDirection,
  size,
}: {
  directions: string[];
  active: boolean;
  activeDirection?: string;
  size: number;
}) {
  const direction = (active && activeDirection) || directions[0] || 'straight';
  const modifier = direction === 'none' ? 'straight' : direction;
  return (
    <ManeuverGlyph
      maneuver={{ type: 'turn', modifier }}
      size={size}
      color={active ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
      dimColor="transparent"
    />
  );
});

const styles = StyleSheet.create({
  box: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  centerIcon: { textAlign: 'center' },
});
