import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../state/authStore';
import { colors, radius } from '../theme/colors';
import ScaledPressable from './ui/ScaledPressable';

export default function NotificationBell() {
  const session = useAuthStore((s) => s.session);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('read', false)
        .then(({ count }) => setUnread(count ?? 0));
    }, [session])
  );

  return (
    <ScaledPressable style={styles.button} onPress={() => router.push('/notifications')} hitSlop={8}>
      <Text style={styles.icon}>🔔</Text>
      {unread > 0 && (
        <View style={styles.dot}>
          <Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </ScaledPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 17 },
  dot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { color: '#1A0505', fontSize: 9, fontWeight: '800' },
});
