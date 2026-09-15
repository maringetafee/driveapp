import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../../theme/colors';

interface Props {
  title: string;
  action?: { label: string; onPress: () => void };
}

export default function SectionHeader({ title, action }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action && (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.subheading, color: colors.text },
  action: { ...type.caption, color: colors.accentAlt },
});
