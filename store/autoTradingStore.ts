/**
 * store/autoTradingStore.ts
 * ✅ priceMargin 제거 (매수호가 그대로 주문)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './authStore';
 
export interface AutoTradingEntry {
  putCode: string;
  putName: string;
  actprice: number;
  market: 'KOSPI200' | 'KOSDAQ150';
  closingPrice: number;
  hedgeQty: number;
  futuresCode: string;
  status: 'monitoring' | 'closed' | 'hedged';
  currentPrice: number;
  registeredAt: string;
  acntNo: string;
  emaEnabled: boolean; // ✅ AI 매도 (EMA) 활성화 여부
}
 
// ─── 자동 풋매도 설정 ─────────────────────────────────────────
export interface AutoSellConfig {
  enabled: boolean;
  market: 'KOSDAQ150' | 'KOSPI200';
  nextWeeklyKey: string;        // 다음 위클리 (예: 'W4THU')
  nextWeeklyLabel: string;      // 표시용 (예: 'W4 목요일')
  sellTime: string;             // 매도 시점 (예: '1510')
  gapThreshold: number;         // 기준값 (현물가 - 행사가 > 기준값)
  priceThreshold: number;       // 지정호가 (최소 옵션 프리미엄)
  // ✅ priceMargin 제거 — 매수호가 그대로 주문
  acntNo: string;
  sold: boolean;
  soldOrdNo?: string;
  checked: boolean;
}
 
export interface AutoTradingLog {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}
 
interface AutoTradingState {
  isRunning: boolean;
  entries: AutoTradingEntry[];
  autoSellConfigs: AutoSellConfig[];
  logs: AutoTradingLog[];
  futures1530Done: boolean;  // 선물 자동매수 완료 여부
  futures1545Done: boolean;
 
  setRunning: (v: boolean) => void;
  addEntry: (entry: AutoTradingEntry) => void;
  removeEntry: (putCode: string) => void;
  updateEntry: (putCode: string, patch: Partial<AutoTradingEntry>) => void;
  setEntryStatus: (putCode: string, status: AutoTradingEntry['status']) => void;
  updateCurrentPrice: (putCode: string, price: number) => void;
  addLog: (log: AutoTradingLog) => void;
  clearLogs: () => void;
  setFutures1530Done: (v: boolean) => void;
  setFutures1545Done: (v: boolean) => void;
  resetDaily: () => void;
  getCurrentEntries: () => AutoTradingEntry[];
 
  // 자동 풋매도
  addAutoSellConfig: (config: AutoSellConfig) => void;
  removeAutoSellConfig: (nextWeeklyKey: string, acntNo: string) => void;
  setAutoSellSold: (nextWeeklyKey: string, acntNo: string, ordNo: string) => void;
  setAutoSellChecked: (nextWeeklyKey: string, acntNo: string) => void;
  resetAutoSellChecked: (nextWeeklyKey: string, acntNo: string) => void;
  getAutoSellConfigs: () => AutoSellConfig[];
}
 
export const useAutoTradingStore = create<AutoTradingState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      entries: [],
      autoSellConfigs: [],
      logs: [],
      futures1530Done: false,
      futures1545Done: false,
 
      setRunning: (v) => set({ isRunning: v }),
 
      addEntry: (entry) =>
        set((s) => ({
          entries: [...s.entries.filter((e) => e.putCode !== entry.putCode), entry],
        })),
 
      removeEntry: (putCode) =>
        set((s) => ({ entries: s.entries.filter((e) => e.putCode !== putCode) })),
 
      updateEntry: (putCode, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => e.putCode === putCode ? { ...e, ...patch } : e),
        })),
 
      setEntryStatus: (putCode, status) =>
        set((s) => ({
          entries: s.entries.map((e) => e.putCode === putCode ? { ...e, status } : e),
        })),
 
      updateCurrentPrice: (putCode, price) =>
        set((s) => ({
          entries: s.entries.map((e) => e.putCode === putCode ? { ...e, currentPrice: price } : e),
        })),
 
      addLog: (log) => set((s) => ({ logs: [log, ...s.logs].slice(0, 100) })),
      clearLogs: () => set({ logs: [] }),
      setFutures1530Done: (v) => set({ futures1530Done: v }),
      setFutures1545Done: (v) => set({ futures1545Done: v }),
 
      resetDaily: () => set((s) => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        return {
          futures1530Done: false,
          futures1545Done: false,
          entries: s.entries.filter((e) => e.acntNo !== acntNo),
          autoSellConfigs: s.autoSellConfigs.map((c) =>
            c.acntNo === acntNo
              ? { ...c, sold: false, soldOrdNo: undefined, checked: false }
              : c
          ),
          logs: [],
        };
      }),
 
      getCurrentEntries: () => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        return get().entries.filter((e) => e.acntNo === acntNo);
      },
 
      // ─── 자동 풋매도 ────────────────────────────────────────
      addAutoSellConfig: (config) =>
        set((s) => ({
          autoSellConfigs: [
            ...s.autoSellConfigs.filter(
              (c) => !(c.nextWeeklyKey === config.nextWeeklyKey && c.acntNo === config.acntNo)
            ),
            config,
          ],
        })),
 
      removeAutoSellConfig: (nextWeeklyKey, acntNo) =>
        set((s) => ({
          autoSellConfigs: s.autoSellConfigs.filter(
            (c) => !(c.nextWeeklyKey === nextWeeklyKey && c.acntNo === acntNo)
          ),
        })),
 
      setAutoSellSold: (nextWeeklyKey, acntNo, ordNo) =>
        set((s) => ({
          autoSellConfigs: s.autoSellConfigs.map((c) =>
            c.nextWeeklyKey === nextWeeklyKey && c.acntNo === acntNo
              ? { ...c, sold: true, soldOrdNo: ordNo }
              : c
          ),
        })),
 
      setAutoSellChecked: (nextWeeklyKey, acntNo) =>
        set((s) => ({
          autoSellConfigs: s.autoSellConfigs.map((c) =>
            c.nextWeeklyKey === nextWeeklyKey && c.acntNo === acntNo
              ? { ...c, checked: true }
              : c
          ),
        })),
 
      // ✅ 스프레드 초과 시 재시도를 위한 checked 리셋
      resetAutoSellChecked: (nextWeeklyKey, acntNo) =>
        set((s) => ({
          autoSellConfigs: s.autoSellConfigs.map((c) =>
            c.nextWeeklyKey === nextWeeklyKey && c.acntNo === acntNo
              ? { ...c, checked: false }
              : c
          ),
        })),
 
      getAutoSellConfigs: () => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        return get().autoSellConfigs.filter((c) => c.acntNo === acntNo && c.enabled);
      },
    }),
    {
      name: 'auto-trading-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entries: state.entries,
        autoSellConfigs: state.autoSellConfigs,
        futures1530Done: state.futures1530Done,
        futures1545Done: state.futures1545Done,
      }),
    }
  )
);
 
export function reinitAutoTradingStore() {
  // no-op: 하위 호환성 유지
}