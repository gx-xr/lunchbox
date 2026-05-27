/**
 * services/autoTrading.ts
 * 15:30 전량 청산 제거 (거래소 정산)
 * closeOption → 지정가(closingPrice)로 청산
 * 청산 주문 접수 → closing 상태, 체결 확인 후 closed 상태
 * 선물 자동매수 → offerho1 지정가 매수
 * runAutoSellCycle → 풋/콜 분기 (config.isCall)
 * closingPrice: 0, hedgeQty: 0 일 때 해당 기능 무시
 * fetchAverageBasis → t2111+t1511 직접 조회로 교체
 * 베이시스 계산 시간 15:10~15:20
 * 만기일 체크 (jandatecnt < 1) 추가
 */
 
import BackgroundActions from 'react-native-background-actions';
import { useAutoTradingStore, AutoTradingEntry, CallTradingEntry } from '../store/autoTradingStore';
import { placeFuturesOrder, fetchFuturesOrders } from './order';
import { fetchFuturesHogaData } from './market';
import { useAuthStore } from '../store/authStore';
import { AiBot } from './aiBot';
 
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
 
// ════════════════════════════════════════
// ── 전역 변수 ───────────────────────────
// ════════════════════════════════════════
// 15:20~15:29 구간 30초 체크용 타임스탬프
let lastMonitorCheckMs = 0;
// 베이시스 수집용 버퍼 (putCode별로 최대 10개)
let basisBuffer: Record<string, number[]> = {};
// 베이시스 마지막 수집 타임스탬프 (30초 주기)
let lastBasisCollectMs = 0;
// 콜매도 베이시스 별도 타임스탬프 (풋매도와 분리)
let lastCallBasisCollectMs = 0;
 
// ════════════════════════════════════════
// ── 유틸 함수 ───────────────────────────
// ════════════════════════════════════════
 
// ─── 토큰 조회 ───────────────────────────────────────────────
function getToken(): string {
  return useAuthStore.getState().token ?? '';
}
 
// ─── 로그 출력 ───────────────────────────────────────────────
function log(msg: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const time = new Date().toLocaleTimeString('ko-KR');
  useAutoTradingStore.getState().addLog({ time, message: msg, level });
  console.log(`[AutoTrading][${level}] ${time} ${msg}`);
}
 
// ─── 현재 시간 HHMM 형식 반환 ───────────────────────────────
function hhmm(): number {
  const d = new Date();
  return d.getHours() * 100 + d.getMinutes();
}
 
// ════════════════════════════════════════
// ── 시세 조회 함수들 ────────────────────
// ════════════════════════════════════════
 
// ─── 옵션/선물 현재가 조회 (t2101) ──────────────────────────
async function fetchOptionPrice(token: string, focode: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't2101',
        'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
      },
      body: JSON.stringify({ t2101InBlock: { focode } }),
    });
    const data = await res.json();
    return Number(data?.t2101OutBlock?.price ?? 0);
  } catch {
    return 0;
  }
}
 
