import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import type { MapLine } from './LinesMap';

export type { MapLine };

// @rnmapbox/maps no tiene build web.
export default function LinesMap({ height = 240 }: { height?: number; lines: MapLine[] }) {
  return (
    <View style={[styles.container, { height }]}>
      <Text style={styles.text}>El mapa solo está disponible en iOS/Android.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.textMuted, fontSize: 13 },
});
