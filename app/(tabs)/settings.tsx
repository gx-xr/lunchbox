import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, MAX_ACCOUNTS, SavedAccount } from '../../store/authStore';
// 🆕 토큰 발급 함수
import { fetchToken } from '../../services/auth';
import { SafeAreaView } from 'react-native-safe-area-context';



  // ════════════════════════════════════════
  // ── 🆕 키 마스킹 헬퍼 ────────────────────
  // ════════════════════════════════════════
  // appkey: 앞 8자 + ... + 뒤 4자 표시 (예: "PS3zik5A...74E5")
  function maskKey(key: string): string {
    if (!key || key.length < 12) return key || '-';
    return key.slice(0, 8) + '...' + key.slice(-4);
  }

  // appsecret: 전체 마스킹 (●)
  function maskSecret(secret: string): string {
    return '●'.repeat(Math.min(secret?.length ?? 20, 20));
  }


export default function SettingsScreen() {
  const router = useRouter();

  // 🆕 setActiveAccount 추가 (계정 전환용)
  const { logout, updateNickname, setActiveAccount, deleteAccount } = useAuthStore();

  // 🆕 전체 계정 리스트 selector
  const accounts = useAuthStore(s => s.accounts);

  // 🆕 활성 계정 selector — 별명/키 표시 + 저장 대상
  const activeAccount = useAuthStore(s => 
    s.accounts.find(a => a.id === s.activeAccountId) ?? null
  );

  // 🔧 별명만 state로 관리 (appkey/appsecret는 마스킹 표시만)
  const [nickname, setNickname] = useState(activeAccount?.nickname ?? '');
  // 🆕 계정 전환 중 로딩 상태
  const [switching, setSwitching] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // 🆕 활성 계정 바뀌면 별명 input 값 동기화 (6.2단계 계정 전환 대비)
  useEffect(() => {
    setNickname(activeAccount?.nickname ?? '');
  }, [activeAccount?.id, activeAccount?.nickname]);

  // ════════════════════════════════════════
  // ── 🆕 계정 전환 다이얼로그 ──────────────
  // ════════════════════════════════════════
  function handleSwitchAccount(account: SavedAccount) {
    // 이미 활성 계정이면 무시
    if (account.id === activeAccount?.id) return;
    
    Alert.alert(
      '계정 전환',
      `'${account.nickname}' 계정으로 전환할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인',
          onPress: async () => {
            try {
              setSwitching(true);
              // 새 계정의 키로 토큰 발급
              const token = await fetchToken({
                appKey: account.appkey,
                appSecret: account.appsecret,
              });
              // 활성 계정 교체
              await setActiveAccount(account.id, token);
              Alert.alert('전환 완료', `'${account.nickname}' 계정으로 전환되었어요.`);
            } catch (e) {
              Alert.alert('전환 실패', '인증 중 오류가 발생했어요.\nApp Key와 Secret을 확인해주세요.');
            } finally {
              setSwitching(false);
            }
          }
        }
      ]
    );
  }

  // ════════════════════════════════════════
  // ── 🆕 계정 삭제 다이얼로그 ──────────────
  // ════════════════════════════════════════
  function handleDeleteAccount(account: SavedAccount) {
    const isDeletingActive = account.id === activeAccount?.id;
    
    Alert.alert(
      '계정 삭제',
      `'${account.nickname}' 계정을 정말 삭제할까요?${
        isDeletingActive ? '\n\n⚠️ 현재 활성 계정이라 자동으로 로그아웃돼요.' : ''
      }`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await deleteAccount(account.id);
            
            // 활성 계정을 삭제했으면 → 로그인 화면으로 이동
            if (isDeletingActive) {
              setEditMode(false); // 편집 모드 해제
              router.replace('/login');
            } else {
              // 비활성 계정 삭제 → 마지막 계정이었다면 편집 모드 종료
              const remaining = useAuthStore.getState().accounts.length;
              if (remaining === 0) setEditMode(false);
            }
          },
        },
      ]
    );
  }


  // 🔧 별명만 저장하는 로직으로 변경
  async function handleSave() {
    if (!activeAccount) {
      Alert.alert('알림', '임시 로그인 상태에서는 별명 저장이 불가해요.\n저장 모드로 다시 로그인해주세요.');
      return;
    }
    
    // updateNickname 내부에서 별명 유효성 검사 함
    const success = await updateNickname(activeAccount.id, nickname);
    if (success) {
      Alert.alert('저장 완료', '별명이 업데이트되었어요.');
    } else {
      Alert.alert('별명 오류', '1~10자, 한글/영문/숫자/공백만 사용 가능해요.');
    }
  }

  // ════════════════════════════════════════
  // ── 🆕 새 계정 추가 → 로그인 폼으로 이동 ─
  // ════════════════════════════════════════
  function handleAddAccount() {
    // /login 으로 이동하면서 addNew 파라미터 전달
    // → login.tsx가 이 파라미터 보고 자동로그인 스킵 + 로그인 폼 표시
    router.push({
      pathname: '/login',
      params: { addNew: '1' },
    });
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* 🔧 View → ScrollView로 변경 (콘텐츠 길어져서 스크롤 필요) */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.header}>설정</Text>

        <View style={styles.card}>
          {/* 🔧 섹션 타이틀 변경 */}
          <Text style={styles.sectionTitle}>활성 계정</Text>

          {/* ════════════════════════════════════════ */}
          {/* 🆕 별명 — 수정 가능 ──────────────────── */}
          {/* ════════════════════════════════════════ */}
          <Text style={styles.label}>계좌 별명</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="1~10자 (한글/영문/숫자/공백)"
            placeholderTextColor="#bbb"
            maxLength={10}
            autoCorrect={false}
          />

          {/* ════════════════════════════════════════ */}
          {/* 🔧 App Key — 마스킹 표시 (수정 불가) ─── */}
          {/* ════════════════════════════════════════ */}
          <Text style={styles.label}>App Key</Text>
          <View style={[styles.input, styles.inputReadOnly]}>
            <Text style={styles.readOnlyText}>
              {maskKey(activeAccount?.appkey ?? '')}
            </Text>
          </View>

          {/* ════════════════════════════════════════ */}
          {/* 🔧 App Secret — 마스킹 표시 (수정 불가) ─ */}
          {/* ════════════════════════════════════════ */}
          <Text style={styles.label}>App Secret</Text>
          <View style={[styles.input, styles.inputReadOnly]}>
            <Text style={styles.readOnlyText}>
              {maskSecret(activeAccount?.appsecret ?? '')}
            </Text>
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>저장</Text>
          </TouchableOpacity>
        </View>

        {/* ════════════════════════════════════════ */}
        {/* UI단: 🆕 보유 계정 리스트 ────────────── */}
        {/* ════════════════════════════════════════ */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            보유 계정 ({accounts.length}/{MAX_ACCOUNTS})
          </Text>
          
          {accounts.map((account, idx) => {
          const isActive = account.id === activeAccount?.id;
          const isLast = idx === accounts.length - 1;
          
          return (
            // 🔧 외부는 View — 안쪽 TouchableOpacity가 전환 트리거
            <View
              key={account.id}
              style={[styles.accountItem, isLast && { borderBottomWidth: 0 }]}
            >
              <TouchableOpacity
                style={styles.accountInfo}
                onPress={() => !editMode && handleSwitchAccount(account)}
                disabled={isActive || switching || editMode}
                activeOpacity={isActive ? 1 : 0.6}
              >
                {isActive && <Text style={styles.activeMark}>✓</Text>}
                <Text style={[styles.accountName, isActive && styles.accountNameActive]}>
                  {account.nickname}
                </Text>
                {isActive && <Text style={styles.activeLabel}>(활성)</Text>}
              </TouchableOpacity>
              
              {/* 🆕 편집 모드에서만 ✕ 삭제 버튼 표시 */}
              {editMode && (
                <TouchableOpacity
                  onPress={() => handleDeleteAccount(account)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

          {/* 🆕 + 새 계정 추가 버튼 (5개 미만일 때만) */}
          {!editMode && accounts.length < MAX_ACCOUNTS && (
            <TouchableOpacity
              style={styles.addAccountBtn}
              onPress={handleAddAccount}
              activeOpacity={0.7}
            >
              <Text style={styles.addAccountText}>+ 새 계정 추가</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ════════════════════════════════════════ */}
        {/* 🆕 보유계좌 편집 토글 버튼 ─────────────── */}
        {/* ════════════════════════════════════════ */}
        {accounts.length > 0 && (
          <TouchableOpacity
            style={styles.editToggleBtn}
            onPress={() => setEditMode(!editMode)}
            activeOpacity={0.7}
          >
            <Text style={[styles.editToggleText, editMode && styles.editToggleTextDone]}>
              {editMode ? '편집 완료' : '보유계좌 편집'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  // 🆕 ScrollView 래퍼 스타일
  scroll: { flex: 1 },
  // 🔧 ScrollView의 contentContainerStyle용 (flex 제거, 하단 여백 추가)
  container: { padding: 16, paddingBottom: 40 },
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
  // 🆕 읽기 전용 input 스타일 (App Key/Secret 마스킹 표시용)
  inputReadOnly: {
    justifyContent: 'center',
    minHeight: 46, // input과 비슷한 높이
  },
  readOnlyText: {
    fontSize: 15,
    color: '#888', // 회색 — 수정 불가 시각화
  },
  // 🆕 보유 계정 리스트 스타일
  accountItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  accountInfo: {
    flexDirection: 'row', alignItems: 'center',
    flex: 1,
  },
  activeMark: {
    fontSize: 16, color: '#22c55e', fontWeight: '700',
    marginRight: 8,
  },
  accountName: {
    fontSize: 15, color: '#1a1a1a', fontWeight: '500',
  },
  accountNameActive: {
    fontWeight: '700', color: '#22c55e',
  },
  activeLabel: {
    fontSize: 12, color: '#22c55e', marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#3182f6', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  // 🆕 + 새 계정 추가 버튼 스타일
addAccountBtn: {
  paddingVertical: 16,
  alignItems: 'center',
  borderTopWidth: 1, borderTopColor: '#f0f0f0',
  marginTop: 4,
},
addAccountText: {
  color: '#22c55e', fontSize: 15, fontWeight: '600',
},
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  logoutButton: {
    backgroundColor: '#fff', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: '#f04452',
  },
  // 🆕 ✕ 삭제 버튼 (편집 모드)
  deleteBtn: {
    width: 30, height: 30,
    borderRadius: 15,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 8,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 14, fontWeight: '700',
  },
  // 🆕 보유계좌 편집 토글 버튼
  editToggleBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  editToggleText: {
    color: '#ef4444', // 편집 진입 — 빨강 (위험 신호)
    fontSize: 14,
    fontWeight: '600',
  },
  editToggleTextDone: {
    color: '#888', // 편집 완료 — 회색 (중립)
  },
  logoutText: { color: '#f04452', fontSize: 15, fontWeight: '700' },
});