// ─── 현물지수 조회 ───────────────────────────────────────────
// KOSPI200: t2111 → kospijisu 필드
// KOSDAQ150: t1511 → pricejisu 필드
async function fetchSpotPrice(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150'
): Promise<number> {
  try {
    if (market === 'KOSPI200') {
      const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't2111',
          'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t2111InBlock: { focode: 'A0166000' } }),
      });
      const data = await res.json();
      return Number(data?.t2111OutBlock?.kospijisu ?? 0);
    } else {
      // 코스닥150 현물지수 (upcode: '405')
      const res = await fetch(`${BASE_URL}/indtp/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't1511',
          'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t1511InBlock: { upcode: '405' } }),
      });
      const data = await res.json();
      return Number(data?.t1511OutBlock?.pricejisu ?? 0);
    }
  } catch (e: any) {
    log(`[현물가조회오류] ${market}: ${e?.message}`, 'error');
    return 0;
  }
}
 
// ─── 현물가 조회 래퍼 (자동매도용) ─────────────────────────
async function fetchSpotForAutoSell(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150'
): Promise<number> {
  try {
    const price = await fetchSpotPrice(token, market);
    log(`[현물가] ${market}: ${price.toFixed(2)}`, 'info');
    return price;
  } catch { return 0; }
}
 
// ─── 선물가 조회 (t2111) ────────────────────────────────────
async function fetchFuturesPrice(token: string, futuresCode: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't2111',
        'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
      },
      body: JSON.stringify({ t2111InBlock: { focode: futuresCode } }),
    });
    const data = await res.json();
    return Number(data?.t2111OutBlock?.price ?? 0);
  } catch {
    return 0;
  }
}
 
// ─── 평균 베이시스 실시간 수집 (15:10~15:20, 30초마다) ───────
// t2111(선물가) + t1511/kospijisu(현물가) 직접 조회
// 선물가 - 현물가 = Basis, 최대 10개 수집 후 평균
async function collectBasisSample(
  token: string,
  entry: AutoTradingEntry,
): Promise<void> {
  try {
    const [futuresPrice, spotPrice] = await Promise.all([
      fetchFuturesPrice(token, entry.futuresCode),
      fetchSpotPrice(token, entry.market),
    ]);
 
    if (futuresPrice <= 0 || spotPrice <= 0) {
      log(`[베이시스 수집] ${entry.putCode} 가격 조회 실패 (선물:${futuresPrice} 현물:${spotPrice})`, 'warn');
      return;
    }
 
    const basis = parseFloat((futuresPrice - spotPrice).toFixed(2));
 
    // putCode별 버퍼에 최신값 push (최대 10개, 오래된 것 제거)
    if (!basisBuffer[entry.putCode]) basisBuffer[entry.putCode] = [];
    basisBuffer[entry.putCode].push(basis);
    if (basisBuffer[entry.putCode].length > 10) {
      basisBuffer[entry.putCode].shift();
    }
 
    log(`[풋 베이시스 수집] ${entry.market} 선물:${futuresPrice} 현물:${spotPrice} Basis:${basis} (${basisBuffer[entry.putCode].length}개)`, 'info');
  } catch (e: any) {
    log(`[베이시스 수집 오류] ${e?.message}`, 'error');
  }
}
 
// ─── 평균 베이시스 계산 (버퍼에서) ──────────────────────────
function calcAverageBasis(putCode: string): number {
  const buf = basisBuffer[putCode];
  if (!buf || buf.length === 0) return 0;
  const avg = buf.reduce((sum, b) => sum + b, 0) / buf.length;
  return parseFloat(avg.toFixed(2));
}
 
// ════════════════════════════════════════
// ── 주문 함수들 ─────────────────────────
// ════════════════════════════════════════
 
// ─── 풋매도 청산 주문 (지정가 closingPrice로 매수) ──────────
// 주문 접수 → closing, 체결 확인 후 → closed
async function closeOption(
  token: string,
  entry: AutoTradingEntry,
  reason: string
): Promise<boolean> {
  try {
    const result = await placeFuturesOrder(token, {
      fnoIsuNo: entry.putCode,
      bnsTpCode: '2',            // 매수 (풋매도 포지션 청산)
      orderType: '00',           // 지정가 고정
      price: entry.closingPrice, // 청산 예약가로 지정가 주문
      qty: 1,
      trdPtnCode: '00',
    });
    if (result.success) {
      log(`[청산주문접수] ${entry.putCode} @ ${entry.closingPrice} (${reason}) 주문번호: ${result.ordNo}`, 'success');
      useAutoTradingStore.getState().setEntryStatus(entry.putCode, 'closing');
      return true;
    } else {
      log(`[청산실패] ${entry.putCode}: ${result.message}`, 'error');
      return false;
    }
  } catch (e: any) {
    log(`[청산오류] ${entry.putCode}: ${e?.message}`, 'error');
    return false;
  }
}
 
// ─── 선물 자동 매수 (풋매도 헤지) ───────────────────────────
// 15:30 정각: offerho1 지정가 매수
async function buyFuturesHedge(
  token: string,
  entry: AutoTradingEntry,
  orderPrice: number
): Promise<void> {
  try {
    const result = await placeFuturesOrder(token, {
      fnoIsuNo: entry.futuresCode,
      bnsTpCode: '2',
      orderType: '00',
      price: orderPrice,
      qty: entry.hedgeQty,
      trdPtnCode: '00',
    });
    if (result.success) {
      log(`[헤지완료] ${entry.futuresCode} ${entry.hedgeQty}계약 @ ${orderPrice} 주문번호: ${result.ordNo}`, 'success');
      useAutoTradingStore.getState().setEntryStatus(entry.putCode, 'hedged');
    } else {
      log(`[헤지실패] ${entry.futuresCode}: ${result.message}`, 'error');
    }
  } catch (e: any) {
    log(`[헤지오류] ${e?.message}`, 'error');
  }
}
 
// ════════════════════════════════════════
// ── OTM 후보 조회 함수들 ────────────────
// ════════════════════════════════════════
 
// ─── OTM 풋옵션 후보 조회 ────────────────────────────────────
// 조건: 현물가 - 내 행사가 > gapThreshold (양수)
// 방향: ATM 바로 아래 OTM부터 내림차순 탐색 (행사가 < 현물가)
async function findOTMPutCandidates(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150',
  weeklyKey: string,
  spotPrice: number,
  myActprice: number,
  gapThreshold: number,
  priceThreshold: number,
  qty: number,
): Promise<{ putCode: string; bidPrice: number; actprice: number }[]> {
  try {
    const { fetchKQ150WeeklyCodes, fetchKQ150OptionBoard, fetchKP200WeeklyBoard } = require('../services/options');
 
    // 조건1: 현물가 - 내 행사가 > gapThreshold
    if (spotPrice - myActprice <= gapThreshold) {
      log(`[자동풋매도] 조건1 미충족: 현물가 ${spotPrice} - 내행사가 ${myActprice} = ${spotPrice - myActprice} ≤ ${gapThreshold}`, 'warn');
      return [];
    }
    log(`[자동풋매도] 조건1 충족: ${spotPrice} - ${myActprice} = ${spotPrice - myActprice} > ${gapThreshold}`, 'info');
 
    let board: any[] = [];
    if (market === 'KOSDAQ150') {
      const codes = await fetchKQ150WeeklyCodes(token);
      const week = weeklyKey.slice(0, 2);
      const day = weeklyKey.slice(2) as 'MON' | 'THU';
      const filtered = codes.filter((c: any) => c.week === week && c.weekDay === day);
      const result = await fetchKQ150OptionBoard(token, filtered);
      board = result.board;
    } else {
      const result = await fetchKP200WeeklyBoard(token, weeklyKey);
      board = result.board;
    }
 
    if (board.length === 0) { log(`[자동풋매도] board 데이터 없음`, 'warn'); return []; }
 
    const spreadLimit = market === 'KOSPI200' ? 0.2 : 1.3;
 
    // ATM 바로 아래 OTM부터 내림차순 (행사가 < 현물가)
    const otmCandidates = board
      .filter((item: any) => item.actprice < spotPrice && item.putCode)
      .sort((a: any, b: any) => b.actprice - a.actprice);
 
    if (otmCandidates.length === 0) { log(`[자동풋매도] OTM 후보 없음`, 'warn'); return []; }
 
    const results: { putCode: string; bidPrice: number; actprice: number }[] = [];
 
    for (const item of otmCandidates) {
      if (results.length >= qty) break;
      log(`[자동풋매도] 행사가 ${item.actprice} 호가 조회 중...`, 'info');
      try {
        const hogaRes = await fetch(`${BASE_URL}/futureoption/market-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't2112',
            'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t2112InBlock: { focode: item.putCode } }),
        });
        const hogaData = await hogaRes.json();
        const bid1 = Number(hogaData?.t2112OutBlock?.bidho1 ?? 0);
        const ask1 = Number(hogaData?.t2112OutBlock?.offerho1 ?? 0);
        if (bid1 <= 0 || ask1 <= 0) { log(`[자동풋매도] 행사가 ${item.actprice} 호가 없음 → 다음으로`, 'warn'); continue; }
        const spread = ask1 - bid1;
        log(`[자동풋매도] 행사가 ${item.actprice} 매수1: ${bid1} 매도1: ${ask1} 스프레드: ${spread.toFixed(2)} (기준: ${spreadLimit})`, 'info');
        if (bid1 <= priceThreshold) { log(`[자동풋매도] 행사가 ${item.actprice} 매수호가 ${bid1} ≤ ${priceThreshold} → 다음으로`, 'warn'); continue; }
        if (spread > spreadLimit) { log(`[자동풋매도] 행사가 ${item.actprice} 스프레드 ${spread.toFixed(2)} > ${spreadLimit} → 다음으로`, 'warn'); continue; }
        log(`[자동풋매도] ✅ 행사가 ${item.actprice} 조건 충족! 매수호가 ${bid1}로 매도`, 'success');
        results.push({ putCode: item.putCode, bidPrice: bid1, actprice: item.actprice });
      } catch (e: any) {
        log(`[자동풋매도] 행사가 ${item.actprice} 호가 조회 오류: ${e?.message}`, 'error');
      }
    }
    return results;
  } catch (e: any) {
    log(`[자동풋매도] OTM 종목 조회 실패: ${e?.message}`, 'error');
    return [];
  }
}
 
