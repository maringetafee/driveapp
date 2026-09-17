import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { StreakWidget } from './StreakWidget';
import { saveWidgetStreakData, type WidgetStreakData } from './streakWidgetData';

/** Actualiza el widget de la pantalla de inicio con la racha y el último resultado. */
export function syncStreakWidget(data: WidgetStreakData) {
  if (Platform.OS !== 'android') return;
  saveWidgetStreakData(data);
  requestWidgetUpdate({
    widgetName: 'RoadlyStreak',
    renderWidget: () => <StreakWidget {...data} />,
  });
}
