import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Switch, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
// 별명 검증 함수 + 계정 최대 개수 import
import { useAuthStore, MAX_ACCOUNTS, validateNickname, SavedAccount } from '../store/authStore';
import { fetchToken } from '../services/auth';

 
export default function LoginScreen() {
  const router = useRouter();
  // 🆕 settings에서 "+ 새 계정 추가"로 들어왔는지 체크
  const params = useLocalSearchParams();
  // setActiveAccount, logout 추가 (자동로그인용), addAccount 추가
  const { login, restoreSession, setActiveAccount, logout, addAccount } = useAuthStore();
  // 🆕 accounts를 selector로 구독 (계정 변경 시 자동 리렌더)
  const accounts = useAuthStore(s => s.accounts);

  // 🆕 현재 뷰 상태 ('loading' | 'select' | 'login')
  const [view, setView] = useState<'loading' | 'select' | 'login'>('loading');

  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [nickname, setNickname] = useState('');
  const [saveKey, setSaveKey] = useState(false);
  const [loading, setLoading] = useState(false); // 🔧 초기값 false로 (view가 로딩 처리)
 
  useEffect(() => {
    (async () => {
      await restoreSession();
      const state = useAuthStore.getState();

      // 🆕 설정에서 "+ 새 계정 추가"로 들어온 경우 — 자동로그인 스킵, 폼 바로 표시
      if (params.addNew === '1') {
        setSaveKey(true); // 새 계정 추가는 저장 모드 기본 ON
        setView('login');
        return;
      }

      // ① 활성 계정 있으면 자동로그인 시도
      if (state.activeAccountId) {
        const account = state.accounts.find(a => a.id === state.activeAccountId);
        if (account) {
          try {
            const token = await fetchToken({
              appKey: account.appkey,
              appSecret: account.appsecret,
            });
            await setActiveAccount(account.id, token);
            router.replace('/(tabs)/');
            return;
          } catch (e) {
            console.log('[자동로그인 실패]', e);
            await logout();
          }
        }
      }

      // 🆕 ② 자동로그인 안 됨 → 저장된 계정 유무에 따라 뷰 분기
      if (state.accounts.length > 0) {
        setView('select'); // 계좌 선택 화면
      } else {
        setView('login');  // 로그인 폼 (첫 로그인)
      }
    })();
  }, [params.addNew]);

  // ════════════════════════════════════════
  // ── 🆕 저장된 계정으로 로그인 ───────────
  // ════════════════════════════════════════
  async function handleAccountLogin(account: SavedAccount) {
    try {
      setLoading(true);
      const token = await fetchToken({
        appKey: account.appkey,
        appSecret: account.appsecret,
      });
      await setActiveAccount(account.id, token);
      router.replace('/(tabs)/');
    } catch (e) {
      Alert.alert(
        '로그인 실패',
        `'${account.nickname}' 계정 인증 중 오류가 발생했습니다.\nApp Key와 Secret을 확인해주세요.`
      );
    } finally {
      setLoading(false);
    }
  }

  // ════════════════════════════════════════
  // ── 🆕 "새 계정 추가" → 로그인 폼으로 ───
  // ════════════════════════════════════════
  function handleAddAccount() {
    setAppKey('');
    setAppSecret('');
    setNickname('');
    setSaveKey(true); // 새 계정 추가는 저장 모드 기본 ON
    setView('login');
  }

  // ════════════════════════════════════════
  // ── 🆕 "← 뒤로" → 계좌 선택 화면 ────────
  // ════════════════════════════════════════
  function handleBack() {
    setView('select');
  }
 
  // ════════════════════════════════════════
  // ── 🆕 로그인 후 네비게이션 헬퍼 ─────────
  // ════════════════════════════════════════
  // addNew 모드(설정 → +새 계정 추가)에서 왔으면 router.back()
  //   → 스택에 /(tabs)/ 중복 생성 방지 → 홈 화면 중복 mount 방지
  // 그 외 (첫 로그인, 자동로그인, 계좌 선택 등)는 router.replace
  function navigateAfterLogin() {
    if (params.addNew === '1' && router.canGoBack()) {
      router.back(); // 설정 탭으로 돌아감 (스택 정리)
    } else {
      router.replace('/(tabs)/');
    }
  }

  async function handleLogin() {
    // ════════════════════════════════════════
    // ── 입력 검증 ───────────────────────────
    // ════════════════════════════════════════
    if (!appKey.trim() || !appSecret.trim()) {
      Alert.alert('입력 오류', 'App Key와 App Secret을 입력해주세요.');
      return;
    }
    
    // 🆕 저장 모드일 때만 별명 필수 검증
    if (saveKey) {
      const validation = validateNickname(nickname);
      if (!validation.valid) {
        Alert.alert('별명 오류', validation.reason ?? '별명을 확인해주세요.');
        return;
      }
    }

    try {
      setLoading(true);
      
      // ════════════════════════════════════════
      // ── 토큰 발급 ───────────────────────────
      // ════════════════════════════════════════
      const token = await fetchToken({ appKey, appSecret });

      if (saveKey) {
        // ════════════════════════════════════════
        // ── 저장 모드: addAccount → setActiveAccount ─
        // ════════════════════════════════════════
        const state = useAuthStore.getState();
        
        // 동일 키가 이미 저장돼 있나? → 기존 계정 재활성화 (별명 무시)
        const existing = state.accounts.find(
          a => a.appkey === appKey && a.appsecret === appSecret
        );
        
        if (existing) {
          await setActiveAccount(existing.id, token);
          // 사용자에게 알림 — 확인 누르면 홈/이전 화면으로 이동
          Alert.alert(
            '알림',
            `이미 저장된 '${existing.nickname}' 계정으로 로그인되었어요.`,
            [{
              text: '확인',
              onPress: () => navigateAfterLogin(), // 🔧 변경: replace → 헬퍼 호출
            }],
            { cancelable: false } // 바깥 탭으로 닫히지 않게
          );
          return; // 아래쪽 navigation 실행 방지
        } else {
          // 새 계정 추가
          const newAccount = await addAccount({ appKey, appSecret }, nickname);
          if (!newAccount) {
            // 5개 초과 또는 별명 무효
            if (state.accounts.length >= MAX_ACCOUNTS) {
              Alert.alert(
                '계정 한도 초과',
                `저장 가능한 계정은 최대 ${MAX_ACCOUNTS}개예요.\n설정에서 기존 계정을 삭제 후 다시 시도해주세요.`
              );
            } else {
              Alert.alert('계정 추가 실패', '별명을 확인해주세요.');
            }
            return;
          }
          await setActiveAccount(newAccount.id, token);
        }
      } else {
        // ════════════════════════════════════════
        // ── 저장 X 모드: 메모리만 (호환용 login()) ─
        // ════════════════════════════════════════
        await login({ appKey, appSecret }, token, false);
      }
      
      navigateAfterLogin(); // 🔧 변경: replace → 헬퍼 호출
    } catch (e) {
      Alert.alert('로그인 실패', '인증 중 오류가 발생했습니다.\nApp Key와 Secret을 확인해주세요.');
    } finally {
      setLoading(false);
    }
  }
 
  // 🔧 자동로그인 시도 중일 때만 풀스크린 로딩
  if (view === 'loading') {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // ════════════════════════════════════════
  // ── UI단: 🆕 계좌 선택 화면 (이미지 2) ──
  // ════════════════════════════════════════
  if (view === 'select') {
    return (
      <View style={s.container}>
        <View style={s.inner}>
          <Text style={s.logo}>🌱 이삭 줍기 🌱</Text>
          <Text style={s.subtitle}>평생먹을 점심 값 벌기 😋</Text>

          <View style={s.selectCard}>
            <ScrollView>
              {accounts.map((account) => (
                <View key={account.id} style={s.accountRow}>
                  <Text style={s.accountName}>{account.nickname}</Text>
                  <TouchableOpacity
                    style={[s.accountLoginBtn, loading && s.buttonDisabled]}
                    onPress={() => handleAccountLogin(account)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={s.accountLoginText}>로그인</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {/* + 새 계정 추가 (5개 미만일 때만) */}
              {accounts.length < MAX_ACCOUNTS && (
                <TouchableOpacity
                  style={s.addBtn}
                  onPress={handleAddAccount}
                  activeOpacity={0.7}
                >
                  <Text style={s.addBtnText}>+ 새 계정 추가</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          <Text style={s.hint}>※ 키는 기기 내 암호화 저장됩니다.</Text>
        </View>
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

          {/* ════════════════════════════════════════ */}
          {/* 🆕 별명 input (저장 시 필수) ──────────── */}
          {/* ════════════════════════════════════════ */}
          <Text style={s.label}>별명 {saveKey && <Text style={{ color: '#ef4444' }}>*</Text>}</Text>
          <TextInput
            style={s.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="1~10자 (한글/영문/숫자/공백)"
            placeholderTextColor="#bbb"
            maxLength={10}
            autoCorrect={false}
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

          {/* 🆕 저장된 계정 있을 때만 뒤로 가기 버튼 표시 */}
          {accounts.length > 0 && (
            <TouchableOpacity
              style={s.backBtn}
              onPress={handleBack}
              activeOpacity={0.7}
            >
              <Text style={s.backBtnText}>← 저장된 계정 보기</Text>
            </TouchableOpacity>
          )}
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
  // ════════════════════════════════════════
  // 🆕 계좌 선택 화면 스타일
  // ════════════════════════════════════════
  selectCard: {
    backgroundColor: '#fff', borderRadius: 20,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
    maxHeight: 400,
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  accountName: {
    fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1,
  },
  accountLoginBtn: {
    backgroundColor: '#22c55e', borderRadius: 10,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  accountLoginText: {
    color: '#fff', fontSize: 14, fontWeight: '700',
  },
  addBtn: {
    paddingVertical: 18, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  addBtnText: {
    color: '#22c55e', fontSize: 15, fontWeight: '600',
  },
  // 🆕 로그인 폼 "뒤로" 버튼
  backBtn: {
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  backBtnText: {
    color: '#888', fontSize: 14,
  },
});