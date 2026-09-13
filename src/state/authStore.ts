import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initializing: true,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  signUp: async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
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
    const profile = await fetchProfile(userId);
    set({ profile });
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

supabase.auth.onAuthStateChange(async (_event, session) => {
  useAuthStore.setState({ session, initializing: false });
  if (session?.user.id) {
    const profile = await fetchProfile(session.user.id);
    useAuthStore.setState({ profile });
  } else {
    useAuthStore.setState({ profile: null });
  }
});
