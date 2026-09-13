import { StyleSheet, Text, View } from 'react-native';
import type { LineString } from 'geojson';
import { colors } from '../theme/colors';

interface Props {
  route: LineString | null;
  height?: number;
}

// @rnmapbox/maps es nativo puro (no hay build web), así que en web mostramos
// un aviso en vez de la ruta. Metro elige este archivo automáticamente para
// la plataforma web por la extensión .web.tsx.
export default function TripRouteMap({ route, height = 220 }: Props) {
  if (!route || route.coordinates.length < 2) return null;

  return (
    <View style={[styles.container, { height }]}>
      <Text style={styles.text}>El mapa de la ruta solo está disponible en iOS/Android.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  text: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
