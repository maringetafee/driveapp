import { useState } from 'react';
import { Link } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/state/authStore';
import { colors } from '../../src/theme/colors';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import { authStyles as styles } from '../../src/theme/authStyles';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.mark}>
            <Text style={styles.markText}>R</Text>
          </View>
          <Text style={styles.title}>Roadly</Text>
          <Text style={styles.subtitle}>Cada trayecto cuenta.</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, focused === 'email' && styles.inputFocused]}
              placeholder="Email"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
            />
            <TextInput
              style={[styles.input, focused === 'password' && styles.inputFocused]}
              placeholder="Contraseña"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <PrimaryButton
              title="Entrar"
              onPress={onSubmit}
              loading={loading}
              disabled={!email || !password}
              style={{ marginTop: 4 }}
            />
          </View>

          <Link href="/(auth)/signup" style={styles.link}>
            <Text style={styles.linkText}>¿No tienes cuenta? Regístrate</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
