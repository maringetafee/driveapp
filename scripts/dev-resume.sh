#!/usr/bin/env bash
# Arranca (o reconecta) el emulador Android + Metro + dev client de Roadly
# lo más rápido posible. Pensado para Git Bash en Windows.
#
# Uso: bash scripts/dev-resume.sh
#
# Requiere que el AVD "Roadly_Pixel6" tenga un snapshot de quick-boot
# guardado (se genera solo al apagar el emulador limpiamente, p.ej. con
# `adb emu kill` en vez de matar el proceso). Sin snapshot, el arranque
# es un cold boot normal (~1-2 min) igualmente.

set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-/c/Android/sdk}"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
AVD_NAME="Roadly_Pixel6"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== 1/4: Emulador =="
if adb devices | grep -q "emulator-5554.*device"; then
  echo "Ya hay un emulador corriendo."
else
  echo "Arrancando $AVD_NAME (quick-boot si hay snapshot guardado)..."
  nohup emulator -avd "$AVD_NAME" -gpu swiftshader_indirect \
    > "$PROJECT_DIR/emulator.log" 2>&1 &
  disown
  echo "Esperando a que arranque..."
  for i in $(seq 1 60); do
    boot=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$boot" = "1" ] && break
    sleep 2
  done
fi

echo "== 2/4: Puerto Metro (adb reverse) =="
adb reverse tcp:8081 tcp:8081

echo "== 3/4: Metro =="
if curl -s -o /dev/null -w "" http://127.0.0.1:8081/status 2>/dev/null; then
  echo "Metro ya está corriendo."
else
  echo "Arrancando Metro (npx expo start --dev-client)..."
  ( cd "$PROJECT_DIR" && nohup npx expo start --dev-client \
      > "$PROJECT_DIR/metro.log" 2>&1 & disown )
  echo "Esperando a que responda en :8081..."
  for i in $(seq 1 60); do
    curl -s -o /dev/null http://127.0.0.1:8081/status 2>/dev/null && break
    sleep 2
  done
fi

echo "== 4/4: Reconectar dev client =="
adb shell am force-stop es.makemyweb.roadly || true
adb shell am start -a android.intent.action.VIEW \
  -d "roadly://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" \
  es.makemyweb.roadly

echo "Listo. Si ves pantalla en blanco unos segundos, es el primer bundle compilando."
