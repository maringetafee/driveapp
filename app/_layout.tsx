import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import * as Linking from 'expo-linking';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { useAuthStore } from '../src/state/authStore';
import { supabase } from '../src/lib/supabase';
import { initMapbox } from '../src/lib/mapbox';
import { colors, type } from '../src/theme/colors';
import '../src/background/autoTripTask';

initMapbox();

// El enlace de confirmación de email (y el de recuperación de contraseña)
// vuelven a la app con ?code=... (flujo PKCE) en vez de abrir un navegador;
// hay que canjearlo aquí porque llega antes de que exista ninguna pantalla.
function useAuthDeepLinks() {
  useEffect(() => {
    const exchangeIfNeeded = (url: string | null) => {
      if (url?.includes('code=')) {
        supabase.auth.exchangeCodeForSession(url).catch((e) => {
          console.warn('No se pudo confirmar el enlace de auth:', e.message);
        });
      }
    };

    Linking.getInitialURL().then(exchangeIfNeeded);
    const subscription = Linking.addEventListener('url', ({ url }) => exchangeIfNeeded(url));
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  const { session, profile, initializing } = useAuthStore();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  useAuthDeepLinks();

  if (initializing || !fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const hasOnboarded = !!profile?.onboarded_at;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { ...type.subheading, color: colors.text },
          headerShadowVisible: false,
        }}
      >
        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={!!session && !hasOnboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={!!session && hasOnboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="trip/[id]"
            options={{ headerShown: true, presentation: 'modal', title: 'Resumen del trayecto' }}
          />
          <Stack.Screen name="u/[username]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="search" options={{ headerShown: true, title: 'Buscar usuarios' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notificaciones' }} />
          <Stack.Screen name="groups/index" options={{ headerShown: true, title: 'Grupos' }} />
          <Stack.Screen name="groups/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="vehicle/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="mod-car/[vehicleId]" options={{ headerShown: true, title: 'Mod Car' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