// ─── OTM 콜옵션 후보 조회 ────────────────────────────────────
// 조건: 내 행사가 - 현물가 > gapThreshold (콜은 현물이 행사가보다 낮을 때)
// 방향: ATM 바로 위 OTM부터 오름차순 탐색 (행사가 > 현물가)
async function findOTMCallCandidates(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150',
  weeklyKey: string,
  spotPrice: number,
  myActprice: number,
  gapThreshold: number,
  priceThreshold: number,
  qty: number,
): Promise<{ putCode: string; bidPrice: number; actprice: number }[]> {
  try {
    const { fetchKQ150WeeklyCodes, fetchKQ150OptionBoard, fetchKP200WeeklyBoard } = require('../services/options');
 
    // 조건1: 내 행사가 - 현물가 > gapThreshold (콜은 반대 방향)
    if (myActprice - spotPrice <= gapThreshold) {
      log(`[자동콜매도] 조건1 미충족: 내행사가 ${myActprice} - 현물가 ${spotPrice} = ${myActprice - spotPrice} ≤ ${gapThreshold}`, 'warn');
      return [];
    }
    log(`[자동콜매도] 조건1 충족: 내행사가 ${myActprice} - 현물가 ${spotPrice} = ${myActprice - spotPrice} > ${gapThreshold}`, 'info');
 
    let board: any[] = [];
    if (market === 'KOSDAQ150') {
      const codes = await fetchKQ150WeeklyCodes(token);
      const week = weeklyKey.slice(0, 2);
      const day = weeklyKey.slice(2) as 'MON' | 'THU';
      const filtered = codes.filter((c: any) => c.week === week && c.weekDay === day);
      const result = await fetchKQ150OptionBoard(token, filtered);
      board = result.board;
    } else {
      const result = await fetchKP200WeeklyBoard(token, weeklyKey);
      board = result.board;
    }
 
    if (board.length === 0) { log(`[자동콜매도] board 데이터 없음`, 'warn'); return []; }
 
    const spreadLimit = market === 'KOSPI200' ? 0.2 : 1.3;
 
    // ATM 바로 위 OTM부터 오름차순 (행사가 > 현물가, callCode 사용)
    const otmCandidates = board
      .filter((item: any) => item.actprice > spotPrice && item.callCode)
      .sort((a: any, b: any) => a.actprice - b.actprice);
 
    if (otmCandidates.length === 0) { log(`[자동콜매도] OTM 후보 없음`, 'warn'); return []; }
 
    const results: { putCode: string; bidPrice: number; actprice: number }[] = [];
 
    for (const item of otmCandidates) {
      if (results.length >= qty) break;
      log(`[자동콜매도] 행사가 ${item.actprice} 호가 조회 중...`, 'info');
      try {
        const hogaRes = await fetch(`${BASE_URL}/futureoption/market-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't2112',
            'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t2112InBlock: { focode: item.callCode } }),
        });
        const hogaData = await hogaRes.json();
        const bid1 = Number(hogaData?.t2112OutBlock?.bidho1 ?? 0);
        const ask1 = Number(hogaData?.t2112OutBlock?.offerho1 ?? 0);
        if (bid1 <= 0 || ask1 <= 0) { log(`[자동콜매도] 행사가 ${item.actprice} 호가 없음 → 다음으로`, 'warn'); continue; }
        const spread = ask1 - bid1;
        log(`[자동콜매도] 행사가 ${item.actprice} 매수1: ${bid1} 매도1: ${ask1} 스프레드: ${spread.toFixed(2)} (기준: ${spreadLimit})`, 'info');
        if (bid1 <= priceThreshold) { log(`[자동콜매도] 행사가 ${item.actprice} 매수호가 ${bid1} ≤ ${priceThreshold} → 다음으로`, 'warn'); continue; }
        if (spread > spreadLimit) { log(`[자동콜매도] 행사가 ${item.actprice} 스프레드 ${spread.toFixed(2)} > ${spreadLimit} → 다음으로`, 'warn'); continue; }
        log(`[자동콜매도] ✅ 행사가 ${item.actprice} 조건 충족! 매수호가 ${bid1}로 매도`, 'success');
        results.push({ putCode: item.callCode, bidPrice: bid1, actprice: item.actprice });
      } catch (e: any) {
        log(`[자동콜매도] 행사가 ${item.actprice} 호가 조회 오류: ${e?.message}`, 'error');
      }
    }
    return results;
  } catch (e: any) {
    log(`[자동콜매도] OTM 종목 조회 실패: ${e?.message}`, 'error');
    return [];
  }
}
 
// ════════════════════════════════════════
// ── 메인 사이클 함수들 ──────────────────
// ════════════════════════════════════════
 
// ─── 풋매도 메인 사이클 (10초마다 호출) ─────────────────────
export async function runAutoTradingCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const activeEntries = store.getCurrentEntries().filter((e) => e.status === 'monitoring');
 
  if (activeEntries.length > 0) {
    log(
      `[풋매도 선물 자동매수 모니터링] ${activeEntries.map(e =>
        `${e.putCode}(행사가${e.actprice}${e.emaEnabled ? '/AI' : ''})`
      ).join(', ')}`,
      'info'
    );
  }
 
  // ─── 풋매도 closing 상태 체결 확인 ──────────────────────────
  const closingEntries = store.getCurrentEntries().filter(e => e.status === 'closing');
  for (const entry of closingEntries) {
    try {
      const orders = await fetchFuturesOrders(token, '1');
      const matched = orders.find((o: any) => o.expcode === entry.putCode && o.cheqty > 0);
      if (matched) {
        store.setEntryStatus(entry.putCode, 'closed');
        log(`[청산체결확인] ${entry.putCode} 체결완료`, 'success');
      }
    } catch {}
  }
 
  // ① 옵션 현재가 업데이트 + 청산 예약가 체크
  for (const entry of activeEntries) {
    const currentPrice = await fetchOptionPrice(token, entry.putCode);
    if (currentPrice > 0) {
      store.updateCurrentPrice(entry.putCode, currentPrice);
    }
 
    // 청산 예약가 체크 (closingPrice: 0이면 비활성화)
    if (entry.closingPrice > 0 && currentPrice > 0 && currentPrice <= entry.closingPrice) {
      log(`[청산예약] ${entry.putCode} 현재가 ${currentPrice} ≤ ${entry.closingPrice}`, 'warn');
      await closeOption(token, entry, `가격 ${currentPrice} ≤ ${entry.closingPrice}`);
    }
  }
 
  // ② 15:10~15:20 베이시스 실시간 수집 (30초마다)
  // t2111(선물가) + t1511(현물가) 직접 조회
  if (now >= 1510 && now < 1520) {
    const nowMs = Date.now();
    if (nowMs - lastBasisCollectMs >= 30_000) {
      lastBasisCollectMs = nowMs;
      const hedgeEntries = store.getCurrentEntries().filter(
        (e) => e.status === 'monitoring' && e.hedgeQty > 0
      );
      for (const entry of hedgeEntries) {
        // 만기일 체크: jandatecnt < 1 인 종목만 베이시스 수집
        if (entry.jandatecnt > 1) {
          log(`[베이시스] ${entry.putCode} 만기일 아님(잔여${entry.jandatecnt}일) → 스킵`, 'info');
          continue;
        }
        await collectBasisSample(token, entry);
      }
    }
  }
 
  // ③ 15:20~15:29 평균Basis 모니터링 Basis : (선물가 - 현물가)
  if (now >= 1520 && now < 1530 && !store.futures1530Done) {
    const nowMs = Date.now();
    if (nowMs - lastMonitorCheckMs >= 30_000) {
      lastMonitorCheckMs = nowMs;
      const hedgeEntries = store.getCurrentEntries().filter(
        (e) => (e.status === 'monitoring' || e.status === 'closed') && e.hedgeQty > 0
      );
      for (const entry of hedgeEntries) {
        // 만기일 체크
        if (entry.jandatecnt > 1) continue;
 
        // 버퍼에서 평균 베이시스 계산
        const averageBasis = calcAverageBasis(entry.putCode);
        if (averageBasis === 0) { log(`[선물매수] 베이시스 없음 → 스킵`, 'warn'); continue; }
 
        const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't2111', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t2111InBlock: { focode: entry.futuresCode } }),
        });
        const data = await res.json();
        const price = Number(data?.t2111OutBlock?.price ?? 0);
        if (price <= 0) continue;
 
        const avgSpotPrice = parseFloat((price - averageBasis).toFixed(2));
        log(`[선물매수 모니터링] 선물가: ${price} 평균Basis: ${averageBasis} 평균현물가: ${avgSpotPrice} vs 행사가: ${entry.actprice}`, 'info');
      }
    }
  }
 
  // ④ 15:30~15:35 조건 확정 → 선물 자동매수 주문
  if (now >= 1530 && now <= 1535 && !store.futures1530Done) {
    const hedgeEntries = store.getCurrentEntries().filter(
      (e) => e.status === 'monitoring' || e.status === 'closed'
    );
    for (const entry of hedgeEntries) {
      if (entry.hedgeQty <= 0) { log(`[선물매수] hedgeQty 0 → 비활성화`, 'info'); continue; }
 
      // 만기일 체크: jandatecnt < 1 인 종목만 선물 매수
      if (entry.jandatecnt > 1) {
        log(`[선물매수] ${entry.putCode} 만기일 아님(잔여${entry.jandatecnt}일) → 스킵`, 'warn');
        continue;
      }
 
      // 버퍼에서 평균 베이시스 계산
      const averageBasis = calcAverageBasis(entry.putCode);
      if (averageBasis === 0) { log(`[선물매수] 베이시스 없음 → 주문 불가`, 'error'); continue; }
 
      const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't2111', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t2111InBlock: { focode: entry.futuresCode } }),
      });
      const data = await res.json();
      const price = Number(data?.t2111OutBlock?.price ?? 0);
      if (price <= 0) { log(`[선물매수] 선물가 조회 실패`, 'error'); continue; }
 
      // 평균현물가 = 선물가(price) - 평균 Basis
      const avgSpotPrice = parseFloat((price - averageBasis).toFixed(2));
      log(`[선물매수 15:30] 선물가:${price} 평균Basis:${averageBasis} 평균현물가:${avgSpotPrice} vs 행사가:${entry.actprice}`, 'info');
 
      if (avgSpotPrice < entry.actprice) {
        const hogaData = await fetchFuturesHogaData(token, entry.futuresCode);
        if (!hogaData) { log(`[선물매수] 호가 조회 실패`, 'error'); continue; }
 
        // offerho1 그대로 주문
        const offerho1 = hogaData.asks[hogaData.asks.length - 1]?.price ?? 0;
        if (offerho1 <= 0) { log(`[선물매수] offerho1 조회 실패`, 'error'); continue; }
 
        log(`[선물매수 진입] 평균현물가 ${avgSpotPrice} < 행사가 ${entry.actprice} → offerho1: ${offerho1} 매수`, 'warn');
        await buyFuturesHedge(token, entry, offerho1);
      } else {
        log(`[선물매수 불필요] 평균현물가 ${avgSpotPrice} ≥ 행사가 ${entry.actprice}`, 'success');
      }
    }
    store.setFutures1530Done(true);
  }
 
  // ⑤ 15:45 종료
  if (now >= 1545 && !store.futures1545Done) {
    store.setFutures1545Done(true);
    log('[15:45] 오늘의 자동매매 종료. 선물 포지션을 확인해주세요.', 'info');
 
    // 만기일 당일 항목만 삭제, 나머지 유지
    store.resetDaily();
 
    // 베이시스 버퍼 초기화
    basisBuffer = {};
    lastBasisCollectMs = 0;
    lastCallBasisCollectMs = 0;
 
    // 남은 항목이 있으면 자동매매 유지, 없으면 중지
    const remaining = store.getCurrentEntries().length + store.getCurrentCallEntries().length;
    if (remaining > 0) {
      log(`[정리] 만기일 항목 삭제 완료. 남은 자동화 ${remaining}건 유지`, 'success');
    } else {
      store.setRunning(false);
      log('[정리] 모든 자동화 항목 종료', 'success');
    }
  }
}
 
// ─── 자동 풋/콜 매도 사이클 ─────────────────────────────────
export async function runAutoSellCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const configs = store.getAutoSellConfigs();
  if (configs.length === 0) return;
 
  for (const config of configs) {
    if (config.sold) continue;
 
    const sellTimeNum = Number(config.sellTime.replace(':', ''));
    if (now < sellTimeNum || now >= 1530) continue;
    if (config.checked) continue;
 
    store.setAutoSellChecked(config.nextWeeklyKey, config.acntNo);
 
    const typeLabel = config.isCall ? '자동콜매도' : '자동풋매도';
    log(`[${typeLabel}] ${config.sellTime} 도달 → ${config.nextWeeklyLabel} 조건 확인`, 'info');
 
    const spotPrice = await fetchSpotForAutoSell(token, config.market);
    if (spotPrice <= 0) {
      log(`[${typeLabel}] 현물가 조회 실패 → 재시도 대기`, 'warn');
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    log(`[${typeLabel}] 현물가: ${spotPrice.toFixed(2)} 내행사가: ${config.actprice} 기준차이: ${config.gapThreshold}`, 'info');
 
    const candidates = config.isCall
      ? await findOTMCallCandidates(
          token, config.market, config.nextWeeklyKey,
          spotPrice, config.actprice, config.gapThreshold,
          config.priceThreshold, config.qty ?? 1
        )
      : await findOTMPutCandidates(
          token, config.market, config.nextWeeklyKey,
          spotPrice, config.actprice, config.gapThreshold,
          config.priceThreshold, config.qty ?? 1
        );
 
    if (candidates.length === 0) {
      log(`[${typeLabel}] 조건 충족 종목 없음 → 재시도 대기`, 'warn');
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    let successCount = 0;
    for (const candidate of candidates) {
      const result = await placeFuturesOrder(token, {
        fnoIsuNo: candidate.putCode,
        bnsTpCode: '1',
        orderType: '00',
        price: candidate.bidPrice,
        qty: 1,
        trdPtnCode: '00',
      });
      if (result.success) {
        successCount++;
        log(`[${typeLabel} 완료] ${candidate.putCode} 행사가${candidate.actprice} @ ${candidate.bidPrice} (주문번호: ${result.ordNo}) ${successCount}/${candidates.length}`, 'success');
      } else {
        log(`[${typeLabel} 실패] ${candidate.putCode}: ${result.message}`, 'error');
        store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      }
    }
 
    if (successCount > 0) {
      store.setAutoSellSold(config.nextWeeklyKey, config.acntNo, `${successCount}계약 완료`);
    }
  }
}
 
// ─── AI 매도 사이클 (EMA 전략) ──────────────────────────────
export async function runEmaAutoSellCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1530) return;
 
  const emaEntries = store.getCurrentEntries().filter(
    (e) => e.status === 'monitoring' && e.emaEnabled === true
  );
  if (emaEntries.length === 0) return;
 
  log(`[AI매도 모니터링] ${emaEntries.map(e => e.putCode).join(', ')} EMA 신호 체크 중`, 'info');
 
  for (const entry of emaEntries) {
    try {
      const res = await fetch(`${BASE_URL}/futureoption/chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't8465',
          'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({
          t8465InBlock: {
            shcode: entry.putCode, ncnt: 1, qrycnt: 200, nday: '0',
            sdate: ' ', stime: '', edate: '99999999', etime: '',
            cts_date: ' ', cts_time: '', comp_yn: 'N',
          },
        }),
      });
      const data = await res.json();
      const candles = data?.t8465OutBlock1;
      if (!candles || candles.length === 0) { log(`[EMA매도] ${entry.putCode} 분봉 데이터 없음`, 'warn'); continue; }
 
      const aiBot = new AiBot(candles);
      const signal = aiBot.evaluateEmaStrategy();
      log(`[EMA매도] ${entry.putCode} 신호: ${signal} (최근가: ${aiBot.latestClosePrice})`, 'info');
 
      if (signal === 'Sell') {
        const orderPrice = aiBot.latestClosePrice;
        const result = await placeFuturesOrder(token, {
          fnoIsuNo: entry.putCode, bnsTpCode: '1', orderType: '00',
          price: orderPrice, qty: 1, trdPtnCode: '00',
        });
        if (result.success) {
          log(`[EMA매도 완료] ${entry.putCode} @ ${orderPrice} (주문번호: ${result.ordNo})`, 'success');
          store.updateEntry(entry.putCode, { emaEnabled: false });
          store.setFutures1530Done(false);
        } else {
          log(`[EMA매도 실패] ${entry.putCode}: ${result.message}`, 'error');
        }
      }
    } catch (e: any) {
      log(`[EMA매도 오류] ${entry.putCode}: ${e?.message}`, 'error');
    }
  }
}
 
