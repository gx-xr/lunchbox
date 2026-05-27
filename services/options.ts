// options.ts
 
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
  return await res.json();
};
 
export interface WeeklyOptionCode {
  shcode: string;
  hname: string;
  weekDay: 'MON' | 'THU';
  week: string;
  actprice: string;
  type: 'CALL' | 'PUT';
}
 
export interface OptionBoardItem {
  actprice: number;
  callCode: string;
  callPrice: number;
  callChange: number;
  putCode: string;
  putPrice: number;
  putChange: number;
}
 
export interface OptionBoardResult {
  board: OptionBoardItem[];
  futurePrice: number;
  jandatecnt: number;
}
 
// ════════════════════════════════════════
// ── 유틸 함수 ───────────────────────────
// ════════════════════════════════════════
 
// ─── 잔존일 계산 헬퍼 ───────────────────────────────────────
// 위클리 월요일: 공휴일이면 다음날(화)로 밀리므로 어제부터 포함
// 위클리 목요일/월물: 공휴일이면 앞당겨지므로 오늘 기준
function calcJandatecnt(weekNum: number, weekDay: 'MON' | 'THU'): number {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 장마감(15:30) 이후면 오늘도 잔존일에 포함
  const isAfterClose = now.getHours() * 60 + now.getMinutes() >= 15 * 60 + 30;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const cutoff = weekDay === 'MON' ? yesterday : today;

  for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
    const year = today.getFullYear();
    const month = today.getMonth() + monthOffset;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      if (date.getDay() === (weekDay === 'MON' ? 1 : 4)) {
        count++;
        if (count === weekNum) {
          if (date < cutoff) break;
          let diff = Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          // ✅ 장마감 이후면 오늘도 포함 (+1)
          if (isAfterClose) diff += 1;
          return Math.max(0, diff);
        }
      }
    }
  }
  return 0;
}
 
// ─── t2301 응답 → OptionBoardResult 파싱 (위클리용) ─────────
function parseWeeklyBoardResponse(data: any, yyyymm: string): OptionBoardResult {
  const summary = data?.t2301OutBlock ?? {};
  const calls: any[] = data?.t2301OutBlock1 ?? [];
  const puts: any[] = data?.t2301OutBlock2 ?? [];
 
  const callMap: Record<string, any> = {};
  const putMap: Record<string, any> = {};
  calls.forEach(c => { callMap[c.actprice] = c; });
  puts.forEach(p => { putMap[p.actprice] = p; });
 
  const board: OptionBoardItem[] = Object.keys(putMap)
    .map(actprice => {
      const put = putMap[actprice];
      const call = callMap[actprice];
      const callSign = String(call?.sign ?? '3');
      const putSign = String(put?.sign ?? '3');
      const callAbsChange = Number(call?.change ?? 0);
      const putAbsChange = Number(put?.change ?? 0);
      return {
        actprice: Number(actprice),
        callCode: call?.optcode ?? '',
        callPrice: Number(call?.price ?? 0),
        callChange: (callSign === '5' || callSign === '6') ? -callAbsChange : callAbsChange,
        putCode: put.optcode,
        putPrice: Number(put.price ?? 0),
        putChange: (putSign === '5' || putSign === '6') ? -putAbsChange : putAbsChange,
      };
    })
    .filter(item => item.actprice > 0)
    .sort((a, b) => b.actprice - a.actprice);
 
  let jandatecnt = Number(summary.jandatecnt ?? 0);
  if (jandatecnt === 0) {
    const isMonday = yyyymm.endsWith('MON');
    const weekNum = parseInt(yyyymm.slice(1, 2));
    jandatecnt = calcJandatecnt(weekNum, isMonday ? 'MON' : 'THU');
  }
 
  return {
    board,
    futurePrice: Number(summary.gmprice ?? 0),
    jandatecnt,
  };
}
 
// ════════════════════════════════════════
// ── KQ150 위클리 ────────────────────────
// ════════════════════════════════════════
 
