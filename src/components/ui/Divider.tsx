import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';

export default function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: { height: 1, backgroundColor: colors.border },
});
