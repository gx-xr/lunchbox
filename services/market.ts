//martket.ts
import { IndexPrice } from '../types/trading';
 
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
 
const postApi = async (token: string, path: string, trCd: string, body: object) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'authorization': `Bearer ${token}`,
      'tr_cd': trCd,
      'tr_cont': 'N',
      'tr_cont_key': '0',
      'mac_address': '',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  //console.log(`[${trCd}] 응답:`, JSON.stringify(data).slice(0, 200));
  return data;
};
 
// ─── t8467: 코스피200 선물 최근월물 shcode ───────────────────
export async function fetchNearFutureCode(token: string): Promise<string> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't8467', {
      t8467InBlock: { dummy: '' },
    });
    const list: any[] = data.t8467OutBlock ?? [];
    //console.log('[t8467] 전체목록:', JSON.stringify(list.map((i:any) => ({shcode: i.shcode, hname: i.hname}))));
    return list[0]?.shcode ?? 'A0166000';
  } catch {
    return 'A0166000';
  }
}
 
// ─── t8435: 코스닥150 선물 최근월물 shcode ───────────────────
export async function fetchNearKqdaqFutureCode(token: string): Promise<string> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't8435', {
      t8435InBlock: { gubun: 'SF' },
    });
    const list: any[] = data.t8435OutBlock ?? [];
    //console.log('[t8435 SF]:', JSON.stringify(list.map((i:any) => ({shcode: i.shcode, hname: i.hname}))));
    return list[0]?.shcode ?? 'A0666000';
  } catch {
    return 'A0666000';
  }
}
 
// ─── 코스피200: t2111 → kospijisu (현물지수) ─────────────────
export async function fetchKospi200(token: string): Promise<IndexPrice | null> {
  try {
    const data = await postApi(token, '/indtp/market-data', 't1511', {
      t1511InBlock: { upcode: '101' },
    });
    const b = data?.t1511OutBlock;
    if (!b) return null;
    //console.log('[t1511 KP200]:', JSON.stringify(b).slice(0, 200));

    const price = Number(b.pricejisu ?? 0);
    const change = Number(b.change ?? 0);
    const changeRate = Number(b.diffjisu ?? 0);
    const sign = String(b.sign ?? '3');
    const isUp = sign === '1' || sign === '2';

    return {
      name: '코스피 200',
      price,
      change: isUp ? Math.abs(change) : -Math.abs(change),
      changeRate: isUp ? Math.abs(changeRate) : -Math.abs(changeRate),
      isUp,
    };
  } catch (e) {
    console.log('코스피200 조회 에러:', e);
    return null;
  }
}
 
// ─── 코스닥150: t1511 → pricejisu (현물지수) ──────────────
async function fetchKosdaq150(token: string): Promise<IndexPrice | null> {
  try {
    const data = await postApi(token, '/indtp/market-data', 't1511', {
      t1511InBlock: { upcode: '405' },
    });
    const b = data?.t1511OutBlock;
    if (!b) return null;
    //console.log('[t1511 KQ150]:', JSON.stringify(b).slice(0, 200));
 
    const price = Number(b.pricejisu ?? 0);
    const change = Number(b.change ?? 0);
    const changeRate = Number(b.diffjisu ?? 0);
    const sign = String(b.sign ?? '3');
    const isUp = sign === '1' || sign === '2';
 
    return {
      name: '코스닥 150',
      price,
      change: isUp ? Math.abs(change) : -Math.abs(change),
      changeRate: isUp ? Math.abs(changeRate) : -Math.abs(changeRate),
      isUp,
    };
  } catch (e) {
    console.log('코스닥150 조회 에러:', e);
    return null;
  }
}
 
// ─── t1511: 코스닥150 현물지수 단일 조회 ✅ ──────────────────
export async function fetchKosdaq150SpotPrice(token: string): Promise<number> {
  try {
    const data = await postApi(token, '/indtp/market-data', 't1511', {
      t1511InBlock: { upcode: '405' },
    });
    //console.log('[t1511]:', JSON.stringify(data).slice(0, 200));
    return Number(data?.t1511OutBlock?.pricejisu ?? 0);
  } catch (e) {
    console.log('t1511 에러:', e);
    return 0;
  }
}
 