// ─── t8435 QW: 코스닥150 위클리 종목코드 ────────────────────
export async function fetchKQ150WeeklyCodes(token: string): Promise<WeeklyOptionCode[]> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't8435', {
      t8435InBlock: { gubun: 'QW' },
    });
    const list: any[] = data?.t8435OutBlock ?? [];
    return list.map((item: any) => {
      const hname: string = item.hname ?? '';
      const weekDayChar = hname.substring(5, 6).trim();
      const week = hname.substring(7, 9).trim();
      const actprice = hname.substring(10).trim().replace(/,/g, '');
      return {
        shcode: item.shcode,
        hname,
        weekDay: weekDayChar === '월' ? 'MON' : 'THU',
        week,
        actprice,
        type: item.shcode?.startsWith('B') ? 'CALL' : 'PUT',
      } as WeeklyOptionCode;
    });
  } catch (e) {
    console.log('KQ150 위클리 코드 조회 에러:', e);
    return [];
  }
}
 
// ─── KQ150 위클리: API 코드 기반 주차 키 생성 ───────────────
// ✅ 월요일 공휴일 처리: 어제부터 포함 (공휴일이면 다음날로 밀림)
// ✅ 목요일은 오늘 기준 (공휴일이면 앞당겨짐)
// ✅ 정렬 기준: 달력상 날짜 기준 (공휴일 밀림 고려해서 어제 날짜도 올바른 순서로)
export function buildKQ150WeekKeys(codes: WeeklyOptionCode[]): { key: string; label: string }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
 
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
 
  const unique = [...new Set(codes.map(c => `${c.week}${c.weekDay}`))];
 
  const withDates = unique.map(key => {
    const weekNum = parseInt(key.slice(1, 2));
    const isMonday = key.endsWith('MON');
    const targetDay = isMonday ? 1 : 4;
 
    // 월요일: 공휴일이면 다음날(화)로 밀리므로 어제부터 포함
    // 목요일: 공휴일이면 앞당겨지므로 오늘 기준
    const cutoff = isMonday ? yesterday : today;
 
    for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
      const year = today.getFullYear();
      const month = today.getMonth() + monthOffset;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      let count = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        date.setHours(0, 0, 0, 0);
        if (date.getDay() === targetDay) {
          count++;
          if (count === weekNum) {
            if (date >= cutoff) {
              return { key, label: `${weekNum}주 ${isMonday ? '월요일' : '목요일'}`, actualDate: date };
            }
            break;
          }
        }
      }
    }
    return null;
  });
 
  return withDates
    .filter((k): k is NonNullable<typeof k> => k !== null)
    // ✅ 달력상 날짜 기준 정렬 (어제 날짜도 올바른 순서로)
    .sort((a, b) => a.actualDate.getTime() - b.actualDate.getTime())
    .map(({ actualDate, ...k }) => k);
}
 
// ════════════════════════════════════════
// ── KP200 위클리 ────────────────────────
// ════════════════════════════════════════
 
