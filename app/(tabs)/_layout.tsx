import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { colors } from '../../src/theme/colors';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.surface}
      shadowColor={colors.border}
      indicatorColor={colors.accentSoft}
      rippleColor={colors.accentSoft}
      iconColor={{ default: colors.textFaint, selected: colors.accent }}
      labelStyle={{
        default: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        selected: { color: colors.accent, fontWeight: '700' },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Conducir</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="speedometer" md="speed" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>Historial</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feed">
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="groups" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="leaderboard">
        <NativeTabs.Trigger.Label>Ranking</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="trophy.fill" md="emoji_events" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