// ─── 코스피200 + 코스닥150 동시 조회 ─────────────────────────
export async function fetchIndexPrices(token: string): Promise<{
  kospi200: IndexPrice | null;
  kosdaq150: IndexPrice | null;
}> {
   const [kospi200, kosdaq150] = await Promise.all([
    fetchKospi200(token),
    fetchKosdaq150(token),
  ]);
  return { kospi200, kosdaq150 };
}
 
export async function fetchFuturesPrice(token: string, code: string): Promise<{
  price: number; change: number; changeRate: number; isUp: boolean;
  open: number; high: number; low: number; jnilClose: number; jandatecnt: number;
} | null> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2111', {
      t2111InBlock: { focode: code },
    });
    const b = data.t2111OutBlock;
    if (!b) return null;
    const price = Number(b.price ?? 0);
    const jnilClose = Number(b.jnilclose ?? 0);
    const change = price - jnilClose;
    const changeRate = jnilClose > 0 ? (change / jnilClose) * 100 : 0;
    return {
      price, change, changeRate, isUp: change >= 0,
      open: Number(b.open ?? 0),
      high: Number(b.high ?? 0),
      low: Number(b.low ?? 0),
      jnilClose,
      jandatecnt: Number(b.bjandatecnt ?? 0),
    };
  } catch { return null; }
}
 
export async function fetchFuturesHogaData(token: string, code: string): Promise<{
  asks: { price: number; qty: number }[];
  bids: { price: number; qty: number }[];
} | null> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2112', {
      t2112InBlock: { shcode: code },
    });
    const b = data.t2112OutBlock;
    if (!b) return null;
 
    const asks: { price: number; qty: number }[] = [];
    const bids: { price: number; qty: number }[] = [];
 
    for (let i = 5; i >= 1; i--)
      asks.push({ price: Number(b[`offerho${i}`] ?? 0), qty: Number(b[`offerrem${i}`] ?? 0) });
 
    for (let i = 1; i <= 5; i++)
      bids.push({ price: Number(b[`bidho${i}`] ?? 0), qty: Number(b[`bidrem${i}`] ?? 0) });
 
    return { asks, bids };
  } catch { return null; }
}
 
export interface KospiMinuteBar {
  date: string;
  time: string;
  close: number;
}
 
export async function getKospi200MinuteBars(
  token: string,
  count: number = 1,
  shcode: string = '101',
): Promise<KospiMinuteBar[]> {
  try {
    const data = await postApi(token, '/futureoption/chart', 't8418', {
      t8418InBlock: {
        shcode, ncnt: 1, qrycnt: count,
        nday: '0', sdate: ' ', stime: '',
        edate: '99999999', etime: '',
        cts_date: ' ', cts_time: '', comp_yn: 'N',
      },
    });
    const bars = Array.isArray(data.t8418OutBlock1) ? data.t8418OutBlock1 : [];
    return bars.map((b: any) => ({
      date: String(b.date ?? ''),
      time: String(b.time ?? ''),
      close: Number(b.close ?? 0),
    }));
  } catch { return []; }
}
 
// ─── 현물가 단일 조회 (autoTrading용) ────────────────────────
export async function fetchSpotPriceSingle(
  token: string,
  market: 'KOSPI200' | 'KOSDAQ150',
): Promise<number> {
  try {
    if (market === 'KOSPI200') {
      const data = await postApi(token, '/futureoption/market-data', 't2111', {
        t2111InBlock: { focode: 'A0166000' },
      });
      return Number(data?.t2111OutBlock?.kospijisu ?? 0);
    } else {
      // t1511: 코스닥150 현물지수
      return await fetchKosdaq150SpotPrice(token);
    }
  } catch { return 0; }
}