// ─── KP200 위클리: 유효 탭 목록 + 첫 번째 board 데이터 반환 ─
// ✅ 월요일 공휴일 처리: 어제부터 후보에 포함
// ✅ t2301 API 응답(puts.length)으로 유효성 검증 → 공휴일 자동 처리
export async function fetchKP200ValidWeeklyKeys(token: string): Promise<{
  keys: { key: string; yyyymm: string; label: string }[];
  firstBoard: OptionBoardResult | null;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
 
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
 
  const candidates: { key: string; yyyymm: string; label: string; actualDate: Date }[] = [];
 
  for (let monthOffset = 0; monthOffset <= 1; monthOffset++) {
    const year = today.getFullYear();
    const month = today.getMonth() + monthOffset;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let monCount = 0;
    let thuCount = 0;
 
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      const day = date.getDay();
      if (day === 1) monCount++;
      if (day === 4) thuCount++;
 
      // 월요일: 공휴일이면 다음날(화)로 밀리므로 어제부터 포함
      // 목요일: 공휴일이면 앞당겨지므로 오늘 기준
      if (day === 1 && date >= yesterday) {
        candidates.push({
          key: `${year}${String(month + 1).padStart(2, '0')}_W${monCount}MON`,
          yyyymm: `W${monCount}MON`,
          label: `${monCount}주 월요일`,
          actualDate: date,
        });
      }
      if (day === 4 && date >= today) {
        candidates.push({
          key: `${year}${String(month + 1).padStart(2, '0')}_W${thuCount}THU`,
          yyyymm: `W${thuCount}THU`,
          label: `${thuCount}주 목요일`,
          actualDate: date,
        });
      }
    }
  }
 
  // 달력상 날짜 기준 정렬
  const sorted = candidates.sort((a, b) => a.actualDate.getTime() - b.actualDate.getTime());
  console.log('[KP200 candidates]', sorted.map(c => `${c.label}(${c.yyyymm}) ${c.actualDate.toISOString().slice(0, 10)}`));
 
  const validKeys: { key: string; yyyymm: string; label: string }[] = [];
  let firstBoard: OptionBoardResult | null = null;
 
  // t2301 API 응답으로 유효성 검증 (puts.length > 0이면 유효)
  // 공휴일로 날짜가 밀린 경우에도 API가 정확하게 판단
  for (const candidate of sorted) {
    try {
      const data = await postApi(token, '/futureoption/market-data', 't2301', {
        t2301InBlock: { yyyymm: candidate.yyyymm, gubun: 'W' },
      });
      const puts: any[] = data?.t2301OutBlock2 ?? [];
      console.log('[t2301 검증]', candidate.label, candidate.yyyymm, 'puts:', puts.length);
 
      if (puts.length > 0) {
        // ✅ yyyymm 중복 제거
        if (!validKeys.find(k => k.yyyymm === candidate.yyyymm)) {
          validKeys.push({ key: candidate.key, yyyymm: candidate.yyyymm, label: candidate.label });
        }
        // 첫 번째 유효 탭의 board 데이터 저장 (중복 API 호출 방지)
        if (firstBoard === null) {
          firstBoard = parseWeeklyBoardResponse(data, candidate.yyyymm);
          console.log('[KP200 첫 board 재사용] yyyymm:', candidate.yyyymm, '행:', firstBoard.board.length);
        }
      }
    } catch {}
  }
 
  console.log('[KP200 validKeys]', validKeys.map(k => k.label));
  return { keys: validKeys, firstBoard };
}
 
// ─── t2301: 코스피200 위클리 전광판 ─────────────────────────
export async function fetchKP200WeeklyBoard(
  token: string,
  yyyymm: string,
): Promise<OptionBoardResult> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2301', {
      t2301InBlock: { yyyymm, gubun: 'W' },
    });
    console.log('[t2301] yyyymm:', yyyymm, '콜:', data?.t2301OutBlock1?.length ?? 0, '풋:', data?.t2301OutBlock2?.length ?? 0);
    return parseWeeklyBoardResponse(data, yyyymm);
  } catch (e) {
    console.log('KP200 위클리 전광판 조회 에러:', e);
    return { board: [], futurePrice: 0, jandatecnt: 0 };
  }
}
 
// ════════════════════════════════════════
// ── KQ150 위클리 전광판 ─────────────────
// ════════════════════════════════════════
 
