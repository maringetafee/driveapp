# DriveRank

Red social de conductores (estilo TripRank): tracking de trayectos, driving score, feed social y leaderboards. Nombre provisional — cámbialo en `app.config.ts` (`name`, `slug`, `scheme`, `ios.bundleIdentifier`, `android.package`) cuando decidas el definitivo.

Las 4 fases del roadmap original están implementadas en código. Lo que no puede hacerse sin intervención tuya (cuentas externas, claves, compilación nativa, tienda de apps) está listado al final en **"Qué te toca hacer a ti"**.

## Stack

- **App**: Expo (React Native + TypeScript), `expo-router` (native stack + native tabs), `Stack.Protected` para las rutas de auth/onboarding/tabs.
- **Backend**: Supabase (Postgres + Auth + RLS + Storage + Edge Functions). Esquema en [`supabase/migrations/`](supabase/migrations).
- **Estado**: Zustand (`src/state/authStore.ts`, `src/state/tripStore.ts`).
- **Mapas**: Mapbox (`@rnmapbox/maps`) — solo nativo, en web se muestra un aviso (`src/components/TripRouteMap.web.tsx`).
- **Sensores**: `expo-location` (GPS, primer y segundo plano), `expo-sensors` (acelerómetro + giroscopio para el driving score).
- **IA**: Supabase Edge Function (`supabase/functions/mod-car`) que llama a la API de edición de imágenes de OpenAI.

## Setup