// ─── 콜매도 자동화 사이클 ────────────────────────────────────
// ① 자동 청산: 현재가 <= 지정 청산가 (closingPrice: 0이면 비활성화)
// ② 15:10~15:20 베이시스 수집 (30초마다, 풋매도와 동일 basisBuffer 사용)
// ③ 15:20~15:29 평균현물가 모니터링
// ④ 15:30~15:35 선물 자동매도 (평균현물가 > 행사가, 만기일 당일만)
export async function runCallTradingCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const callEntries = store.getCurrentCallEntries().filter((e) => e.status === 'monitoring');
  if (callEntries.length === 0) return;
 
  log(
    `[콜매도 선물 자동매도 모니터링] ${callEntries.map(e => `${e.callCode}(행사가${e.actprice})`).join(', ')}`,
    'info'
  );
 
  // ─── 콜매도 closing 상태 체결 확인 ──────────────────────────
  const closingCallEntries = store.getCurrentCallEntries().filter(e => e.status === 'closing');
  for (const entry of closingCallEntries) {
    try {
      const orders = await fetchFuturesOrders(token, '1');
      const matched = orders.find((o: any) => o.expcode === entry.callCode && o.cheqty > 0);
      if (matched) {
        store.setCallEntryStatus(entry.callCode, 'closed');
        log(`[콜청산체결확인] ${entry.callCode} 체결완료`, 'success');
      }
    } catch {}
  }
 
  // ① 현재가 업데이트 + 청산 체크
  for (const entry of callEntries) {
    const currentPrice = await fetchOptionPrice(token, entry.callCode);
    if (currentPrice > 0) {
      store.updateCallCurrentPrice(entry.callCode, currentPrice);
    }
 
    // 청산 예약가 체크 (closingPrice: 0이면 비활성화)
    if (entry.closingPrice > 0 && currentPrice > 0 && currentPrice <= entry.closingPrice) {
      log(`[콜청산예약] ${entry.callCode} 현재가 ${currentPrice} ≤ ${entry.closingPrice}`, 'warn');
      try {
        const result = await placeFuturesOrder(token, {
          fnoIsuNo: entry.callCode,
          bnsTpCode: '2',           // 매수 (콜매도 청산)
          orderType: '00',
          price: entry.closingPrice,
          qty: 1,
          trdPtnCode: '00',
        });
        if (result.success) {
          log(`[콜청산주문접수] ${entry.callCode} @ ${entry.closingPrice} 주문번호: ${result.ordNo}`, 'success');
          store.setCallEntryStatus(entry.callCode, 'closing');
        } else {
          log(`[콜청산실패] ${entry.callCode}: ${result.message}`, 'error');
        }
      } catch (e: any) {
        log(`[콜청산오류] ${entry.callCode}: ${e?.message}`, 'error');
      }
    }
  }
 
  // ② 15:10~15:20 베이시스 수집 (30초마다)
  // 풋매도와 동일한 basisBuffer 사용 (callCode 키로 저장)
  if (now >= 1510 && now < 1520) {
    const nowMs = Date.now();
    if (nowMs - lastCallBasisCollectMs >= 30_000) {
      lastCallBasisCollectMs = nowMs;
      const hedgeCallEntries = callEntries.filter(e => e.hedgeQty > 0);
      for (const entry of hedgeCallEntries) {
        // 만기일 체크: jandatecnt < 1 인 종목만 베이시스 수집
        if (entry.jandatecnt > 1) {
          log(`[콜베이시스] ${entry.callCode} 만기일 아님(잔여${entry.jandatecnt}일) → 스킵`, 'info');
          continue;
        }
        // collectBasisSample은 putCode 기반이므로 callCode로 직접 수집
        try {
          const [futuresPrice, spotPrice] = await Promise.all([
            fetchFuturesPrice(token, entry.futuresCode),
            fetchSpotPrice(token, entry.market),
          ]);
          if (futuresPrice <= 0 || spotPrice <= 0) continue;
          const basis = parseFloat((futuresPrice - spotPrice).toFixed(2));
          if (!basisBuffer[entry.callCode]) basisBuffer[entry.callCode] = [];
          basisBuffer[entry.callCode].push(basis);
          if (basisBuffer[entry.callCode].length > 10) basisBuffer[entry.callCode].shift();
          log(`[콜베이시스 수집] ${entry.market} 선물:${futuresPrice} 현물:${spotPrice} Basis:${basis} (${basisBuffer[entry.callCode].length}개)`, 'info');
        } catch (e: any) {
          log(`[콜베이시스 수집 오류] ${e?.message}`, 'error');
        }
      }
    }
  }
 
  // ③ 15:20~15:29 평균Basis 모니터링 Basis : (선물가 - 현물가)
  if (now >= 1520 && now < 1530 && !store.futures1530Done) {
    const nowMs = Date.now();
    if (nowMs - lastMonitorCheckMs >= 30_000) {
      const hedgeCallEntries = callEntries.filter(
        e => (e.status === 'monitoring' || e.status === 'closed') && e.hedgeQty > 0
      );
      for (const entry of hedgeCallEntries) {
        if (entry.jandatecnt > 1) continue;
        const averageBasis = calcAverageBasis(entry.callCode);
        if (averageBasis === 0) { log(`[콜선물매도] 베이시스 없음 → 스킵`, 'warn'); continue; }
        const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't2111', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t2111InBlock: { focode: entry.futuresCode } }),
        });
        const data = await res.json();
        const price = Number(data?.t2111OutBlock?.price ?? 0);
        if (price <= 0) continue;
        const avgSpotPrice = parseFloat((price - averageBasis).toFixed(2));
        log(`[콜선물매도 모니터링] 선물가:${price} 평균Basis:${averageBasis} 평균현물가:${avgSpotPrice} vs 행사가:${entry.actprice}`, 'info');
      }
    }
  }
 
  // ④ 15:30~15:35 선물 자동매도 주문
  // 조건: 평균현물가 > 행사가 → 선물 매도
  if (now >= 1530 && now <= 1535 && !store.futures1530Done) {
    const hedgeCallEntries = callEntries.filter(
      e => e.status === 'monitoring' || e.status === 'closed'
    );
    for (const entry of hedgeCallEntries) {
      if (entry.hedgeQty <= 0) { log(`[콜선물매도] hedgeQty 0 → 비활성화`, 'info'); continue; }
 
      // 만기일 체크: jandatecnt < 1 인 종목만 선물 매도
      if (entry.jandatecnt > 1) {
        log(`[콜선물매도] ${entry.callCode} 만기일 아님(잔여${entry.jandatecnt}일) → 스킵`, 'warn');
        continue;
      }
 
      const averageBasis = calcAverageBasis(entry.callCode);
      if (averageBasis === 0) { log(`[콜선물매도] 베이시스 없음 → 주문 불가`, 'error'); continue; }
 
      const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't2111', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t2111InBlock: { focode: entry.futuresCode } }),
      });
      const data = await res.json();
      const price = Number(data?.t2111OutBlock?.price ?? 0);
      if (price <= 0) { log(`[콜선물매도] 선물가 조회 실패`, 'error'); continue; }
 
      // 평균현물가 = 선물가(price) - 평균 Basis
      const avgSpotPrice = parseFloat((price - averageBasis).toFixed(2));
      log(`[콜선물매도 15:30] 선물가:${price} 평균Basis:${averageBasis} 평균현물가:${avgSpotPrice} vs 행사가:${entry.actprice}`, 'info');
 
      // 평균현물가 > 행사가 → 선물 매도
      if (avgSpotPrice > entry.actprice) {
        const hogaData = await fetchFuturesHogaData(token, entry.futuresCode);
        if (!hogaData) { log(`[콜선물매도] 호가 조회 실패`, 'error'); continue; }
 
        // bidho1 그대로 주문
        const bidho1 = hogaData.bids[0]?.price ?? 0;
        if (bidho1 <= 0) { log(`[콜선물매도] bidho1 조회 실패`, 'error'); continue; }
 
        log(`[콜선물매도 진입] 평균현물가 ${avgSpotPrice} > 행사가 ${entry.actprice} → bidho1: ${bidho1} 매도`, 'warn');
        const result = await placeFuturesOrder(token, {
          fnoIsuNo: entry.futuresCode,
          bnsTpCode: '1',  // 매도
          orderType: '00',
          price: bidho1,
          qty: entry.hedgeQty,
          trdPtnCode: '00',
        });
        if (result.success) {
          log(`[콜선물매도 완료] ${entry.futuresCode} ${entry.hedgeQty}계약 @ ${bidho1} 주문번호: ${result.ordNo}`, 'success');
          store.setCallEntryStatus(entry.callCode, 'hedged');
        } else {
          log(`[콜선물매도 실패] ${result.message}`, 'error');
        }
      } else {
        log(`[콜선물매도 불필요] 평균현물가 ${avgSpotPrice} ≤ 행사가 ${entry.actprice}`, 'success');
      }
    }
  }
}
 
