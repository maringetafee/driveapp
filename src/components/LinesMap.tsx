import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson';
import { colors, radius, shadow } from '../theme/colors';
import { boundsOf } from '../utils/routeGeo';

export interface MapLine {
  id: string;
  shape: LineString | MultiLineString;
  color: string;
  width?: number;
  opacity?: number;
}

interface Props {
  lines: MapLine[];
  points?: FeatureCollection<Point>;
  pointColor?: string;
  /** Encuadre; por defecto, todas las líneas y puntos. */
  fit?: LineString;
  height?: number;
}

/** Mapa estático con varias líneas (y puntos opcionales) encuadradas. */
export default function LinesMap({ lines, points, pointColor = colors.accent, fit, height = 240 }: Props) {
  const bounds = useMemo(() => {
    const coords = fit
      ? fit.coordinates
      : [
          ...lines.flatMap((l) => (l.shape.type === 'LineString' ? l.shape.coordinates : l.shape.coordinates.flat())),
          ...(points?.features.map((f) => f.geometry.coordinates) ?? []),
        ];
    if (!coords.length) return null;
    const b = boundsOf(coords);
    return { ne: [b.maxLon, b.maxLat], sw: [b.minLon, b.minLat] };
  }, [lines, points, fit]);

  return (
    <View style={[styles.container, { height }]}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Dark} scaleBarEnabled={false} logoEnabled={false}>
        <Mapbox.Camera
          bounds={bounds ? { ...bounds, paddingLeft: 32, paddingRight: 32, paddingTop: 32, paddingBottom: 32 } : undefined}
          animationDuration={250}
        />
        {lines.map((line) => (
          <Mapbox.ShapeSource key={line.id} id={`lines-map-${line.id}`} shape={line.shape}>
            <Mapbox.LineLayer
              id={`lines-map-${line.id}-layer`}
              style={{
                lineColor: line.color,
                lineWidth: line.width ?? 4,
                lineOpacity: line.opacity ?? 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        ))}
        {points && points.features.length > 0 && (
          <Mapbox.ShapeSource id="lines-map-points" shape={points}>
            <Mapbox.CircleLayer
              id="lines-map-points-layer"
              style={{
                circleColor: pointColor,
                circleRadius: 5,
                circleStrokeColor: colors.background,
                circleStrokeWidth: 1.5,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  map: { flex: 1 },
});