// ─── t8434: 멀티 현재가 → 전광판 (KQ150 위클리용) ──────────
export async function fetchOptionBoardFromCodes(
  token: string,
  codes: WeeklyOptionCode[],
  futureCode: string,
): Promise<OptionBoardResult> {
  if (codes.length === 0) return { board: [], futurePrice: 0, jandatecnt: 0 };
  try {
    const sliced = codes.slice(0, 50);
    const focode = sliced.map(c => c.shcode).join('');
    const data = await postApi(token, '/futureoption/market-data', 't8434', {
      t8434InBlock: { qrycnt: sliced.length, focode },
    });
    const outBlock: any[] = data?.t8434OutBlock1 ?? [];
    const priceMap: Record<string, { price: number; change: number }> = {};
    outBlock.forEach((b: any) => {
      const price = Number(b.price ?? 0);
      const absChange = Number(b.change ?? 0);
      const sign = String(b.sign ?? '3');
      const change = (sign === '5' || sign === '6') ? -absChange : absChange;
      priceMap[b.focode] = { price, change };
    });
    const callMap: Record<string, WeeklyOptionCode> = {};
    const putMap: Record<string, WeeklyOptionCode> = {};
    codes.forEach(c => {
      const key = c.actprice.replace(/,/g, '').trim();
      if (c.type === 'CALL') callMap[key] = c;
      else putMap[key] = c;
    });
    const board = Object.keys(putMap)
      .map(key => {
        const put = putMap[key];
        const call = callMap[key];
        const putP = priceMap[put.shcode] ?? { price: 0, change: 0 };
        const callP = call ? (priceMap[call.shcode] ?? { price: 0, change: 0 }) : { price: 0, change: 0 };
        return {
          actprice: Number(key),
          callCode: call?.shcode ?? '',
          callPrice: callP.price,
          callChange: callP.change,
          putCode: put.shcode,
          putPrice: putP.price,
          putChange: putP.change,
        };
      })
      .filter(item => item.actprice > 0)
      .sort((a, b) => b.actprice - a.actprice);
 
    let futurePrice = 0;
    let jandatecnt = 0;
    if (futureCode) {
      const priceData = await postApi(token, '/futureoption/market-data', 't2111', { t2111InBlock: { focode: futureCode } });
      futurePrice = Number(priceData?.t2111OutBlock?.price ?? 0);
      // ← 여기 추가
      console.log('[t2111 선물 전체]', JSON.stringify(priceData?.t2111OutBlock).slice(0, 300));
    }
    
    if (codes.length > 0) {
      const week = parseInt(codes[0].week.slice(1)); // "W4" → 4
      const weekDay = codes[0].weekDay;              // "MON" | "THU"
      jandatecnt = calcJandatecnt(week, weekDay);    // 달력 기준 잔존일
    }
    return { board, futurePrice, jandatecnt };
  } catch (e) {
    console.log('전광판 조회 에러:', e);
    return { board: [], futurePrice: 0, jandatecnt: 0 };
  }
}
 
export async function fetchKQ150OptionBoard(token: string, codes: WeeklyOptionCode[]): Promise<OptionBoardResult> {
  const sfData = await postApi(token, '/futureoption/market-data', 't8435', { t8435InBlock: { gubun: 'SF' } });
  const kqFutureCode = sfData?.t8435OutBlock?.[0]?.shcode ?? 'A0666000';
  return fetchOptionBoardFromCodes(token, codes, kqFutureCode);
}
 
// ════════════════════════════════════════
// ── 월물 전광판 ─────────────────────────
// ════════════════════════════════════════
 
export async function fetchKospiSpotPrice(token: string, futCode: string = 'A0166000'): Promise<number> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2111', { t2111InBlock: { focode: futCode } });
    return Number(data?.t2111OutBlock?.kospijisu ?? 0);
  } catch { return 0; }
}
 
