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

export default function SignupScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'username' | 'email' | 'password' | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp(email.trim(), password, username.trim());
      if (needsEmailConfirmation) setAwaitingConfirmation(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  if (awaitingConfirmation) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.mark}>
            <Text style={styles.markText}>✓</Text>
          </View>
          <Text style={styles.title}>Revisa tu email</Text>
          <Text style={styles.subtitle}>
            Te hemos enviado un enlace de confirmación a {email.trim()}. Ábrelo para activar tu cuenta.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.subtitle}>Únete a la comunidad de conductores.</Text>

          <View style={styles.form}>
            <TextInput
              style={[styles.input, focused === 'username' && styles.inputFocused]}
              placeholder="Nombre de usuario"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              onFocus={() => setFocused('username')}
              onBlur={() => setFocused(null)}
            />
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
              placeholder="Contraseña (mín. 6 caracteres)"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <PrimaryButton
              title="Crear cuenta"
              onPress={onSubmit}
              loading={loading}
              disabled={!email || !password || !username}
              style={{ marginTop: 4 }}
            />
          </View>

          <Link href="/(auth)/login" style={styles.link}>
            <Text style={styles.linkText}>¿Ya tienes cuenta? Entra</Text>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
