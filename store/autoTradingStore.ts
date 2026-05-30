/**
 * store/autoTradingStore.ts
 * ✅ priceMargin 제거 (매수호가 그대로 주문)
 * ✅ CallTradingEntry 추가 (콜매도 자동화)
 * ✅ AutoSellConfig qty 추가 (다음 위클리 계약수)
 * ✅ AutoTradingEntry jandatecnt 추가 (만기일 체크용)
 * ✅ futures1530DoneDate/futures1545DoneDate 추가 (날짜 기반 리셋)
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './authStore';
 
// ─── 풋매도 자동화 엔트리 ─────────────────────────────────────
export interface AutoTradingEntry {
  putCode: string;
  putName: string;
  actprice: number;
  market: 'KOSPI200' | 'KOSDAQ150';
  closingPrice: number;
  hedgeQty: number;
  futuresCode: string;
  // 🔧 청산 라이프사이클 전용 (hedged 제거)
  status: 'monitoring' | 'closing' | 'closed';
  // 🔧 헤지 상태 별도 필드 (optional, 기본값 false 취급)
  hedged?: boolean;
  currentPrice: number;
  registeredAt: string;
  acntNo: string;
  emaEnabled: boolean;
  averageBasis: number;
  basisCalculatedAt: string;
  jandatecnt: number; // 만기일 체크용 잔여일
}
 
// ─── 콜매도 자동화 엔트리 ──────────────────────────────────
export interface CallTradingEntry {
  callCode: string;
  callName: string;
  actprice: number;
  market: 'KOSPI200' | 'KOSDAQ150';
  closingPrice: number;
  hedgeQty: number;
  futuresCode: string;
  // 🔧 청산 라이프사이클 전용 (hedged 제거)
  status: 'monitoring' | 'closing' | 'closed';
  // 🔧 헤지 상태 별도 필드 (optional, 기본값 false 취급)
  hedged?: boolean;
  currentPrice: number;
  registeredAt: string;
  acntNo: string;
  averageBasis: number;
  basisCalculatedAt: string;
  jandatecnt: number; // 만기일 체크용 잔여일
}
 
// ─── 자동 풋매도 설정 ─────────────────────────────────────────
export interface AutoSellConfig {
  enabled: boolean;
  market: 'KOSDAQ150' | 'KOSPI200';
  nextWeeklyKey: string;
  nextWeeklyLabel: string;
  sellTime: string;       // "15:10" 형식
  gapThreshold: number;
  priceThreshold: number;
  qty: number;            // 계약수 (디폴트 1)
  actprice: number;       // 내가 매도한 풋옵션 행사가 (조건1 체크용)
  acntNo: string;
  sold: boolean;
  soldOrdNo?: string;
  checked: boolean;
  isCall?: boolean; // 콜옵션 매도 여부 (없으면 풋옵션)
}
 
export interface AutoTradingLog {
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}
 
interface AutoTradingState {
  isRunning: boolean;
  entries: AutoTradingEntry[];
  callEntries: CallTradingEntry[];
  autoSellConfigs: AutoSellConfig[];
  logs: AutoTradingLog[];
  // 🔧 풋/콜 별도 플래그 — 사이클 간 간섭 방지
  futures1530DonePut: boolean;
  futures1530DonePutDate: string;
  futures1530DoneCall: boolean;
  futures1530DoneCallDate: string;
  futures1545Done: boolean;
  futures1545DoneDate: string;
 
  setRunning: (v: boolean) => void;
 
  // 풋매도
  addEntry: (entry: AutoTradingEntry) => void;
  removeEntry: (putCode: string) => void;
  updateEntry: (putCode: string, patch: Partial<AutoTradingEntry>) => void;
  setEntryStatus: (putCode: string, status: AutoTradingEntry['status']) => void;
  setEntryHedged: (putCode: string, hedged: boolean) => void; // 🔧 헤지 상태 별도 setter
  updateCurrentPrice: (putCode: string, price: number) => void;
  updateEntryBasis: (putCode: string, averageBasis: number) => void;
  getCurrentEntries: () => AutoTradingEntry[];
 
  // 콜매도
  addCallEntry: (entry: CallTradingEntry) => void;
  removeCallEntry: (callCode: string) => void;
  updateCallEntry: (callCode: string, patch: Partial<CallTradingEntry>) => void;
  setCallEntryStatus: (callCode: string, status: CallTradingEntry['status']) => void;
  setCallEntryHedged: (callCode: string, hedged: boolean) => void; // 🔧 헤지 상태 별도 setter
  updateCallCurrentPrice: (callCode: string, price: number) => void;
  updateCallBasis: (callCode: string, averageBasis: number) => void;
  getCurrentCallEntries: () => CallTradingEntry[];
 
  addLog: (log: AutoTradingLog) => void;
  clearLogs: () => void;
  // 🔧 풋/콜 분리
  setFutures1530DonePut: (v: boolean) => void;
  setFutures1530DoneCall: (v: boolean) => void;
  setFutures1545Done: (v: boolean) => void;
  resetDaily: () => void;
 
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
      callEntries: [],
      autoSellConfigs: [],
      logs: [],
      // 🔧 풋/콜 별도 플래그
      futures1530DonePut: false,
      futures1530DonePutDate: '',
      futures1530DoneCall: false,
      futures1530DoneCallDate: '',
      futures1545Done: false,
      futures1545DoneDate: '',
 
      setRunning: (v) => set({ isRunning: v }),
 
      // ─── 풋매도 ──────────────────────────────────────────────
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

      // 🔧 헤지 상태 별도 setter — 청산 라이프사이클과 독립
      setEntryHedged: (putCode, hedged) =>
        set((s) => ({
          entries: s.entries.map((e) => e.putCode === putCode ? { ...e, hedged } : e),
        })),
 
      updateCurrentPrice: (putCode, price) =>
        set((s) => ({
          entries: s.entries.map((e) => e.putCode === putCode ? { ...e, currentPrice: price } : e),
        })),
 
      updateEntryBasis: (putCode, averageBasis) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.putCode === putCode
              ? { ...e, averageBasis, basisCalculatedAt: new Date().toLocaleTimeString('ko-KR') }
              : e
          ),
        })),
 
      getCurrentEntries: () => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        if (!acntNo) return [];
        return get().entries.filter((e) => e.acntNo === acntNo);
      },
 
      // ─── 콜매도 ──────────────────────────────────────────────
      addCallEntry: (entry) =>
        set((s) => ({
          callEntries: [...s.callEntries.filter((e) => e.callCode !== entry.callCode), entry],
        })),
 
      removeCallEntry: (callCode) =>
        set((s) => ({ callEntries: s.callEntries.filter((e) => e.callCode !== callCode) })),
 
      updateCallEntry: (callCode, patch) =>
        set((s) => ({
          callEntries: s.callEntries.map((e) => e.callCode === callCode ? { ...e, ...patch } : e),
        })),
 
      setCallEntryStatus: (callCode, status) =>
        set((s) => ({
          callEntries: s.callEntries.map((e) => e.callCode === callCode ? { ...e, status } : e),
        })),

      // 🔧 콜 헤지 상태 별도 setter
      setCallEntryHedged: (callCode, hedged) =>
        set((s) => ({
          callEntries: s.callEntries.map((e) => e.callCode === callCode ? { ...e, hedged } : e),
        })),
         
      updateCallCurrentPrice: (callCode, price) =>
        set((s) => ({
          callEntries: s.callEntries.map((e) => e.callCode === callCode ? { ...e, currentPrice: price } : e),
        })),
 
      updateCallBasis: (callCode, averageBasis) =>
        set((s) => ({
          callEntries: s.callEntries.map((e) =>
            e.callCode === callCode
              ? { ...e, averageBasis, basisCalculatedAt: new Date().toLocaleTimeString('ko-KR') }
              : e
          ),
        })),
 
      getCurrentCallEntries: () => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        if (!acntNo) return [];
        return get().callEntries.filter((e) => e.acntNo === acntNo);
      },
 
      // ─── 공통 ────────────────────────────────────────────────
      addLog: (log) => set((s) => ({ logs: [log, ...s.logs].slice(0, 100) })),
      clearLogs: () => set({ logs: [] }),
 
      // 날짜 기반 중복 방지: true 세팅 시 오늘 날짜(YYYY-MM-DD) 함께 저장
      // 🔧 풋/콜 별도 setter
      setFutures1530DonePut: (v) => set({
        futures1530DonePut: v,
        futures1530DonePutDate: v ? new Date().toISOString().slice(0, 10) : '',
      }),
      setFutures1530DoneCall: (v) => set({
        futures1530DoneCall: v,
        futures1530DoneCallDate: v ? new Date().toISOString().slice(0, 10) : '',
      }),
      setFutures1545Done: (v) => set({
        futures1545Done: v,
        futures1545DoneDate: v ? new Date().toISOString().slice(0, 10) : '',
      }),
 
      // 만기일 당일(jandatecnt <= 1) 항목만 삭제, 나머지는 유지
      resetDaily: () => set((s) => {
        const acntNo = useAuthStore.getState().acntNo ?? '';
        return {
          // 🔧 풋/콜 별도 리셋
          futures1530DonePut: false,
          futures1530DonePutDate: '',
          futures1530DoneCall: false,
          futures1530DoneCallDate: '',
          futures1545Done: false,
          futures1545DoneDate: '',
          // 풋매도: 만기일 당일만 삭제, 나머지 유지
          entries: s.entries.filter((e) =>
            e.acntNo !== acntNo || e.jandatecnt > 1
          ),
          // 콜매도: 만기일 당일만 삭제, 나머지 유지
          callEntries: s.callEntries.filter((e) =>
            e.acntNo !== acntNo || e.jandatecnt > 1
          ),
          autoSellConfigs: s.autoSellConfigs.map((c) =>
            c.acntNo === acntNo
              ? { ...c, sold: false, soldOrdNo: undefined, checked: false }
              : c
          ),
          logs: [],
        };
      }),
 
      // ─── 자동 풋매도 ─────────────────────────────────────────
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
        if (!acntNo) return [];
        return get().autoSellConfigs.filter((c) => c.acntNo === acntNo && c.enabled);
      },
    }),
    {
      name: 'auto-trading-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        entries: state.entries,
        callEntries: state.callEntries,
        autoSellConfigs: state.autoSellConfigs,
        // 🔧 풋/콜 별도 persist
        futures1530DonePut: state.futures1530DonePut,
        futures1530DonePutDate: state.futures1530DonePutDate,
        futures1530DoneCall: state.futures1530DoneCall,
        futures1530DoneCallDate: state.futures1530DoneCallDate,
        futures1545Done: state.futures1545Done,
        futures1545DoneDate: state.futures1545DoneDate,
      }),
    }
  )
);
 
export function reinitAutoTradingStore() {
  // no-op: 하위 호환성 유지
}