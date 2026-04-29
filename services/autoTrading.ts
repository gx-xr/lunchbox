/**
 * services/autoTrading.ts
 * ✅ 15:30 전량 청산 제거 (거래소 정산)
 * ✅ 현물가 수집 제거
 * ✅ closeOption → 지정가(closingPrice)로 청산
 * ✅ 선물 자동매수 → +0.2p, 15:30~15:35
 * ✅ runAutoSellCycle → 스프레드 체크 + 매수호가로 주문, 초과 시 재시도
 */
 
import BackgroundActions from 'react-native-background-actions';
import { useAutoTradingStore, AutoTradingEntry } from '../store/autoTradingStore';
import { placeFuturesOrder } from './order';
import { fetchFuturesHogaData } from './market';
import { useAuthStore } from '../store/authStore';
import { AiBot } from './aiBot';
 
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
 
function getToken(): string {
  return useAuthStore.getState().token ?? '';
}
 
function log(msg: string, level: 'info' | 'warn' | 'error' | 'success' = 'info') {
  const time = new Date().toLocaleTimeString('ko-KR');
  useAutoTradingStore.getState().addLog({ time, message: msg, level });
  console.log(`[AutoTrading][${level}] ${time} ${msg}`);
}
 
function hhmm(): number {
  const d = new Date();
  return d.getHours() * 100 + d.getMinutes();
}
 
// ── 현재 옵션/선물 가격 조회 (t2101) ────────────────────────
async function fetchOptionPrice(token: string, focode: string): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't2101',
        'tr_cont': 'N',
        'tr_cont_key': '0',
        'mac_address': '',
      },
      body: JSON.stringify({ t2101InBlock: { focode } }),
    });
    const data = await res.json();
    return Number(data?.t2101OutBlock?.price ?? 0);
  } catch {
    return 0;
  }
}
 
