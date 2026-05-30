/**
 * store/authStore.ts
 * 🆕 다중 계정 지원 (최대 5개)
 * 🆕 자동로그인 (appkey/appsecret 기반 — 토큰은 매번 재발급)
 * 🆕 별명 관리 (1~10자, 한/영/숫자/공백)
 *
 * 📌 저장 정책
 *   - SecureStore: { accounts, activeAccountId } JSON 한 덩어리
 *   - 토큰: 메모리에만 (보안 + 만료 관리 회피)
 *
 * 📌 호환성
 *   - credentials/acntNo 필드 유지 (다른 파일 안 건드림)
 *   - login() 메소드 유지 (3단계에서 신규 흐름으로 교체 예정)
 *     · 자동 별명 생성: "계정 1", "계정 2"...
 *     · 동일 appkey/appsecret 재로그인 시 기존 계정 활성화 (중복 추가 X)
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthCredentials } from '../types/trading';

// ════════════════════════════════════════
// ── 상수 ────────────────────────────────
// ════════════════════════════════════════
const KEY_AUTH_STATE = 'ls_auth_state';
export const MAX_ACCOUNTS = 5;
// 별명 규칙: 한글/영문/숫자/공백, 1~10자
export const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9 ]{1,10}$/;

// ════════════════════════════════════════
// ── 타입 ────────────────────────────────
// ════════════════════════════════════════
export interface SavedAccount {
  id: string;          // 내부 고유 ID
  appkey: string;
  appsecret: string;
  acntNo: string;      // 로그인 후 채워짐
  nickname: string;    // 1~10자, 한/영/숫자/공백
}

// SecureStore에 저장되는 영구 데이터 형태
interface PersistedState {
  accounts: SavedAccount[];
  activeAccountId: string | null;
}

interface AuthState {
  // ── 영구 저장 대상 (SecureStore) ──
  accounts: SavedAccount[];
  activeAccountId: string | null;

  // ── 메모리만 ──
  token: string | null;
  isLoggedIn: boolean;

  // ── 호환용 필드 (다른 파일이 의존) ──
  credentials: AuthCredentials | null;  // = 활성 계정의 {appKey, appSecret}
  acntNo: string | null;                 // = 활성 계정의 acntNo

  // ── 계정 관리 (신규) ──
  addAccount: (creds: AuthCredentials, nickname: string) => Promise<SavedAccount | null>;
  setActiveAccount: (accountId: string, token: string) => Promise<boolean>;
  deleteAccount: (accountId: string) => Promise<void>;
  updateNickname: (accountId: string, newNickname: string) => Promise<boolean>;

  // ── 세션 (신규) ──
  restoreSession: () => Promise<boolean>;
  logout: () => Promise<void>;  // activeAccountId만 해제, accounts 유지

  // ── 기존 호환 (3단계에서 새 흐름으로 교체 예정) ──
  login: (creds: AuthCredentials, token: string, saveKey?: boolean) => Promise<void>;
  saveCredentials: (creds: AuthCredentials) => Promise<void>;
  setAcntNo: (acntNo: string) => void;
}

// ════════════════════════════════════════
// ── 유틸 함수 ───────────────────────────
// ════════════════════════════════════════

// 별명 유효성 검사 — UI에서도 import해서 쓸 수 있게 export
export function validateNickname(nickname: string): { valid: boolean; reason?: string } {
  if (!nickname || nickname.length === 0) {
    return { valid: false, reason: '별명을 입력해주세요' };
  }
  if (nickname.length > 10) {
    return { valid: false, reason: '별명은 10자 이내여야 해요' };
  }
  if (!NICKNAME_REGEX.test(nickname)) {
    return { valid: false, reason: '한글/영문/숫자/공백만 사용 가능해요' };
  }
  return { valid: true };
}

// 간단한 ID 생성 (외부 라이브러리 없이)
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

// SecureStore 저장
async function saveToSecureStore(state: PersistedState): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY_AUTH_STATE, JSON.stringify(state));
  } catch (e) {
    console.log('[authStore] SecureStore 저장 실패:', e);
  }
}

// SecureStore 로드
async function loadFromSecureStore(): Promise<PersistedState | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY_AUTH_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.accounts)) return null;
    return {
      accounts: parsed.accounts,
      activeAccountId: parsed.activeAccountId ?? null,
    };
  } catch (e) {
    console.log('[authStore] SecureStore 로드 실패:', e);
    return null;
  }
}

// ════════════════════════════════════════
// ── 스토어 ──────────────────────────────
// ════════════════════════════════════════
export const useAuthStore = create<AuthState>((set, get) => ({
  // ─── 초기 state ─────────────────────────────────────────
  accounts: [],
  activeAccountId: null,
  token: null,
  isLoggedIn: false,
  credentials: null,
  acntNo: null,

  // ─── 계정 추가 ──────────────────────────────────────────
  // 5개 초과 또는 별명 무효 시 null 반환 (UI에서 Alert 띄움)
  addAccount: async (creds, nickname) => {
    const state = get();

    // 별명 검사
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      console.log('[authStore] 별명 오류:', validation.reason);
      return null;
    }

    // 5개 초과 검사
    if (state.accounts.length >= MAX_ACCOUNTS) {
      console.log('[authStore] 계정 5개 초과');
      return null;
    }

    // 새 계정 생성
    const newAccount: SavedAccount = {
      id: generateId(),
      appkey: creds.appKey,
      appsecret: creds.appSecret,
      acntNo: '',
      nickname,
    };

    const newAccounts = [...state.accounts, newAccount];

    await saveToSecureStore({
      accounts: newAccounts,
      activeAccountId: state.activeAccountId,
    });

    set({ accounts: newAccounts });
    return newAccount;
  },

  // ─── 활성 계정 전환 ─────────────────────────────────────
  // 토큰은 호출 측에서 미리 발급받아 전달
  setActiveAccount: async (accountId, token) => {
    const state = get();
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) {
      console.log('[authStore] 계정 없음:', accountId);
      return false;
    }

    await saveToSecureStore({
      accounts: state.accounts,
      activeAccountId: accountId,
    });

    // 호환용 필드 동기화 (다른 파일들이 credentials/acntNo 그대로 쓸 수 있게)
    set({
      activeAccountId: accountId,
      token,
      isLoggedIn: true,
      credentials: { appKey: account.appkey, appSecret: account.appsecret },
      acntNo: account.acntNo,
    });

    return true;
  },

  // ─── 계정 삭제 (보유계좌 편집 화면에서만 호출) ──────────
  deleteAccount: async (accountId) => {
    const state = get();
    const newAccounts = state.accounts.filter(a => a.id !== accountId);
    const isDeletingActive = state.activeAccountId === accountId;

    await saveToSecureStore({
      accounts: newAccounts,
      activeAccountId: isDeletingActive ? null : state.activeAccountId,
    });

    if (isDeletingActive) {
      // 활성 계정 삭제 시 → 자동 로그아웃
      set({
        accounts: newAccounts,
        activeAccountId: null,
        token: null,
        isLoggedIn: false,
        credentials: null,
        acntNo: null,
      });
    } else {
      set({ accounts: newAccounts });
    }
  },

  // ─── 별명 수정 ──────────────────────────────────────────
  updateNickname: async (accountId, newNickname) => {
    const validation = validateNickname(newNickname);
    if (!validation.valid) {
      console.log('[authStore] 별명 오류:', validation.reason);
      return false;
    }

    const state = get();
    const newAccounts = state.accounts.map(a =>
      a.id === accountId ? { ...a, nickname: newNickname } : a
    );

    await saveToSecureStore({
      accounts: newAccounts,
      activeAccountId: state.activeAccountId,
    });

    set({ accounts: newAccounts });
    return true;
  },

  // ─── 세션 복원 (앱 시작 시 _layout.tsx에서 호출) ────────
  // 토큰 발급은 호출 측에서 처리
  restoreSession: async () => {
    const persisted = await loadFromSecureStore();
    if (!persisted) return false;

    // accounts/activeAccountId는 state에 저장 (2단계에서 _layout이 직접 읽음)
    set({
      accounts: persisted.accounts,
      activeAccountId: persisted.activeAccountId,
    });

    // 🔧 토큰 없이는 false 반환 — 2단계에서 토큰 발급 후 setActiveAccount 호출
    return false;
  },

  // ─── 로그아웃 (activeAccountId만 해제, accounts는 유지) ─
  logout: async () => {
    const state = get();
    await saveToSecureStore({
      accounts: state.accounts,
      activeAccountId: null,
    });
    set({
      activeAccountId: null,
      token: null,
      isLoggedIn: false,
      credentials: null,
      acntNo: null,
    });
  },

  // ════════════════════════════════════════════════════════
  // ── 기존 호환 메소드 (3단계에서 새 흐름으로 교체 예정) ─
  // ════════════════════════════════════════════════════════

  // 기존 로그인 화면 호환용
  // saveKey === true면 영구 저장, false면 메모리만
  // 별명은 자동 생성, 동일 키 재로그인 시 기존 계정 활성화
  login: async (creds, token, saveKey = false) => {
    if (!saveKey) {
      // 저장 X → 메모리만 (호환 필드만 세팅)
      set({ token, isLoggedIn: true, credentials: creds });
      return;
    }

    const state = get();

    // 동일 appkey/appsecret 이미 있나? → 있으면 그 계정 활성화
    const existing = state.accounts.find(
      a => a.appkey === creds.appKey && a.appsecret === creds.appSecret
    );
    if (existing) {
      await get().setActiveAccount(existing.id, token);
      return;
    }

    // 새 계정 — 자동 별명 생성 ("계정 1", "계정 2"...)
    let n = state.accounts.length + 1;
    let autoNickname = `계정 ${n}`;
    while (state.accounts.some(a => a.nickname === autoNickname)) {
      n++;
      autoNickname = `계정 ${n}`;
    }

    const newAccount = await get().addAccount(creds, autoNickname);
    if (newAccount) {
      await get().setActiveAccount(newAccount.id, token);
    } else {
      // 5개 초과 등 실패 → 메모리만 (앱은 계속 동작)
      set({ token, isLoggedIn: true, credentials: creds });
    }
  },

  // 활성 계정의 appkey/appsecret 수정 (설정 화면 호환용)
  saveCredentials: async (creds) => {
    const state = get();
    if (!state.activeAccountId) {
      // 활성 계정 없으면 메모리만
      set({ credentials: creds });
      return;
    }

    // 활성 계정의 키 정보 갱신 + SecureStore 동기화
    const newAccounts = state.accounts.map(a =>
      a.id === state.activeAccountId
        ? { ...a, appkey: creds.appKey, appsecret: creds.appSecret }
        : a
    );

    await saveToSecureStore({
      accounts: newAccounts,
      activeAccountId: state.activeAccountId,
    });

    set({ accounts: newAccounts, credentials: creds });
  },

  // acntNo 세팅 (잔고 조회 후 호출됨)
  // 호환용 필드 + 활성 계정의 acntNo 모두 갱신
  setAcntNo: (acntNo) => {
    const state = get();
    if (state.activeAccountId) {
      const newAccounts = state.accounts.map(a =>
        a.id === state.activeAccountId ? { ...a, acntNo } : a
      );
      set({ acntNo, accounts: newAccounts });
      // SecureStore도 비동기 동기화 (await 안 함 — 빠른 응답 위해)
      saveToSecureStore({
        accounts: newAccounts,
        activeAccountId: state.activeAccountId,
      });
    } else {
      set({ acntNo });
    }
  },
}));