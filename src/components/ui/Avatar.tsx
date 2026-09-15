import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../theme/colors';

const PALETTE = [colors.accent, colors.accentAlt, colors.gold, colors.bronze, colors.silver];

function hashToIndex(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) % PALETTE.length;
  return Math.abs(hash);
}

export default function Avatar({ username, size = 40 }: { username: string; size?: number }) {
  const tone = PALETTE[hashToIndex(username || '?')];
  const initial = (username?.trim()?.[0] ?? '?').toUpperCase();

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${tone}26`,
          borderColor: tone,
        },
      ]}
    >
      <Text style={[styles.initial, { color: tone, fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  initial: { fontFamily: fonts.numeralBold },
});