// ── 옵션 청산 주문 (지정가 — closingPrice로) ────────────────
async function closeOption(
  token: string,
  entry: AutoTradingEntry,
  reason: string
): Promise<boolean> {
  try {
    const result = await placeFuturesOrder(token, {
      fnoIsuNo: entry.putCode,
      bnsTpCode: '2',       // 매수 (풋매도 포지션 청산)
      orderType: '00',      // ✅ 지정가 고정
      price: entry.closingPrice,  // ✅ 청산 예약가로 지정가 주문
      qty: 1,
      trdPtnCode: '00',
    });
    if (result.success) {
      log(`[청산완료] ${entry.putCode} 행사가${entry.actprice} @ ${entry.closingPrice} (${reason}) 주문번호: ${result.ordNo}`, 'success');
      useAutoTradingStore.getState().setEntryStatus(entry.putCode, 'closed');
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
 
// ── 선물 자동 매수 (헤지) ────────────────────────────────────
// ✅ 15:30~15:35 범위, 현재가 +0.2p 지정가
async function buyFuturesHedge(
  token: string,
  entry: AutoTradingEntry
): Promise<void> {
  try {
    const futPrice = await fetchOptionPrice(token, entry.futuresCode);
    if (futPrice <= 0) {
      log(`[헤지오류] ${entry.futuresCode} 현재가 조회 실패`, 'error');
      return;
    }
 
    const orderPrice = parseFloat((futPrice + 0.2).toFixed(2)); // ✅ +0.2p
 
    const result = await placeFuturesOrder(token, {
      fnoIsuNo: entry.futuresCode,
      bnsTpCode: '2',     // 매수
      orderType: '00',    // 지정가
      price: orderPrice,
      qty: entry.hedgeQty,
      trdPtnCode: '00',
    });
 
    if (result.success) {
      log(
        `[헤지완료] ${entry.futuresCode} ${entry.hedgeQty}계약 @ ${orderPrice}` +
        ` | 선물지수 < 행사가 ${entry.actprice} 주문번호: ${result.ordNo}`,
        'success'
      );
      useAutoTradingStore.getState().setEntryStatus(entry.putCode, 'hedged');
    } else {
      log(`[헤지실패] ${entry.futuresCode}: ${result.message}`, 'error');
    }
  } catch (e: any) {
    log(`[헤지오류] ${e?.message}`, 'error');
  }
}
 
// ── 현물가 단일 조회 ─────────────────────────────────────────
// KOSPI200: t2111 → kospijisu 필드
// KOSDAQ150: t1511 → pricejisu 필드 (코스닥150 현물지수)
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
          'tr_cont': 'N',
          'tr_cont_key': '0',
          'mac_address': '',
        },
        body: JSON.stringify({ t2111InBlock: { focode: 'A0166000' } }),
      });
      const data = await res.json();
      console.log(`[fetchSpotPrice] KOSPI200 kospijisu:`, data?.t2111OutBlock?.kospijisu);
      return Number(data?.t2111OutBlock?.kospijisu ?? 0);
    } else {
      // ✅ t1511: 코스닥150 현물지수 (upcode: '405')
      const res = await fetch(`${BASE_URL}/indtp/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't1511',
          'tr_cont': 'N',
          'tr_cont_key': '0',
          'mac_address': '',
        },
        body: JSON.stringify({ t1511InBlock: { upcode: '405' } }),
      });
      const data = await res.json();
      console.log(`[fetchSpotPrice] KOSDAQ150 pricejisu:`, data?.t1511OutBlock?.pricejisu);
      return Number(data?.t1511OutBlock?.pricejisu ?? 0);
    }
  } catch (e: any) {
    log(`[현물가조회오류] ${market}: ${e?.message}`, 'error');
    return 0;
  }
}
 
// ── 메인 사이클 (10초마다 호출) ─────────────────────────────
export async function runAutoTradingCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
 
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const activeEntries = store.getCurrentEntries().filter((e) => e.status === 'monitoring');
 
  // ✅ 등록된 종목 로그 (매 사이클마다)
  if (activeEntries.length > 0) {
    log(
      `[모니터링] ${activeEntries.map(e =>
        `${e.putCode}(행사가${e.actprice}${e.emaEnabled ? '/AI' : ''})`
      ).join(', ')}`,
      'info'
    );
  }
 
  // ① 옵션 현재가 업데이트 + 청산 예약가 체크
  for (const entry of activeEntries) {
    const currentPrice = await fetchOptionPrice(token, entry.putCode);
    if (currentPrice > 0) {
      store.updateCurrentPrice(entry.putCode, currentPrice);
    }
 
    // 현재가 <= 청산 예약가 → 지정가 청산
    if (currentPrice > 0 && currentPrice <= entry.closingPrice) {
      log(
        `[청산예약] ${entry.putCode} 현재가 ${currentPrice} ≤ ${entry.closingPrice}`,
        'warn'
      );
      await closeOption(token, entry, `가격 ${currentPrice} ≤ ${entry.closingPrice}`);
    }
  }
 
  // ② 15:30~15:35 선물 자동 매수 체크
  // ✅ 조건: 잔여일 = 오늘 만기 + 선물지수 - 행사가 < 0
  if (now >= 1530 && now <= 1535 && !store.futures1530Done) {
    const hedgeEntries = store.getCurrentEntries().filter(
      (e) => e.status === 'monitoring' || e.status === 'closed'
    );
 
    for (const entry of hedgeEntries) {
      const spotPrice = await fetchSpotPrice(token, entry.market);
      if (spotPrice <= 0) {
        log(`[선물매수] ${entry.market} 현물가 조회 실패`, 'error');
        continue;
      }
 
      log(
        `[선물매수 체크] 현물가 ${spotPrice.toFixed(2)} vs 행사가 ${entry.actprice}`,
        'info'
      );
 
      // 선물지수 < 행사가 → 헤지 매수
      if (spotPrice < entry.actprice) {
        log(
          `[선물매수 진입] 현물가 ${spotPrice.toFixed(2)} < 행사가 ${entry.actprice}`,
          'warn'
        );
        await buyFuturesHedge(token, entry);
      } else {
        log(
          `[선물매수 불필요] 현물가 ${spotPrice.toFixed(2)} ≥ 행사가 ${entry.actprice}`,
          'success'
        );
      }
    }
 
    store.setFutures1530Done(true);
  }
 
  // ③ 15:45 종료
  if (now >= 1545 && !store.futures1545Done) {
    store.setFutures1545Done(true);
    log('[15:45] 오늘 자동매매 종료. 선물 포지션을 확인해주세요.', 'info');
    store.setRunning(false);
    store.resetDaily();
    log('[정리] 자동화 항목 초기화 완료', 'success');
  }
}
 
// ── 호가 조회 + 스프레드 체크 ────────────────────────────────
// ✅ Get_런치박스_Aibot_매도호가_체크 참고
// 매도호가1 - 매수호가1 <= 2(KQ150) or 0.2(KS200) → 매수호가1로 주문
// 초과 시 → null 반환 (다음 폴링에서 재시도)
async function fetchBidHogaForAutoSell(
  token: string,
  putCode: string,
  market: 'KOSPI200' | 'KOSDAQ150'
): Promise<number | null> {
  try {
    const data = await fetchFuturesHogaData(token, putCode);
    if (!data) return null;
 
    const ask1 = data.asks[data.asks.length - 1]?.price ?? 0; // 매도 1호가 (가장 낮은 매도호가)
    const bid1 = data.bids[0]?.price ?? 0;                    // 매수 1호가 (가장 높은 매수호가)
 
    if (ask1 <= 0 || bid1 <= 0) return null;
 
    const spread = ask1 - bid1;
    const spreadLimit = market === 'KOSPI200' ? 0.2 : 2;
 
    log(
      `[호가체크] ${putCode} 매도1: ${ask1} 매수1: ${bid1} 스프레드: ${spread.toFixed(2)} (기준: ${spreadLimit})`,
      'info'
    );
 
    if (spread <= spreadLimit) {
      return bid1; // ✅ 매수호가로 풋매도 주문
    } else {
      log(`[스프레드초과] ${putCode} spread ${spread.toFixed(2)} > ${spreadLimit} → 재시도 대기`, 'warn');
      return null; // 다음 폴링에서 재시도
    }
  } catch (e: any) {
    log(`[호가조회오류] ${putCode}: ${e?.message}`, 'error');
    return null;
  }
}
 
// ── OTM 풋옵션 후보 조회 ─────────────────────────────────────
async function findOTMPutCode(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150',
  weeklyKey: string,
  spotPrice: number,
  gapThreshold: number,
  priceThreshold: number,
): Promise<{ putCode: string; putPrice: number; actprice: number } | null> {
  try {
    const { fetchKQ150WeeklyCodes, fetchKQ150OptionBoard, fetchKP200WeeklyBoard } = require('../services/options');
 
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
 
    if (board.length === 0) return null;
 
    // 조건:
    // 1. 현물가 - 행사가 > gapThreshold
    // 2. 옵션현재가 >= priceThreshold
    // → 행사가 오름차순 → 첫 번째 선택 (가장 낮은 행사가)
    const candidates = board
      .filter((item: any) =>
        (spotPrice - item.actprice) > gapThreshold &&
        item.putPrice >= priceThreshold &&
        item.putCode &&
        item.putPrice > 0
      )
      .sort((a: any, b: any) => a.actprice - b.actprice);
 
    if (candidates.length === 0) return null;
 
    return {
      putCode: candidates[0].putCode,
      putPrice: candidates[0].putPrice,
      actprice: candidates[0].actprice,
    };
  } catch (e: any) {
    log(`[자동풋매도] OTM 종목 조회 실패: ${e?.message}`, 'error');
    return null;
  }
}
 
// ── 현물가 조회 (자동풋매도용) ───────────────────────────────
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
 
// ── 자동 풋매도 사이클 ───────────────────────────────────────
// ✅ 스프레드 체크 + 매수호가로 주문
// ✅ 스프레드 초과 시 checked 리셋 → 다음 폴링 재시도
export async function runAutoSellCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const configs = store.getAutoSellConfigs();
  if (configs.length === 0) return;
 
  for (const config of configs) {
    if (config.sold) continue;   // 이미 매도 완료
 
    // sellTime ~ 15:30 범위에서만 실행
    const sellTimeNum = Number(config.sellTime);
    if (now < sellTimeNum || now >= 1530) continue;
 
    // checked 상태면 스킵 (스프레드 초과로 재시도 중인 경우 제외)
    if (config.checked) continue;
 
    // 체크 완료 표시
    store.setAutoSellChecked(config.nextWeeklyKey, config.acntNo);
 
    log(`[자동풋매도] ${config.sellTime} 도달 → ${config.nextWeeklyLabel} 조건 확인`, 'info');
 
    // 현물가 조회
    const spotPrice = await fetchSpotForAutoSell(token, config.market);
    if (spotPrice <= 0) {
      log(`[자동풋매도] 현물가 조회 실패 → 재시도 대기`, 'warn');
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    log(`[자동풋매도] 현물가: ${spotPrice.toFixed(2)}, 기준차이: ${config.gapThreshold}`, 'info');
 
    // OTM 풋옵션 후보 조회
    const target = await findOTMPutCode(
      token, config.market, config.nextWeeklyKey,
      spotPrice, config.gapThreshold, config.priceThreshold
    );
 
    if (!target) {
      log(
        `[자동풋매도] 조건 충족 종목 없음 (현물가 - 행사가 < ${config.gapThreshold} 또는 지정호가 미달)`,
        'warn'
      );
      // 조건 미충족 → checked 리셋해서 다음 폴링에서 재확인
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    log(
      `[자동풋매도] 후보 선택! ${target.putCode} 행사가 ${target.actprice} @ ${target.putPrice}`,
      'success'
    );
 
    // ✅ 호가 조회 + 스프레드 체크
    const bidPrice = await fetchBidHogaForAutoSell(token, target.putCode, config.market);
 
    if (bidPrice === null) {
      // 스프레드 초과 → checked 리셋 → 다음 폴링(10초 후) 재시도
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      log(`[자동풋매도] 스프레드 초과 → 10초 후 재시도`, 'warn');
      continue;
    }
 
    // ✅ 매수호가로 지정가 풋매도 주문
    const result = await placeFuturesOrder(token, {
      fnoIsuNo: target.putCode,
      bnsTpCode: '1',   // 매도
      orderType: '00',  // 지정가
      price: bidPrice,  // ✅ 매수호가 그대로
      qty: 1,
      trdPtnCode: '00',
    });
 
    if (result.success) {
      store.setAutoSellSold(config.nextWeeklyKey, config.acntNo, result.ordNo ?? '');
      log(
        `[자동풋매도 완료] ${target.putCode} 행사가${target.actprice} @ ${bidPrice} (주문번호: ${result.ordNo})`,
        'success'
      );
    } else {
      log(`[자동풋매도 실패] ${result.message} → 재시도 대기`, 'error');
      // 주문 실패 → checked 리셋 → 재시도
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
    }
  }
}
 
// ── AI 매도 사이클 (EMA 전략) ────────────────────────────────
// ✅ 동료 Get_Ai_분석Data_조회 + EvaluateEmaStrategy 참고
// t8465 분봉 200개 → EMA 계산 → Sell 신호 → 현재가 지정가 매도
export async function runEmaAutoSellCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1530) return;
 
  // EMA 매도 대상: AiBot 매도가 활성화된 entries
  // (별도 등록 화면에서 emaEnabled: true인 entry만)
  const emaEntries = store.getCurrentEntries().filter(
    (e) => e.status === 'monitoring' && e.emaEnabled === true
  );
  if (emaEntries.length === 0) return;
 
  log(`[AI매도 모니터링] ${emaEntries.map(e => e.putCode).join(', ')} EMA 신호 체크 중`, 'info');
 
  for (const entry of emaEntries) {
    try {
      // t8465 분봉 200개 조회
      const res = await fetch(`${BASE_URL}/futureoption/chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't8465',
          'tr_cont': 'N',
          'tr_cont_key': '0',
          'mac_address': '',
        },
        body: JSON.stringify({
          t8465InBlock: {
            shcode: entry.putCode,
            ncnt: 1,
            qrycnt: 200,
            nday: '0',
            sdate: ' ',
            stime: '',
            edate: '99999999',
            etime: '',
            cts_date: ' ',
            cts_time: '',
            comp_yn: 'N',
          },
        }),
      });
 
      const data = await res.json();
      const candles = data?.t8465OutBlock1;
      if (!candles || candles.length === 0) {
        log(`[EMA매도] ${entry.putCode} 분봉 데이터 없음`, 'warn');
        continue;
      }
 
      const aiBot = new AiBot(candles);
      const signal = aiBot.evaluateEmaStrategy();
 
      log(
        `[EMA매도] ${entry.putCode} 신호: ${signal} (최근가: ${aiBot.latestClosePrice})`,
        'info'
      );
 
      if (signal === 'Sell') {
        const orderPrice = aiBot.latestClosePrice;
 
        const result = await placeFuturesOrder(token, {
          fnoIsuNo: entry.putCode,
          bnsTpCode: '1',   // 매도
          orderType: '00',  // 지정가
          price: orderPrice,
          qty: 1,
          trdPtnCode: '00',
        });
 
        if (result.success) {
          log(
            `[EMA매도 완료] ${entry.putCode} @ ${orderPrice} (주문번호: ${result.ordNo})`,
            'success'
          );
          // 매도 성공 → 선물 자동매수 모드로 전환
          store.updateEntry(entry.putCode, { emaEnabled: false });
          store.setFutures1530Done(false); // 선물매수 재활성화
        } else {
          log(`[EMA매도 실패] ${entry.putCode}: ${result.message}`, 'error');
        }
      }
    } catch (e: any) {
      log(`[EMA매도 오류] ${entry.putCode}: ${e?.message}`, 'error');
    }
  }
}
 
// ── 백그라운드 태스크 ────────────────────────────────────────
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
 
const tradingTask = async (_taskData?: any): Promise<void> => {
  await BackgroundActions.updateNotification({ taskDesc: '자동매매 모니터링 중...' });
  while (BackgroundActions.isRunning()) {
    await runAutoTradingCycle();
    await runAutoSellCycle();
    await runEmaAutoSellCycle();
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
      if (!useAutoTradingStore.getState().isRunning) {
        clearInterval(timer);
        return;
      }
      await runAutoTradingCycle();
      await runAutoSellCycle();
      await runEmaAutoSellCycle();
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