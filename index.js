// Hace falta un entry propio (en vez de "expo-router/entry") para además
// registrar el manejador del widget de Android. Reutiliza expo-router/entry
// en vez de reimplementarlo: @expo/metro-runtime solo está instalado dentro
// de node_modules/expo-router/node_modules, así que solo se resuelve bien
// importado desde dentro del propio paquete expo-router.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