// ════════════════════════════════════════
// ── 백그라운드 태스크 ────────────────────
// ════════════════════════════════════════
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
 
const tradingTask = async (_taskData?: any): Promise<void> => {
  await BackgroundActions.updateNotification({ taskDesc: '자동매매 모니터링 중...' });
  while (BackgroundActions.isRunning()) {
    await runAutoTradingCycle();
    await runAutoSellCycle();
    await runEmaAutoSellCycle();
    await runCallTradingCycle();
    await sleep(10_000);
  }
};
 
const BG_OPTIONS = {
  taskName: '이삭줍기 자동매매',
  taskTitle: '🌱 이삭줍기',
  taskDesc: '자동매매 모니터링 중',
  taskIcon: { name: 'ic_launcher', type: 'mipmap' as const },
  color: '#1a1a1a',
  linkingURI: 'lunchbox://home',
  parameters: {},
};
 
export async function startAutoTrading(): Promise<void> {
  useAutoTradingStore.getState().setRunning(true);
  log('자동매매 시작', 'success');
  try {
    await BackgroundActions.start(tradingTask, BG_OPTIONS);
  } catch (e: any) {
    log('백그라운드 미지원 → 포그라운드 모드 실행', 'warn');
    const timer = setInterval(async () => {
      if (!useAutoTradingStore.getState().isRunning) { clearInterval(timer); return; }
      await runAutoTradingCycle();
      await runAutoSellCycle();
      await runEmaAutoSellCycle();
      await runCallTradingCycle();
    }, 10_000);
  }
}
 
export async function stopAutoTrading(): Promise<void> {
  useAutoTradingStore.getState().setRunning(false);
  if (BackgroundActions.isRunning()) {
    await BackgroundActions.stop();
  }
  log('자동매매 중지', 'warn');
}