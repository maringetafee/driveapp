import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '../src/state/authStore';
import { initMapbox } from '../src/lib/mapbox';
import { colors, type } from '../src/theme/colors';
import '../src/background/autoTripTask';

initMapbox();

export default function RootLayout() {
  const { session, profile, initializing } = useAuthStore();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0D12' }}>
        <ActivityIndicator color="#fff" />
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
          <Stack.Screen name="vehicle/[id]" options={{ headerShown: true, title: '' }} />
          <Stack.Screen name="mod-car/[vehicleId]" options={{ headerShown: true, title: 'Mod Car' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
