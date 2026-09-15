import { useState } from 'react';
import { Link } from 'expo-router';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/state/authStore';
import Input from '../../src/components/ui/Input';
import PrimaryButton from '../../src/components/ui/PrimaryButton';
import { authStyles as styles } from './authStyles';

export default function SignupScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
            <Input
              placeholder="Nombre de usuario"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
            <Input
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              placeholder="Contraseña (mín. 6 caracteres)"
              secureTextEntry
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
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
