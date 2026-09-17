import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { StreakWidget } from './src/widgets/StreakWidget';
import { loadWidgetStreakData } from './src/widgets/streakWidgetData';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetInfo.widgetName !== 'RoadlyStreak') return;

  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await loadWidgetStreakData();
      props.renderWidget(<StreakWidget {...data} />);
      break;
    }
    case 'WIDGET_DELETED':
    case 'WIDGET_CLICK':
      break;
  }
}
