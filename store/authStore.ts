import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { AuthCredentials } from '../types/trading';
 
const KEY_APP_KEY    = 'ls_app_key';
const KEY_APP_SECRET = 'ls_app_secret';
const KEY_TOKEN      = 'ls_token';
 
interface AuthState {
  isLoggedIn: boolean;
  credentials: AuthCredentials | null;
  token: string | null;
  acntNo: string | null;
  login: (creds: AuthCredentials, token: string, saveKey?: boolean) => Promise<void>;
  saveCredentials: (creds: AuthCredentials) => Promise<void>; // ✅ 추가
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  setAcntNo: (acntNo: string) => void;
}
 
export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  credentials: null,
  token: null,
  acntNo: null,
 
  login: async (creds, token, saveKey = false) => {
    if (saveKey) {
      await SecureStore.setItemAsync(KEY_APP_KEY, creds.appKey);
      await SecureStore.setItemAsync(KEY_APP_SECRET, creds.appSecret);
      await SecureStore.setItemAsync(KEY_TOKEN, token);
    } else {
      await SecureStore.deleteItemAsync(KEY_APP_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(KEY_APP_SECRET).catch(() => {});
      await SecureStore.deleteItemAsync(KEY_TOKEN).catch(() => {});
    }
    set({ isLoggedIn: true, credentials: creds, token });
  },
 
  // ✅ API 키만 저장 (토큰 발급 없이) — 설정 화면에서 사용
  saveCredentials: async (creds) => {
    await SecureStore.setItemAsync(KEY_APP_KEY, creds.appKey);
    await SecureStore.setItemAsync(KEY_APP_SECRET, creds.appSecret);
    set({ credentials: creds });
  },
 
  logout: async () => {
    await SecureStore.deleteItemAsync(KEY_APP_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(KEY_APP_SECRET).catch(() => {});
    await SecureStore.deleteItemAsync(KEY_TOKEN).catch(() => {});
    set({ isLoggedIn: false, credentials: null, token: null, acntNo: null });
  },
 
  restoreSession: async () => {
    try {
      const appKey    = await SecureStore.getItemAsync(KEY_APP_KEY);
      const appSecret = await SecureStore.getItemAsync(KEY_APP_SECRET);
      const token     = await SecureStore.getItemAsync(KEY_TOKEN);
      if (appKey && appSecret && token) {
        set({ isLoggedIn: true, credentials: { appKey, appSecret }, token });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },
 
  setAcntNo: (acntNo) => set({ acntNo }),
}));