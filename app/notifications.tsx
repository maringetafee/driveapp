import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../src/theme/colors';
import Avatar from '../src/components/ui/Avatar';
import EmptyState from '../src/components/ui/EmptyState';
import FadeSlideIn from '../src/components/ui/FadeSlideIn';
import PrimaryButton from '../src/components/ui/PrimaryButton';
import { SkeletonList } from '../src/components/ui/Skeleton';
import type { NotificationType } from '../src/types/database';

interface NotificationRow {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  trip_id: string | null;
  actor: { username: string } | null;
  badge: { name: string } | null;
}

function messageFor(n: NotificationRow): string {
  const actor = n.actor?.username ? `@${n.actor.username}` : 'Alguien';
  switch (n.type) {
    case 'like':
      return `${actor} le dio like a tu trayecto`;
    case 'comment':
      return `${actor} comentó tu trayecto`;
    case 'follow':
      return `${actor} ha empezado a seguirte`;
    case 'follow_request':
      return `${actor} quiere seguirte`;
    case 'follow_accept':
      return `${actor} aceptó tu solicitud de seguimiento`;
    case 'badge':
      return `Nueva insignia: ${n.badge?.name ?? '—'}`;
  }
}

function emojiFor(type: NotificationType): string {
  switch (type) {
    case 'like':
      return '♥';
    case 'comment':
      return '💬';
    case 'follow':
    case 'follow_accept':
      return '👤';
    case 'follow_request':
      return '🤝';
    case 'badge':
      return '🏅';
  }
}

export default function NotificationsScreen() {
  const session = useAuthStore((s) => s.session);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, trip_id, actor:profiles!notifications_actor_id_fkey(username), badge:badges(name)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as unknown as NotificationRow[]) ?? []);
    setLoading(false);

    const unreadIds = (data ?? []).filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRespondRequest = async (notificationId: string, actorUsername: string | undefined, accept: boolean) => {
    if (!session || !actorUsername) return;
    setBusyIds((prev) => new Set(prev).add(notificationId));

    const { data: actorProfile } = await supabase.from('profiles').select('id').eq('username', actorUsername).single();
    if (actorProfile) {
      if (accept) {
        await supabase
          .from('follows')
          .update({ status: 'accepted' })
          .eq('follower_id', actorProfile.id)
          .eq('followed_id', session.user.id);
      } else {
        await supabase.from('follows').delete().eq('follower_id', actorProfile.id).eq('followed_id', session.user.id);
      }
    }
    await supabase.from('notifications').delete().eq('id', notificationId);

    setItems((prev) => prev.filter((n) => n.id !== notificationId));
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(notificationId);
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <EmptyState emoji="🔔" title="Sin novedades" subtitle="Aquí verás likes, comentarios, seguidores e insignias." />
          )
        }
        renderItem={({ item, index }) => (
          <FadeSlideIn index={index}>
            <Pressable
              style={[styles.row, !item.read && styles.rowUnread]}
              onPress={() => {
                if (item.trip_id) router.push(`/trip/${item.trip_id}`);
                else if (item.actor?.username && (item.type === 'follow' || item.type === 'follow_accept')) {
                  router.push(`/u/${item.actor.username}`);
                }
              }}
            >
              <View style={styles.emojiWrap}>
                <Text style={styles.emoji}>{emojiFor(item.type)}</Text>
                {!item.read && <View style={styles.unreadDot} />}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.message}>{messageFor(item)}</Text>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </Text>
                {item.type === 'follow_request' && (
                  <View style={styles.requestActions}>
                    <PrimaryButton
                      title="Aceptar"
                      onPress={() => onRespondRequest(item.id, item.actor?.username, true)}
                      loading={busyIds.has(item.id)}
                      style={styles.requestButton}
                    />
                    <PrimaryButton
                      title="Rechazar"
                      variant="ghost"
                      onPress={() => onRespondRequest(item.id, item.actor?.username, false)}
                      loading={busyIds.has(item.id)}
                      style={styles.requestButton}
                    />
                  </View>
                )}
              </View>
            </Pressable>
          </FadeSlideIn>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowUnread: { borderColor: colors.accent },
  emojiWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 16 },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
  },
  message: { ...type.body, fontFamily: fonts.bodySemiBold, color: colors.text },
  time: { ...type.caption, color: colors.textFaint },
  requestActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  requestButton: { flex: 1, paddingVertical: 10 },
});
