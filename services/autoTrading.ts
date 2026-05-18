/**
 * services/autoTrading.ts
 * ✅ 15:30 전량 청산 제거 (거래소 정산)
 * ✅ 현물가 수집 제거
 * ✅ closeOption → 지정가(closingPrice)로 청산
 * ✅ 선물 자동매수 → +0.2p, 15:30~15:35
 * ✅ runAutoSellCycle → 스프레드 체크 + 매수호가로 주문, 초과 시 재시도
 */
 
import BackgroundActions from 'react-native-background-actions';
import { useAutoTradingStore, AutoTradingEntry, CallTradingEntry } from '../store/autoTradingStore';
import { placeFuturesOrder } from './order';
import { fetchFuturesHogaData } from './market';
import { useAuthStore } from '../store/authStore';
import { AiBot } from './aiBot';
 
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
 
// ✅ 변동성 체크용 이전 yeprice 저장 + 30초 모니터링용 타임스탬프
let prevYepriceMap: Record<string, number> = {};
let lastMonitorCheckMs = 0; // 15:20~15:29 구간 30초 체크용
 
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
// ✅ 15:30 정각: yeprice + 0.2p 지정가 매수
async function buyFuturesHedge(
  token: string,
  entry: AutoTradingEntry,
  orderPrice: number  // ✅ yeprice + 0.2p 를 외부에서 계산해서 전달
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
      log(
        `[헤지완료] ${entry.futuresCode} ${entry.hedgeQty}계약 @ ${orderPrice} 주문번호: ${result.ordNo}`,
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
 
// ── 평균 베이시스 계산 (15:00~15:19 분봉 10개) ──────────────
// 선물 분봉(t8465) + 현물 분봉(t8418) 각 시점 갭 평균
// 동시호가(15:20~) 이전 데이터만 사용
async function fetchAverageBasis(
  token: string,
  futuresCode: string,
  market: 'KOSPI200' | 'KOSDAQ150'
): Promise<number> {
  try {
    const spotUpcode = market === 'KOSPI200' ? '101' : '405';
 
    // ① 선물 분봉 (t8465) + 현물 분봉 (t8418) 동시 조회
    const [futRes, spotRes] = await Promise.all([
      fetch(`${BASE_URL}/futureoption/chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't8465',
          'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({
          t8465InBlock: {
            shcode: futuresCode, ncnt: 1, qrycnt: 20, nday: '0',
            sdate: ' ', stime: '', edate: '99999999', etime: '',
            cts_date: ' ', cts_time: '', comp_yn: 'N',
          },
        }),
      }),
      fetch(`${BASE_URL}/indtp/chart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't8418',
          'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({
          t8418InBlock: {
            shcode: spotUpcode, ncnt: 1, qrycnt: 20, nday: '0',
            sdate: ' ', stime: '', edate: '99999999', etime: '',
            cts_date: ' ', cts_time: '', comp_yn: 'N',
          },
        }),
      }),
    ]);
 
    const futData = await futRes.json();
    const spotData = await spotRes.json();
 
    const futCandles: any[] = futData?.t8465OutBlock1 ?? [];
    const spotCandles: any[] = spotData?.t8418OutBlock1 ?? [];
 
    if (futCandles.length === 0 || spotCandles.length === 0) {
      log(`[베이시스] 분봉 데이터 없음 (선물:${futCandles.length} 현물:${spotCandles.length})`, 'warn');
      return 0;
    }
 
    // ② 15:20 이전 데이터만 필터 (동시호가 오염 방지)
    const filterBefore1520 = (candles: any[]) =>
      candles.filter((c: any) => {
        const t = String(c.time ?? '').padStart(6, '0');
        return parseInt(t.slice(0, 4)) < 1520;
      });
 
    const futFiltered = filterBefore1520(futCandles);
    const spotFiltered = filterBefore1520(spotCandles);
 
    if (futFiltered.length === 0 || spotFiltered.length === 0) {
      log(`[베이시스] 15:20 이전 데이터 없음`, 'warn');
      return 0;
    }
 
    // ③ 시간 기준으로 매칭해서 갭 계산 (최근 10개)
    const basisList: number[] = [];
    const target = Math.min(futFiltered.length, spotFiltered.length, 10);
 
    for (let i = 0; i < target; i++) {
      const futClose = Number(futFiltered[i].close ?? 0);
      const spotClose = Number(spotFiltered[i].close ?? 0);
      if (futClose > 0 && spotClose > 0) {
        basisList.push(futClose - spotClose);
      }
    }
 
    if (basisList.length === 0) return 0;
 
    const avgBasis = basisList.reduce((sum, b) => sum + b, 0) / basisList.length;
 
    log(
      `[베이시스] ${market} 평균베이시스: ${avgBasis.toFixed(2)} (${basisList.length}개 분봉 | 선물-현물)`,
      'info'
    );
 
    return parseFloat(avgBasis.toFixed(2));
  } catch (e: any) {
    log(`[베이시스 오류] ${e?.message}`, 'error');
    return 0;
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
 
  // ② 15:00~15:19 베이시스 미리 계산 + 캐시
  if (now >= 1500 && now < 1520) {
    const hedgeEntries = store.getCurrentEntries().filter(
      (e) => e.status === 'monitoring' || e.status === 'closed'
    );
    for (const entry of hedgeEntries) {
      if (entry.averageBasis === 0) {
        const basis = await fetchAverageBasis(token, entry.futuresCode, entry.market);
        if (basis !== 0) {
          store.updateEntryBasis(entry.putCode, basis);
          log(`[베이시스 캐시] ${entry.market} ${basis.toFixed(2)} 저장완료`, 'info');
        }
      }
    }
  }
 
 
  // ③ 15:20~15:29 모니터링 (30초마다 추정현물가 계산, 주문 X)
  if (now >= 1520 && now < 1530 && !store.futures1530Done) {
    const nowMs = Date.now();
    if (nowMs - lastMonitorCheckMs >= 30_000) {
      lastMonitorCheckMs = nowMs;
 
      const hedgeEntries = store.getCurrentEntries().filter(
        (e) => e.status === 'monitoring' || e.status === 'closed'
      );
      for (const entry of hedgeEntries) {
        const averageBasis = entry.averageBasis ?? 0;
        if (averageBasis === 0) {
          log(`[선물매수] 베이시스 없음 → 스킵`, 'warn');
          continue;
        }
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
        const yeprice = Number(data?.t2111OutBlock?.yeprice ?? 0);
        if (yeprice <= 0) continue;
 
        // 변동성 체크 (이전 yeprice 대비 1.0p 이상 급변)
        const prevYeprice = prevYepriceMap[entry.futuresCode] ?? 0;
        if (prevYeprice > 0 && Math.abs(yeprice - prevYeprice) >= 1.0) {
          log(`[변동성경고] ${entry.futuresCode} yeprice 급변 ${prevYeprice} → ${yeprice} → 보류`, 'warn');
          prevYepriceMap[entry.futuresCode] = yeprice;
          continue;
        }
        prevYepriceMap[entry.futuresCode] = yeprice;
 
        const estimatedSpot = parseFloat((yeprice - averageBasis).toFixed(2));
        log(
          `[선물매수 모니터링] yeprice: ${yeprice} 추정현물가: ${estimatedSpot} vs 행사가: ${entry.actprice}`,
          'info'
        );
      }
    }
  }
 
  // ④ 15:30 조건 확정 → 15:30~15:35 호가 기반 주문
  if (now >= 1530 && now <= 1535 && !store.futures1530Done) {
    const hedgeEntries = store.getCurrentEntries().filter(
      (e) => e.status === 'monitoring' || e.status === 'closed'
    );
    for (const entry of hedgeEntries) {
      const averageBasis = entry.averageBasis ?? 0;
      if (averageBasis === 0) {
        log(`[선물매수] 베이시스 없음 → 주문 불가`, 'error');
        continue;
      }
 
      // 추정현물가 계산
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
      const yeprice = Number(data?.t2111OutBlock?.yeprice ?? 0);
      if (yeprice <= 0) {
        log(`[선물매수] yeprice 조회 실패`, 'error');
        continue;
      }
 
      const estimatedSpot = parseFloat((yeprice - averageBasis).toFixed(2));
      log(
        `[선물매수 15:30] 추정현물가: ${estimatedSpot} vs 행사가: ${entry.actprice}`,
        'info'
      );
 
      if (estimatedSpot < entry.actprice) {
        // ✅ 호가 조회 → offerho1 + 0.2p 매수
        const hogaData = await fetchFuturesHogaData(token, entry.futuresCode);
        if (!hogaData) {
          log(`[선물매수] 호가 조회 실패`, 'error');
          continue;
        }
        const offerho1 = hogaData.asks[hogaData.asks.length - 1]?.price ?? 0;
        if (offerho1 <= 0) {
          log(`[선물매수] offerho1 조회 실패`, 'error');
          continue;
        }
        const orderPrice = parseFloat((offerho1 + 0.2).toFixed(2));
        log(`[선물매수 진입] 추정현물가 ${estimatedSpot} < 행사가 ${entry.actprice} → offerho1: ${offerho1} 매수가: ${orderPrice}`, 'warn');
        await buyFuturesHedge(token, entry, orderPrice);
      } else {
        log(`[선물매수 불필요] 추정현물가 ${estimatedSpot} ≥ 행사가 ${entry.actprice}`, 'success');
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
 
 
 
// ── OTM 풋옵션 후보 조회 (새 시나리오) ──────────────────────
// 1. 현물가 - 내 행사가(myActprice) > gapThreshold 체크
// 2. ATM 바로 아래 OTM부터 내림차순으로 순회
// 3. 각 행사가마다 t2112 호가 조회
//    - 매수호가 > priceThreshold
//    - 스프레드 <= 1.3(KQ) or 0.2(KP)
// 4. qty만큼 계약 가능한 행사가 리스트 반환
async function findOTMPutCandidates(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150',
  weeklyKey: string,
  spotPrice: number,
  myActprice: number,    // ✅ 내가 매도한 풋옵션 행사가
  gapThreshold: number,
  priceThreshold: number,
  qty: number,           // ✅ 필요한 계약수
): Promise<{ putCode: string; bidPrice: number; actprice: number }[]> {
  try {
    const { fetchKQ150WeeklyCodes, fetchKQ150OptionBoard, fetchKP200WeeklyBoard } = require('../services/options');
 
    // 조건1: 현물가 - 내 행사가 > gapThreshold
    if (spotPrice - myActprice <= gapThreshold) {
      log(`[자동풋매도] 조건1 미충족: 현물가 ${spotPrice} - 내행사가 ${myActprice} = ${spotPrice - myActprice} ≤ ${gapThreshold}`, 'warn');
      return [];
    }
 
    log(`[자동풋매도] 조건1 충족: ${spotPrice} - ${myActprice} = ${spotPrice - myActprice} > ${gapThreshold}`, 'info');
 
    // 다음 위클리 board 조회
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
 
    if (board.length === 0) {
      log(`[자동풋매도] board 데이터 없음`, 'warn');
      return [];
    }
 
    const spreadLimit = market === 'KOSPI200' ? 0.2 : 1.3; // ✅ KQ: 1.3, KP: 0.2
 
    // ATM 바로 아래 OTM부터 내림차순 정렬
    // ATM = 현물가보다 낮은 행사가 중 가장 높은 것
    const otmCandidates = board
      .filter((item: any) => item.actprice < spotPrice && item.putCode)
      .sort((a: any, b: any) => b.actprice - a.actprice); // ✅ 내림차순 (ATM 가까운 것부터)
 
    if (otmCandidates.length === 0) {
      log(`[자동풋매도] OTM 후보 없음`, 'warn');
      return [];
    }
 
    const results: { putCode: string; bidPrice: number; actprice: number }[] = [];
 
    for (const item of otmCandidates) {
      if (results.length >= qty) break; // 필요한 계약수 채우면 종료
 
      log(`[자동풋매도] 행사가 ${item.actprice} 호가 조회 중...`, 'info');
 
      // t2112로 호가 조회
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
 
        if (bid1 <= 0 || ask1 <= 0) {
          log(`[자동풋매도] 행사가 ${item.actprice} 호가 없음 → 다음으로`, 'warn');
          continue;
        }
 
        const spread = ask1 - bid1;
 
        log(
          `[자동풋매도] 행사가 ${item.actprice} 매수1: ${bid1} 매도1: ${ask1} 스프레드: ${spread.toFixed(2)} (기준: ${spreadLimit})`,
          'info'
        );
 
        // 매수호가 > priceThreshold 체크
        if (bid1 <= priceThreshold) {
          log(`[자동풋매도] 행사가 ${item.actprice} 매수호가 ${bid1} ≤ ${priceThreshold} → 다음으로`, 'warn');
          continue;
        }
 
        // 스프레드 체크
        if (spread > spreadLimit) {
          log(`[자동풋매도] 행사가 ${item.actprice} 스프레드 ${spread.toFixed(2)} > ${spreadLimit} → 다음으로`, 'warn');
          continue;
        }
 
        log(`[자동풋매도] ✅ 행사가 ${item.actprice} 조건 충족! 매수호가 ${bid1}로 매도`, 'success');
        results.push({ putCode: item.putCode, bidPrice: bid1, actprice: item.actprice });
 
      } catch (e: any) {
        log(`[자동풋매도] 행사가 ${item.actprice} 호가 조회 오류: ${e?.message}`, 'error');
        continue;
      }
    }
 
    return results;
  } catch (e: any) {
    log(`[자동풋매도] OTM 종목 조회 실패: ${e?.message}`, 'error');
    return [];
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
export async function runAutoSellCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const configs = store.getAutoSellConfigs();
  console.log('[AutoSellConfigs]', JSON.stringify(configs));
  if (configs.length === 0) return;
 
  for (const config of configs) {
    if (config.sold) continue;
 
    // ✅ sellTime "15:10" → 1510 변환
    const sellTimeNum = Number(config.sellTime.replace(':', ''));
    if (now < sellTimeNum || now >= 1530) continue;
 
    if (config.checked) continue;
 
    store.setAutoSellChecked(config.nextWeeklyKey, config.acntNo);
 
    log(`[자동풋매도] ${config.sellTime} 도달 → ${config.nextWeeklyLabel} 조건 확인`, 'info');
 
    // 현물가 조회 (ATM 찾는 용도)
    const spotPrice = await fetchSpotForAutoSell(token, config.market);
    if (spotPrice <= 0) {
      log(`[자동풋매도] 현물가 조회 실패 → 재시도 대기`, 'warn');
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    log(`[자동풋매도] 현물가: ${spotPrice.toFixed(2)} 내행사가: ${config.actprice} 기준차이: ${config.gapThreshold}`, 'info');
 
    // ✅ OTM 후보 조회 (qty만큼)
    const candidates = await findOTMPutCandidates(
      token, config.market, config.nextWeeklyKey,
      spotPrice, config.actprice, config.gapThreshold,
      config.priceThreshold, config.qty ?? 1
    );
 
    if (candidates.length === 0) {
      log(`[자동풋매도] 조건 충족 종목 없음 → 재시도 대기`, 'warn');
      store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      continue;
    }
 
    // ✅ 찾은 후보들로 주문
    let successCount = 0;
    for (const candidate of candidates) {
      const result = await placeFuturesOrder(token, {
        fnoIsuNo: candidate.putCode,
        bnsTpCode: '1',
        orderType: '00',
        price: candidate.bidPrice,
        qty: 1, // 1계약씩 개별 주문
        trdPtnCode: '00',
      });
 
      if (result.success) {
        successCount++;
        log(
          `[자동풋매도 완료] ${candidate.putCode} 행사가${candidate.actprice} @ ${candidate.bidPrice} (주문번호: ${result.ordNo}) ${successCount}/${candidates.length}`,
          'success'
        );
      } else {
        log(`[자동풋매도 실패] ${candidate.putCode}: ${result.message}`, 'error');
        store.resetAutoSellChecked(config.nextWeeklyKey, config.acntNo);
      }
    }
 
    // 최소 1계약 성공 시 sold 처리
    if (successCount > 0) {
      store.setAutoSellSold(config.nextWeeklyKey, config.acntNo, `${successCount}계약 완료`);
    }
  }
}
 
// ── AI 매도 사이클 (EMA 전략) ────────────────────────────────
// Get_Ai_분석Data_조회 + EvaluateEmaStrategy 참고
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
 
// ── 콜매도 자동화 사이클 ✅ ──────────────────────────────────
// ① 자동 청산: 현재가 <= 지정 청산가 (0.2)
// ② 선물 자동매도: 15:20~15:30 동시호가, 행사가 < 추정현물가
//    매도가: offerho1 - 0.2p
export async function runCallTradingCycle(): Promise<void> {
  const store = useAutoTradingStore.getState();
  const token = getToken();
  if (!store.isRunning || !token) return;
 
  const now = hhmm();
  if (now < 900 || now > 1550) return;
 
  const callEntries = store.getCurrentCallEntries().filter((e) => e.status === 'monitoring');
  if (callEntries.length === 0) return;
 
  log(
    `[콜매도 모니터링] ${callEntries.map(e => `${e.callCode}(행사가${e.actprice})`).join(', ')}`,
    'info'
  );
 
  // ① 옵션 현재가 업데이트 + 청산 체크
  for (const entry of callEntries) {
    const currentPrice = await fetchOptionPrice(token, entry.callCode);
    if (currentPrice > 0) {
      store.updateCallCurrentPrice(entry.callCode, currentPrice);
    }
 
    // 현재가 <= 청산 예약가 → 지정가 청산 (콜매도 청산 = 매수)
    if (currentPrice > 0 && currentPrice <= entry.closingPrice) {
      log(
        `[콜청산예약] ${entry.callCode} 현재가 ${currentPrice} ≤ ${entry.closingPrice}`,
        'warn'
      );
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
          log(`[콜청산완료] ${entry.callCode} @ ${entry.closingPrice} 주문번호: ${result.ordNo}`, 'success');
          store.setCallEntryStatus(entry.callCode, 'closed');
        } else {
          log(`[콜청산실패] ${entry.callCode}: ${result.message}`, 'error');
        }
      } catch (e: any) {
        log(`[콜청산오류] ${entry.callCode}: ${e?.message}`, 'error');
      }
    }
  }
 
  // ① 15:00~15:19 베이시스 미리 계산 (캐시)
  if (now >= 1500 && now < 1520) {
    for (const entry of callEntries) {
      if (entry.averageBasis === 0) {
        const basis = await fetchAverageBasis(token, entry.futuresCode, entry.market);
        if (basis !== 0) {
          store.updateCallBasis(entry.callCode, basis);
          log(`[콜베이시스 캐시] ${entry.market} ${basis.toFixed(2)} 저장완료`, 'info');
        }
      }
    }
  }
 
  // ② 15:20~15:29 모니터링 (30초마다 추정현물가 계산, 주문 X)
  if (now >= 1520 && now < 1530 && !store.futures1530Done) {
    const nowMs = Date.now();
    if (nowMs - lastMonitorCheckMs >= 30_000) {
      for (const entry of callEntries) {
        if (entry.status !== 'monitoring') continue;
 
        const averageBasis = entry.averageBasis ?? 0;
        if (averageBasis === 0) {
          log(`[콜선물매도] 베이시스 없음 → 스킵`, 'warn');
          continue;
        }
 
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
        const yeprice = Number(data?.t2111OutBlock?.yeprice ?? 0);
        if (yeprice <= 0) continue;
 
        // 변동성 체크
        const prevYeprice = prevYepriceMap[entry.futuresCode] ?? 0;
        if (prevYeprice > 0 && Math.abs(yeprice - prevYeprice) >= 1.0) {
          log(`[콜변동성경고] ${entry.futuresCode} yeprice 급변 ${prevYeprice} → ${yeprice} → 보류`, 'warn');
          prevYepriceMap[entry.futuresCode] = yeprice;
          continue;
        }
        prevYepriceMap[entry.futuresCode] = yeprice;
 
        const estimatedSpot = parseFloat((yeprice - averageBasis).toFixed(2));
        log(
          `[콜선물매도 모니터링] yeprice: ${yeprice} 추정현물가: ${estimatedSpot} vs 행사가: ${entry.actprice}`,
          'info'
        );
      }
    }
  }
 
  // ③ 15:30 조건 확정 → 15:30~15:35 호가 기반 주문
  if (now >= 1530 && now <= 1535 && !store.futures1530Done) {
    for (const entry of callEntries) {
      if (entry.status !== 'monitoring') continue;
 
      const averageBasis = entry.averageBasis ?? 0;
      if (averageBasis === 0) {
        log(`[콜선물매도] 베이시스 없음 → 주문 불가`, 'error');
        continue;
      }
 
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
      const yeprice = Number(data?.t2111OutBlock?.yeprice ?? 0);
      if (yeprice <= 0) {
        log(`[콜선물매도] yeprice 조회 실패`, 'error');
        continue;
      }
 
      const estimatedSpot = parseFloat((yeprice - averageBasis).toFixed(2));
      log(
        `[콜선물매도 15:30] 추정현물가: ${estimatedSpot} vs 행사가: ${entry.actprice}`,
        'info'
      );
 
      if (entry.actprice < estimatedSpot) {
        // ✅ 호가 조회 → bidho1 - 0.2p 매도
        const hogaData = await fetchFuturesHogaData(token, entry.futuresCode);
        if (!hogaData) {
          log(`[콜선물매도] 호가 조회 실패`, 'error');
          continue;
        }
        const bidho1 = hogaData.bids[0]?.price ?? 0;
        if (bidho1 <= 0) {
          log(`[콜선물매도] bidho1 조회 실패`, 'error');
          continue;
        }
        const orderPrice = parseFloat((bidho1 - 0.2).toFixed(2));
        log(`[콜선물매도 진입] 행사가 ${entry.actprice} < 추정현물가 ${estimatedSpot} → bidho1: ${bidho1} 매도가: ${orderPrice}`, 'warn');
 
        const result = await placeFuturesOrder(token, {
          fnoIsuNo: entry.futuresCode,
          bnsTpCode: '1',
          orderType: '00',
          price: orderPrice,
          qty: entry.hedgeQty,
          trdPtnCode: '00',
        });
 
        if (result.success) {
          log(`[콜선물매도 완료] ${entry.futuresCode} ${entry.hedgeQty}계약 @ ${orderPrice} 주문번호: ${result.ordNo}`, 'success');
          store.setCallEntryStatus(entry.callCode, 'hedged');
        } else {
          log(`[콜선물매도 실패] ${result.message}`, 'error');
        }
      } else {
        log(`[콜선물매도 불필요] 행사가 ${entry.actprice} ≥ 추정현물가 ${estimatedSpot}`, 'success');
      }
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
    await runCallTradingCycle(); // ✅ 콜매도 사이클
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
      await runCallTradingCycle(); // ✅ 콜매도 사이클
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