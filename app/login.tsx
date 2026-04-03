import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { fetchToken } from '../services/auth';

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!appKey.trim() || !appSecret.trim()) {
      Alert.alert('입력 오류', 'App Key와 App Secret을 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      const token = await fetchToken({ appKey, appSecret });
      login({ appKey, appSecret }, token);
      router.replace('/(tabs)/');
    } catch (e) {
      Alert.alert('로그인 실패', '인증 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>LS Trading</Text>
        <Text style={styles.subtitle}>LS증권 개인 매매 앱</Text>

        <View style={styles.card}>
          <Text style={styles.label}>App Key</Text>
          <TextInput
            style={styles.input}
            value={appKey}
            onChangeText={setAppKey}
            placeholder="App Key 입력"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>App Secret</Text>
          <TextInput
            style={styles.input}
            value={appSecret}
            onChangeText={setAppSecret}
            placeholder="App Secret 입력"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>로그인</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>※ 개인용 앱입니다. 키는 저장되지 않습니다.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  inner: {
    flex: 1, justifyContent: 'center', paddingHorizontal: 24,
  },
  logo: {
    fontSize: 32, fontWeight: '800', color: '#1a1a1a',
    textAlign: 'center', marginBottom: 4,
  },
  subtitle: {
    fontSize: 14, color: '#aaa', textAlign: 'center', marginBottom: 40,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  label: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#f5f6f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', marginBottom: 16,
  },
  button: {
    backgroundColor: '#3182f6', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 20 },
});