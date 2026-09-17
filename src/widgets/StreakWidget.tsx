// Sin hooks: esto se renderiza a RemoteViews nativas, no a una vista de RN real.
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetStreakData } from './streakWidgetData';

export function StreakWidget({ streak, lastScore }: WidgetStreakData) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: '#15171F',
        borderRadius: 20,
        padding: 16,
        justifyContent: 'center',
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="🔥" style={{ fontSize: 22 }} />
        <TextWidget
          text={streak > 0 ? `${streak} días` : 'Sin racha'}
          style={{ fontSize: 20, color: '#FF9C3D', marginLeft: 8 }}
        />
      </FlexWidget>
      <TextWidget
        text={lastScore != null ? `Último score: ${lastScore}` : 'Aún sin trayectos'}
        style={{ fontSize: 13, color: '#A9AEC2', marginTop: 6 }}
      />
    </FlexWidget>
  );
}
