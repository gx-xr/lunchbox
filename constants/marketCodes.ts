/**
 * constants/marketCodes.ts
 * LS증권 선물옵션 종목코드 체계 상수
 * ✅ 종목코드 앞자리로 마켓/상품 구분
 * ✅ 하드코딩 방지 - 코드 변경 시 이 파일만 수정
 */
 
export const MARKET_CODES = {
  // ─── 선물 ──────────────────────────────────────────────────
  KP200_FUT: 'A016',           // 코스피200 선물
  KQ150_FUT: 'A066',           // 코스닥150 선물
 
  // ─── 코스피200 위클리 옵션 ──────────────────────────────────
  // 🆕 KP200 위클리는 'BAF' / 'CAF' (3글자) — 월물('B0','C0')과 분리
  KP200_CALL_WEEKLY: 'BAF',    // 코스피200 위클리 콜옵션
  KP200_PUT_WEEKLY: 'CAF',     // 코스피200 위클리 풋옵션
 
  // ─── 코스피200 월물 옵션 ────────────────────────────────────
  // 🔧 주석 정정: 'B0'/'C0'는 위클리(BAF/CAF) 못 잡음 → 월물 전용
  KP200_CALL: 'B0',            // 코스피200 콜옵션 (월물)
  KP200_PUT: 'C0',             // 코스피200 풋옵션 (월물)
 
  // ─── 코스닥150 위클리 옵션 ──────────────────────────────────
  // 🔧 'BA'/'CA' → 'BAK'/'CAK' (3글자)
  //    이유: 'BA'만 보면 KP200 위클리(BAF...)랑 충돌해서 시장 오판단 발생
  KQ150_CALL_WEEKLY: 'BAK',    // 코스닥150 위클리 콜옵션
  KQ150_PUT_WEEKLY: 'CAK',     // 코스닥150 위클리 풋옵션
 
  // ─── 코스닥150 월물 옵션 ────────────────────────────────────
  KQ150_CALL_MONTHLY: 'B066',  // 코스닥150 월물 콜옵션
  KQ150_PUT_MONTHLY: 'C066',   // 코스닥150 월물 풋옵션
} as const;
 
// ─── 마켓 구분 함수 ──────────────────────────────────────────
// 종목코드 앞자리로 KOSPI200/KOSDAQ150 구분
// 🔧 KQ150 매칭 안 되면 KP200 반환 (KP200 위클리 'BAF'도 여기서 KP200로 잡힘)
export function getMarketFromCode(code: string): 'KOSPI200' | 'KOSDAQ150' {
  if (
    code.startsWith(MARKET_CODES.KQ150_FUT) ||
    code.startsWith(MARKET_CODES.KQ150_CALL_WEEKLY) ||   // 'BAK'
    code.startsWith(MARKET_CODES.KQ150_PUT_WEEKLY) ||    // 'CAK'
    code.startsWith(MARKET_CODES.KQ150_CALL_MONTHLY) ||  // 'B066'
    code.startsWith(MARKET_CODES.KQ150_PUT_MONTHLY)      // 'C066'
  ) return 'KOSDAQ150';
  return 'KOSPI200';
}
 
// ─── 선물 여부 판별 ──────────────────────────────────────────
export function isFuturesCode(code: string): boolean {
  return code.startsWith(MARKET_CODES.KP200_FUT) ||
    code.startsWith(MARKET_CODES.KQ150_FUT);
}
 
// ─── 콜옵션 여부 판별 ────────────────────────────────────────
export function isCallCode(code: string): boolean {
  return code.startsWith(MARKET_CODES.KP200_CALL_WEEKLY) ||    // 🆕 'BAF' (KP200 위클리)
    code.startsWith(MARKET_CODES.KP200_CALL) ||                // 'B0' (KP200 월물)
    code.startsWith(MARKET_CODES.KQ150_CALL_WEEKLY) ||         // 'BAK'
    code.startsWith(MARKET_CODES.KQ150_CALL_MONTHLY);          // 'B066'
}
 
// ─── 풋옵션 여부 판별 ────────────────────────────────────────
export function isPutCode(code: string): boolean {
  return code.startsWith(MARKET_CODES.KP200_PUT_WEEKLY) ||     // 🆕 'CAF' (KP200 위클리)
    code.startsWith(MARKET_CODES.KP200_PUT) ||                 // 'C0' (KP200 월물)
    code.startsWith(MARKET_CODES.KQ150_PUT_WEEKLY) ||          // 'CAK'
    code.startsWith(MARKET_CODES.KQ150_PUT_MONTHLY);           // 'C066'
}