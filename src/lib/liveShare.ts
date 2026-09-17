// Ubicación en directo con un amigo: nada se guarda en la base de datos, las
// posiciones viajan solo por un canal de Supabase Realtime (broadcast). La
// tabla live_shares solo dice quién tiene permiso para ver a quién y hasta cuándo.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface LiveFix {
  lat: number;
  lon: number;
  speedKmh: number;
  heading: number | null;
}

export function liveChannelName(sharerId: string): string {
  return `live-share:${sharerId}`;
}

/** Lado del que comparte: un canal abierto solo para enviar. */
export function openSharerChannel(sharerId: string): RealtimeChannel {
  const channel = supabase.channel(liveChannelName(sharerId));
  channel.subscribe();
  return channel;
}

export function broadcastLiveFix(channel: RealtimeChannel, fix: LiveFix) {
  channel.send({ type: 'broadcast', event: 'fix', payload: fix });
}

export function broadcastLiveStop(channel: RealtimeChannel) {
  channel.send({ type: 'broadcast', event: 'stop', payload: {} });
}

/** Lado de quien ve: se suscribe a las posiciones de un compartidor concreto. */
export function subscribeToLiveFixes(
  sharerId: string,
  onFix: (fix: LiveFix) => void,
  onStop: () => void
): RealtimeChannel {
  const channel = supabase.channel(liveChannelName(sharerId));
  channel
    .on('broadcast', { event: 'fix' }, ({ payload }) => onFix(payload as LiveFix))
    .on('broadcast', { event: 'stop' }, () => onStop())
    .subscribe();
  return channel;
}
