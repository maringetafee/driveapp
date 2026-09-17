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

/** 'voice': guía por voz + avisos de radar. 'alerts': solo avisos de radar. 'off': sin voz. */
export type VoiceMode = 'voice' | 'alerts' | 'off';

let mode: VoiceMode = 'voice';

export function setVoiceMode(next: VoiceMode) {
  mode = next;
  if (mode === 'off') speech?.stop();
}

export function speak(text: string, kind: 'guidance' | 'alert' = 'guidance') {
  if (mode === 'off') return;
  if (mode === 'alerts' && kind === 'guidance') return;
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
