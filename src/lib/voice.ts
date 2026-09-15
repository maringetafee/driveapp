// Voz y pantalla encendida para la navegación. Son módulos nativos: si la build
// instalada todavía no los incluye, la app funciona igual, solo que sin ellos.
import { requireOptionalNativeModule } from 'expo';

type SpeechModule = typeof import('expo-speech');
type KeepAwakeModule = typeof import('expo-keep-awake');

const speech: SpeechModule | null = requireOptionalNativeModule('ExpoSpeech') ? require('expo-speech') : null;
const keepAwake: KeepAwakeModule | null = requireOptionalNativeModule('ExpoKeepAwake')
  ? require('expo-keep-awake')
  : null;

export const voiceAvailable = speech != null;

export function speak(text: string) {
  speech?.speak(text, { language: 'es-ES' });
}

export function stopSpeaking() {
  speech?.stop();
}

const KEEP_AWAKE_TAG = 'roadly-navigation';

export function keepScreenOn() {
  keepAwake?.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
}

export function allowScreenOff() {
  Promise.resolve(keepAwake?.deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
}
