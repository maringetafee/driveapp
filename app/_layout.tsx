import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../src/state/authStore';
import { supabase } from '../src/lib/supabase';
import { initMapbox } from '../src/lib/mapbox';
import { colors, radius, spacing, type } from '../src/theme/colors';
import EmptyState from '../src/components/ui/EmptyState';
import PrimaryButton from '../src/components/ui/PrimaryButton';
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

function Splash() {
  return (
    <View style={styles.splash}>
      <StatusBar style="light" />
      <View style={styles.mark}>
        <Text style={styles.markText}>R</Text>
      </View>
      <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

function ProfileLoadError() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const signOut = useAuthStore((s) => s.signOut);
  return (
    <View style={[styles.splash, { paddingHorizontal: spacing.xl, gap: spacing.md }]}>
      <StatusBar style="light" />
      <EmptyState emoji="📡" title="Sin conexión" subtitle="No hemos podido cargar tu perfil. Comprueba tu conexión a internet." />
      <PrimaryButton title="Reintentar" onPress={refreshProfile} style={{ alignSelf: 'stretch' }} />
      <PrimaryButton title="Cerrar sesión" variant="ghost" onPress={signOut} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export default function RootLayout() {
  const { session, profile, initializing, profileError } = useAuthStore();
  useAuthDeepLinks();

  if (initializing || (session && !profile && !profileError)) return <Splash />;
  if (session && !profile) return <ProfileLoadError />;

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
          contentStyle: { backgroundColor: colors.background },
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
          <Stack.Screen name="search" options={{ headerShown: true, title: 'Buscar conductores' }} />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notificaciones' }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Ajustes' }} />
          <Stack.Screen name="groups/index" options={{ headerShown: true, title: 'Grupos' }} />
          <Stack.Screen name="groups/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="vehicle/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="mod-car/[vehicleId]" options={{ headerShown: true, title: 'Mod Car' }} />
          <Stack.Screen name="navigate" options={{ animation: 'slide_from_bottom' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  mark: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: '#04140D', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
});
