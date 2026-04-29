import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { fetchToken } from '../services/auth';
 
export default function LoginScreen() {
  const router = useRouter();
  const { login, restoreSession } = useAuthStore();
 
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [saveKey, setSaveKey] = useState(false);
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    restoreSession().then((restored) => {
      if (restored) {
        router.replace('/(tabs)/');
      } else {
        setLoading(false);
      }
    });
  }, []);
 
  async function handleLogin() {
    if (!appKey.trim() || !appSecret.trim()) {
      Alert.alert('입력 오류', 'App Key와 App Secret을 입력해주세요.');
      return;
    }
    try {
      setLoading(true);
      const token = await fetchToken({ appKey, appSecret });
      await login({ appKey, appSecret }, token, saveKey); // saveKey 전달
      router.replace('/(tabs)/');
    } catch (e) {
      Alert.alert('로그인 실패', '인증 중 오류가 발생했습니다.\nApp Key와 Secret을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }
 
  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }
 
  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.inner}>
        <Text style={s.logo}>🌱 이삭 줍기 🌱</Text>
        <Text style={s.subtitle}>평생먹을 점심 값 벌기 😋</Text>
 
        <View style={s.card}>
          <Text style={s.label}>App Key</Text>
          <TextInput
            style={s.input}
            value={appKey}
            onChangeText={setAppKey}
            placeholder="App Key 입력"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
          />
 
          <Text style={s.label}>App Secret</Text>
          <TextInput
            style={s.input}
            value={appSecret}
            onChangeText={setAppSecret}
            placeholder="App Secret 입력"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
 
          {/* 키 저장 체크박스 */}
          <View style={s.saveRow}>
            <View style={s.saveLeft}>
              <Text style={s.saveLabel}>앱키 저장</Text>
              <Text style={s.saveDesc}>다음 실행 시 자동 로그인</Text>
            </View>
            <Switch
              value={saveKey}
              onValueChange={setSaveKey}
              trackColor={{ false: '#e0e0e0', true: '#86efac' }}
              thumbColor={saveKey ? '#22c55e' : '#fff'}
            />
          </View>
 
          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>로그인</Text>
            }
          </TouchableOpacity>
        </View>
 
        <Text style={s.hint}>※ 키는 기기 내 암호화 저장됩니다.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
 
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f6f8' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#aaa', textAlign: 'center', marginBottom: 40 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  label: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#f5f6f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', marginBottom: 16,
  },
  saveRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12, marginBottom: 16,
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  saveLeft: { flex: 1 },
  saveLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  saveDesc: { fontSize: 12, color: '#aaa', marginTop: 2 },
  button: {
    backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 20 },
});