1. `npm install`
2. Crea un proyecto en [supabase.com](https://supabase.com), copia `.env.example` a `.env` y rellena `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (Settings → API).
3. En el SQL Editor de Supabase, ejecuta los 4 archivos de `supabase/migrations/` **en orden** (0001 → 0004): tablas + RLS, leaderboards, insignias, bucket de Storage para fotos.
4. Consigue un token público de [Mapbox](https://account.mapbox.com/) (`EXPO_PUBLIC_MAPBOX_TOKEN`) y un token secreto con scope "Downloads:Read" (`MAPBOX_DOWNLOAD_TOKEN`, solo se usa al compilar).
5. (Opcional, para Mod Car) `supabase secrets set OPENAI_API_KEY=sk-...` y `supabase functions deploy mod-car`.
6. `npm start` y abre la app con Expo Go — **excepto** el mapa (Mapbox) y Mod Car, que necesitan un dev client nativo (ver más abajo). `npm run web` sirve para una comprobación rápida de que la app arranca, pero varias pantallas no son usables ahí (ver "Limitaciones conocidas").

## Qué hay hecho

### Fase 1 — MVP
- Auth por email/contraseña, `profile` creado automáticamente vía trigger de DB.
- Onboarding: primer vehículo, unidades (km/h o mph), ciudad/país opcionales (para leaderboards regionales).
- Tracking manual de trayecto (iniciar/terminar), distancia/velocidad/duración en el cliente.
- Resumen del trayecto, historial personal, perfil con garaje.

### Fase 2 — Automatización y sensores
- **Detección automática en segundo plano** (`src/background/autoTripTask.ts`): activable desde un interruptor en Perfil. Usa `expo-task-manager` + ubicación en segundo plano; arranca el trayecto al superar ~15 km/h sostenidos y lo cierra tras 3 minutos por debajo de 5 km/h. Guarda el trayecto directamente desde el proceso en segundo plano.
- **Driving score real** (`src/utils/drivingMetrics.ts`): acelerómetro para aceleraciones/frenazos bruscos, giroscopio para curvas cerradas, serie de G-force muestreada a ~2Hz. Es una heurística simple y documentada en el propio código, no un modelo de ML. **No hay detección de cambios de carril** ni penalización por velocidad alta a propósito (no hay sensor fiable sin cámara/CAN-bus para lo primero, y lo segundo iría contra el aviso de seguridad del onboarding).
- **Tarjeta compartible** (`src/components/TripShareCard.tsx` + `react-native-view-shot` + `expo-sharing`): botón "Compartir tarjeta" en el resumen del trayecto.
- **Mapa con la ruta** (`src/components/TripRouteMap.tsx`): Mapbox, tanto en vivo durante el trayecto como en el resumen final.

### Fase 3 — Social
- Perfiles públicos por username (`/u/[username]`) con stats agregadas, garaje e insignias.
- Seguir / dejar de seguir (tabla `follows`).
- Feed (`/feed`) con trayectos propios + de gente seguida, like y comentarios (también disponibles en el detalle de cada trayecto).
- Leaderboards reales (`supabase.rpc('compute_leaderboard', …)`): por velocidad máxima, distancia, driving score o nº de trayectos; ámbito amigos/ciudad/país/global; periodo semana/mes/histórico. Se calculan al vuelo desde `trips` — no dependen de un cron. Hay una versión opcional con snapshots + `pg_cron` documentada (comentada) al final de `0002_leaderboards.sql` para cuando el volumen de trayectos haga cara la consulta en vivo.

### Fase 4 — Gamificación
- Insignias otorgadas automáticamente por un trigger de Postgres tras cada trayecto (primer trayecto, hitos de distancia acumulada, nº de trayectos, conducción suave). Visibles en el perfil propio y en los públicos.
- Estadísticas por vehículo (`/vehicle/[id]`): trayectos, distancia total, velocidad máxima, score medio; botón para marcarlo como principal.
- Alta de más de un coche desde Perfil ("+ Añadir coche").
- **Mod Car (IA)** (`/mod-car/[vehicleId]`): sube una foto del coche, elige un estilo (o escribe el tuyo), la Edge Function `mod-car` llama a la API de OpenAI (`gpt-image-1`, endpoint de edición de imágenes) y genera una versión solo estética. El resultado se puede guardar como foto del vehículo (sube a un bucket de Storage y actualiza `vehicles.image_url`).

## Qué te toca hacer a ti

Nada de esto lo puedo hacer yo desde aquí — son cuentas externas, claves secretas o pasos que requieren tu hardware/tienda de apps:

1. **Crear el proyecto Supabase** y ejecutar las 4 migraciones (paso 2-3 de Setup).
2. **Conseguir las claves de Mapbox** (token público + token de descarga) — sin ellas el mapa no compila ni se muestra.
3. **Si quieres Mod Car**: crear una cuenta de OpenAI con acceso a la API de imágenes, configurar `OPENAI_API_KEY` como secreto de la función y desplegarla (`supabase functions deploy mod-car`). Sin esto, la pantalla existe pero el botón "Generar" devuelve un error explicando qué falta.
4. **Compilar un dev client nativo** para probar Mapbox, sensores en segundo plano y Mod Car de verdad — Expo Go no soporta módulos nativos como `@rnmapbox/maps`. Con EAS:
   ```bash
   npx eas login
   npx eas build:configure
   npx eas build --profile development --platform android
   ```
   (o `--platform ios`, necesitas cuenta de Apple Developer para dispositivo físico).
5. **Decidir el nombre definitivo** de la app y actualizar `app.config.ts` (`name`, `slug`, `scheme`, bundle id / package) — ahora mismo todo usa "DriveRank" / `es.makemyweb.driverank` como placeholder.
6. **Iconos y splash screen reales** — `assets/icon.png`, `assets/android-icon-*.png`, `assets/favicon.png` sí existen (los generó el template de Expo) pero son los genéricos, no un logo de la app.
7. **Probar en tu móvil** el flujo completo: registro, permisos de ubicación "Siempre" (hay que aceptarlo desde Ajustes en iOS, no solo en el diálogo), detección automática, generar y compartir una tarjeta, seguir a otro usuario de prueba, etc. Yo he verificado que compila (`tsc --noEmit` limpio) y que la navegación no rompe en web, pero no puedo ejercitar GPS/acelerómetro/cámara reales desde aquí.
8. **Cuando quieras publicar en las tiendas**: cuentas de Apple Developer (99$/año) y Google Play Console (25$ una vez), `eas submit`, capturas de pantalla, política de privacidad (obligatoria por el uso de ubicación en segundo plano).

## Limitaciones conocidas

- **Web**: solo sirve para comprobar que la navegación y las pantallas de auth no rompen. El mapa, el tracking (GPS/acelerómetro reales), la cámara y Mod Car no son usables ahí — es un target secundario, la app es para iOS/Android.
- **Leaderboards por ciudad/país**: si el usuario no rellenó ciudad/país en el onboarding, esos filtros muestran un aviso pidiendo completarlo, no un ranking vacío engañoso.
- **`src/lib/supabase.ts`** no usa el genérico `Database<>` de `supabase-js` a propósito: los tipos en `src/types/database.ts` están escritos a mano. Cuando el proyecto Supabase real exista, genera los tipos oficiales con `npx supabase gen types typescript --project-id <id>` y pásalos como genérico al cliente si quieres el autocompletado/tipado estricto de las queries.