export async function fetchKP200MonthlyBoard(token: string, yyyymm: string): Promise<OptionBoardResult> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2301', { t2301InBlock: { yyyymm, gubun: 'G' } });
    const summary = data?.t2301OutBlock ?? {};
    const calls: any[] = data?.t2301OutBlock1 ?? [];
    const puts: any[] = data?.t2301OutBlock2 ?? [];
    console.log('[t2301 KP200 월물] yyyymm:', yyyymm, '콜:', calls.length, '풋:', puts.length);
    console.log('[optcode 확인]', puts[0]?.optcode, calls[0]?.optcode);
    const callMap: Record<string, any> = {};
    const putMap: Record<string, any> = {};
    calls.forEach(c => { callMap[c.actprice] = c; });
    puts.forEach(p => { putMap[p.actprice] = p; });
    const board: OptionBoardItem[] = Object.keys(putMap).map(actprice => {
      const put = putMap[actprice]; const call = callMap[actprice];
      const callSign = String(call?.sign ?? '3'); const putSign = String(put?.sign ?? '3');
      const callAbsChange = Number(call?.change ?? 0); const putAbsChange = Number(put?.change ?? 0);
      return {
        actprice: Number(actprice),
        callCode: call?.optcode ?? '',
        callPrice: Number(call?.price ?? 0),
        callChange: (callSign === '5' || callSign === '6') ? -callAbsChange : callAbsChange,
        putCode: put.optcode,
        putPrice: Number(put.price ?? 0),
        putChange: (putSign === '5' || putSign === '6') ? -putAbsChange : putAbsChange,
      };
    }).filter(item => item.actprice > 0).sort((a, b) => b.actprice - a.actprice);
    return { board, futurePrice: Number(summary.gmprice ?? 0), jandatecnt: Number(summary.jandatecnt ?? 0) };
  } catch (e) {
    console.log('KP200 월물 전광판 조회 에러:', e);
    return { board: [], futurePrice: 0, jandatecnt: 0 };
  }
}
 
export async function fetchKQ150MonthlyBoard(token: string, yyyymm: string): Promise<OptionBoardResult> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't2301', { t2301InBlock: { yyyymm, gubun: 'Q' } });
    const summary = data?.t2301OutBlock ?? {};
    const calls: any[] = data?.t2301OutBlock1 ?? [];
    const puts: any[] = data?.t2301OutBlock2 ?? [];
    console.log('[t2301 KQ150 월물] yyyymm:', yyyymm, '콜:', calls.length, '풋:', puts.length);
    const callMap: Record<string, any> = {};
    const putMap: Record<string, any> = {};
    calls.forEach(c => { callMap[c.actprice] = c; });
    puts.forEach(p => { putMap[p.actprice] = p; });
    const board: OptionBoardItem[] = Object.keys(putMap).map(actprice => {
      const put = putMap[actprice]; const call = callMap[actprice];
      const callSign = String(call?.sign ?? '3'); const putSign = String(put?.sign ?? '3');
      const callAbsChange = Number(call?.change ?? 0); const putAbsChange = Number(put?.change ?? 0);
      return {
        actprice: Number(actprice),
        callCode: call?.optcode ?? '',
        callPrice: Number(call?.price ?? 0),
        callChange: (callSign === '5' || callSign === '6') ? -callAbsChange : callAbsChange,
        putCode: put.optcode,
        putPrice: Number(put.price ?? 0),
        putChange: (putSign === '5' || putSign === '6') ? -putAbsChange : putAbsChange,
      };
    }).filter(item => item.actprice > 0).sort((a, b) => b.actprice - a.actprice);
    return { board, futurePrice: Number(summary.gmprice ?? 0), jandatecnt: Number(summary.jandatecnt ?? 0) };
  } catch (e) {
    console.log('KQ150 월물 전광판 조회 에러:', e);
    return { board: [], futurePrice: 0, jandatecnt: 0 };
  }
}
 
// ════════════════════════════════════════
// ── 선물 목록 조회 ──────────────────────
// ════════════════════════════════════════
 
export async function fetchKP200FutureList(token: string): Promise<{ shcode: string; hname: string }[]> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't8467', { t8467InBlock: { gubun: '' } });
    return (data?.t8467OutBlock ?? [])
      .filter((item: any) => item.shcode?.startsWith('A'))
      .map((item: any) => ({ shcode: item.shcode, hname: item.hname }));
  } catch { return []; }
}
 
export async function fetchKQ150FutureList(token: string): Promise<{ shcode: string; hname: string }[]> {
  try {
    const data = await postApi(token, '/futureoption/market-data', 't8435', { t8435InBlock: { gubun: 'SF' } });
    return (data?.t8435OutBlock ?? [])
      .filter((item: any) => item.shcode?.startsWith('A'))
      .map((item: any) => ({ shcode: item.shcode, hname: item.hname }));
  } catch { return []; }
}