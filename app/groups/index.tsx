import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/state/authStore';
import { colors, fonts, radius, spacing, type } from '../../src/theme/colors';
import EmptyState from '../../src/components/ui/EmptyState';
import FadeSlideIn from '../../src/components/ui/FadeSlideIn';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import SectionHeader from '../../src/components/ui/SectionHeader';
import { SkeletonList } from '../../src/components/ui/Skeleton';
import type { Group } from '../../src/types/database';

export default function GroupsScreen() {
  const session = useAuthStore((s) => s.session);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', session.user.id);
    const groupIds = (memberships ?? []).map((m) => m.group_id);
    if (groupIds.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('groups').select('*').in('id', groupIds).order('created_at', { ascending: false });
    setGroups(data ?? []);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onCreate = async () => {
    if (!session || !newName.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc('create_group', { p_name: newName.trim() });
    setBusy(false);
    if (error || !data) {
      setErrorMsg('No se pudo crear el grupo. Inténtalo de nuevo.');
      return;
    }
    setNewName('');
    setCreating(false);
    router.push(`/groups/${data}`);
  };

  const onJoin = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc('join_group_by_code', { p_code: joinCode.trim().toUpperCase() });
    setBusy(false);
    if (error || !data) {
      setErrorMsg('Código no válido.');
      return;
    }
    setJoinCode('');
    setJoining(false);
    router.push(`/groups/${data}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        data={groups}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.actionsRow}>
              <PrimaryButton
                title={creating ? 'Cancelar' : '+ Crear grupo'}
                variant={creating ? 'ghost' : 'secondary'}
                onPress={() => {
                  setCreating((v) => !v);
                  setJoining(false);
                }}
                style={{ flex: 1 }}
              />
              <PrimaryButton
                title={joining ? 'Cancelar' : 'Unirme con código'}
                variant={joining ? 'ghost' : 'secondary'}
                onPress={() => {
                  setJoining((v) => !v);
                  setCreating(false);
                }}
                style={{ flex: 1 }}
              />
            </View>

            {creating && (
              <View style={styles.form}>
                <Input
                  placeholder="Nombre del grupo"
                  value={newName}
                  onChangeText={setNewName}
                  maxLength={60}
                />
                <PrimaryButton title="Crear" onPress={onCreate} loading={busy} disabled={!newName.trim()} />
              </View>
            )}

            {joining && (
              <View style={styles.form}>
                <Input
                  placeholder="Código de invitación"
                  autoCapitalize="characters"
                  value={joinCode}
                  onChangeText={setJoinCode}
                  maxLength={6}
                />
                <PrimaryButton title="Unirme" onPress={onJoin} loading={busy} disabled={!joinCode.trim()} />
              </View>
            )}

            {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

            {groups.length > 0 && <SectionHeader title="Tus grupos" />}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <EmptyState
              emoji="👥"
              title="Sin grupos todavía"
              subtitle="Crea un grupo privado o únete a uno con un código de invitación para tener vuestro propio ranking."
            />
          )
        }
        renderItem={({ item, index }) => (
          <FadeSlideIn index={index}>
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/groups/${item.id}`)}
            >
              <View style={styles.groupIcon}>
                <Text style={styles.groupIconText}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupName}>{item.name}</Text>
                <Text style={styles.groupCode}>Código: {item.invite_code}</Text>
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
  list: { padding: spacing.lg, gap: spacing.md },
  headerBlock: { gap: spacing.lg, marginBottom: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  form: { gap: spacing.sm },
  error: { ...type.caption, color: colors.danger },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceAlt },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIconText: { fontFamily: fonts.numeralBold, color: colors.accent, fontSize: 18 },
  groupName: { ...type.subheading, color: colors.text },
  groupCode: { ...type.caption, color: colors.textFaint, marginTop: 2 },
});
