import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'driverank',
  slug: 'driverank',
  scheme: 'driverank',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'es.makemyweb.driverank',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'DriveRank usa tu ubicación para detectar y trazar tus trayectos en el mapa.',
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'DriveRank necesita ubicación en segundo plano para detectar automáticamente el inicio y fin de tus trayectos, incluso con la app cerrada.',
      NSMotionUsageDescription:
        'DriveRank usa el acelerómetro para calcular tu driving score (aceleración, frenada y toma de curvas).',
      NSPhotoLibraryUsageDescription:
        'DriveRank necesita acceso a tus fotos para que subas una imagen de tu coche (Mod Car) o guardes la tarjeta de tu trayecto.',
      NSCameraUsageDescription: 'DriveRank usa la cámara para fotografiar tu coche.',
      UIBackgroundModes: ['location', 'fetch'],
    },
  },
  android: {
    package: 'es.makemyweb.driverank',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
    ],
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-image',
    'expo-secure-store',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'DriveRank necesita ubicación en segundo plano para detectar automáticamente el inicio y fin de tus trayectos, incluso con la app cerrada.',
        locationWhenInUsePermission:
          'DriveRank usa tu ubicación para detectar y trazar tus trayectos en el mapa.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    'expo-sharing',
    [
      'expo-image-picker',
      {
        photosPermission:
          'DriveRank necesita acceso a tus fotos para subir una imagen de tu coche.',
        cameraPermission: 'DriveRank usa la cámara para fotografiar tu coche.',
      },
    ],
    [
      'expo-media-library',
      {
        photosPermission: 'DriveRank guarda la tarjeta de tu trayecto en tus fotos.',
        savePhotosPermission: 'DriveRank guarda la tarjeta de tu trayecto en tus fotos.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    [
      '@rnmapbox/maps',
      {
        RNMapboxMapsDownloadToken: process.env.MAPBOX_DOWNLOAD_TOKEN,
        RNMapboxMapsVersion: '11.23.1',
      },
    ],
  ],
  extra: {
    mapboxPublicToken: process.env.EXPO_PUBLIC_MAPBOX_TOKEN,
    eas: {
      projectId: '3132f166-90f3-4040-86fe-c54d8ed757f9',
    },
  },
  owner: 'mariomarin181',
};

export default config;
