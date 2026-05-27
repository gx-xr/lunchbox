/**
 * constants/marketCodes.ts
 * LS증권 선물옵션 종목코드 체계 상수
 * ✅ 종목코드 앞자리로 마켓/상품 구분
 * ✅ 하드코딩 방지 - 코드 변경 시 이 파일만 수정
 */
 
export const MARKET_CODES = {
  // ─── 선물 ──────────────────────────────────────────────────
  KP200_FUT: 'A016',       // 코스피200 선물
  KQ150_FUT: 'A066',       // 코스닥150 선물
 
  // ─── 코스피200 옵션 ─────────────────────────────────────────
  KP200_CALL: 'B0',       // 코스피200 콜옵션 (위클리/월물 공통)
  KP200_PUT: 'C0',        // 코스피200 풋옵션 (위클리/월물 공통)
 
  // ─── 코스닥150 위클리 옵션 ──────────────────────────────────
  KQ150_CALL_WEEKLY: 'BA', // 코스닥150 위클리 콜옵션
  KQ150_PUT_WEEKLY: 'CA',  // 코스닥150 위클리 풋옵션
 
  // ─── 코스닥150 월물 옵션 ────────────────────────────────────
  KQ150_CALL_MONTHLY: 'B066', // 코스닥150 월물 콜옵션
  KQ150_PUT_MONTHLY: 'C066',  // 코스닥150 월물 풋옵션
} as const;
 
// ─── 마켓 구분 함수 ──────────────────────────────────────────
// 종목코드 앞자리로 KOSPI200/KOSDAQ150 구분
export function getMarketFromCode(code: string): 'KOSPI200' | 'KOSDAQ150' {
  if (
    code.startsWith(MARKET_CODES.KQ150_FUT) ||
    code.startsWith(MARKET_CODES.KQ150_CALL_WEEKLY) ||
    code.startsWith(MARKET_CODES.KQ150_PUT_WEEKLY) ||
    code.startsWith(MARKET_CODES.KQ150_CALL_MONTHLY) ||
    code.startsWith(MARKET_CODES.KQ150_PUT_MONTHLY)
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
  return code.startsWith(MARKET_CODES.KP200_CALL) ||
    code.startsWith(MARKET_CODES.KQ150_CALL_WEEKLY) ||
    code.startsWith(MARKET_CODES.KQ150_CALL_MONTHLY);
}
 
// ─── 풋옵션 여부 판별 ────────────────────────────────────────
export function isPutCode(code: string): boolean {
  return code.startsWith(MARKET_CODES.KP200_PUT) ||
    code.startsWith(MARKET_CODES.KQ150_PUT_WEEKLY) ||
    code.startsWith(MARKET_CODES.KQ150_PUT_MONTHLY);
}