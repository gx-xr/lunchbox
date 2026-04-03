import { create } from 'zustand';
import { AuthCredentials } from '../types/trading';

interface AuthState {
  isLoggedIn: boolean;
  credentials: AuthCredentials | null;
  token: string | null;
  // 로그인: 나중에 services/auth.ts에서 토큰 받아서 setToken()으로 저장
  login: (creds: AuthCredentials, token?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  credentials: null,
  token: null,

  login: (creds, token = 'mock-token') =>
    set({ isLoggedIn: true, credentials: creds, token }),

  logout: () =>
    set({ isLoggedIn: false, credentials: null, token: null }),
}));