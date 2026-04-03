import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const { credentials, login, logout } = useAuthStore();

  const [appKey, setAppKey] = useState(credentials?.appKey ?? '');
  const [appSecret, setAppSecret] = useState(credentials?.appSecret ?? '');

  function handleSave() {
    if (!appKey.trim() || !appSecret.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    login({ appKey, appSecret });
    Alert.alert('저장 완료', 'API 키가 업데이트되었습니다.');
  }

  function handleLogout() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃', style: 'destructive',
        onPress: () => { logout(); router.replace('/login'); },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.header}>설정</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>API 키 관리</Text>

          <Text style={styles.label}>App Key</Text>
          <TextInput
            style={styles.input}
            value={appKey}
            onChangeText={setAppKey}
            placeholder="App Key"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>App Secret</Text>
          <TextInput
            style={styles.input}
            value={appSecret}
            onChangeText={setAppSecret}
            placeholder="App Secret"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>저장</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  container: { flex: 1, padding: 16 },
  header: {
    fontSize: 22, fontWeight: '800', color: '#1a1a1a',
    marginTop: 8, marginBottom: 20, marginHorizontal: 0,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13, color: '#888', fontWeight: '600', marginBottom: 16,
  },
  label: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#f5f6f8', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#1a1a1a', marginBottom: 14,
  },
  saveButton: {
    backgroundColor: '#3182f6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  logoutButton: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#f04452',
  },
  logoutText: { color: '#f04452', fontSize: 15, fontWeight: '700' },
});