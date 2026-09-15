import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

type EditableProfileFields = Partial<Pick<Profile, 'units' | 'city' | 'country' | 'is_private'>>;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  profileError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: EditableProfileFields) => Promise<void>;
  deleteAccount: () => Promise<void>;
  completeOnboarding: (updates: { units: Profile['units']; country?: string; city?: string }) => Promise<void>;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) {
    console.warn('No se pudo cargar el perfil:', error.message);
    return null;
  }
  return data;
}

// Keeps the last good profile if a refresh fails, so a flaky network never
// drops an onboarded user back into the onboarding flow.
async function loadProfile(userId: string) {
  const profile = await fetchProfile(userId);
  const state = useAuthStore.getState();
  if (state.session?.user.id !== userId) return;
  useAuthStore.setState({
    profile: profile ?? state.profile,
    profileError: !profile && !state.profile,
    initializing: false,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initializing: true,
  profileError: false,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUp: async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: Linking.createURL('/') },
    });
    if (error) throw error;
    return { needsEmailConfirmation: !data.session };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id;
    if (!userId) return;
    set({ profileError: false });
    await loadProfile(userId);
  },

  updateProfile: async (updates) => {
    const { session, profile } = get();
    if (!session) return;
    const { error } = await supabase.from('profiles').update(updates).eq('id', session.user.id);
    if (error) throw error;
    if (profile) set({ profile: { ...profile, ...updates } });
  },

  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
    await supabase.auth.signOut({ scope: 'local' });
  },

  completeOnboarding: async (updates) => {
    const userId = get().session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ ...updates, onboarded_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    await get().refreshProfile();
  },
}));

supabase.auth.onAuthStateChange((_event, session) => {
  const prev = useAuthStore.getState();
  const sameUser = prev.session?.user.id === session?.user.id;
  useAuthStore.setState({ session, ...(sameUser ? {} : { profile: null, profileError: false }) });

  if (!session) {
    useAuthStore.setState({ initializing: false });
    return;
  }
  if (sameUser && prev.profile) return;

  // Supabase warns against awaiting other client calls inside this callback
  // (it can deadlock the auth lock), so the profile load is deferred.
  setTimeout(() => loadProfile(session.user.id), 0);
});
