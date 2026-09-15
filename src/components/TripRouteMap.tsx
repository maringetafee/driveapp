import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import type { LineString, Position } from 'geojson';
import { colors, radius, shadow } from '../theme/colors';

interface Props {
  route: LineString | null;
  height?: number;
}

function boundsFor(coordinates: Position[]): { ne: Position; sw: Position } {
  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  for (const [lng, lat] of coordinates) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { ne: [maxLng, maxLat], sw: [minLng, minLat] };
}

export default function TripRouteMap({ route, height = 220 }: Props) {
  const bounds = useMemo(
    () => (route && route.coordinates.length > 1 ? boundsFor(route.coordinates) : null),
    [route]
  );

  if (!route || route.coordinates.length < 2) {
    return null;
  }

  return (
    <View style={[styles.container, { height }]}>
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Dark} scaleBarEnabled={false} logoEnabled={false}>
        <Mapbox.Camera
          bounds={bounds ? { ...bounds, paddingLeft: 32, paddingRight: 32, paddingTop: 32, paddingBottom: 32 } : undefined}
          animationDuration={0}
        />
        <Mapbox.ShapeSource id="trip-route-source" shape={route}>
          <Mapbox.LineLayer
            id="trip-route-line"
            style={{ lineColor: colors.accent, lineWidth: 4, lineCap: 'round', lineJoin: 'round' }}
          />
        </Mapbox.ShapeSource>
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
