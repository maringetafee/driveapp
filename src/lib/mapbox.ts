import Mapbox from '@rnmapbox/maps';

export function initMapbox() {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    Mapbox.setAccessToken(token);
  } else {
    console.warn('EXPO_PUBLIC_MAPBOX_TOKEN no está definido; el mapa no se renderizará.');
  }
}
