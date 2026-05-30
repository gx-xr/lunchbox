// ════════════════════════════════════════
// ── 🧪 테스트 모드 플래그 ──────────────
// ════════════════════════════════════════
/**
 * TEST_BYPASS_TIME: 시간대 가드 우회
 *   - true: 언제든 자동매매 발동 (15:10~15:35 외 시간에도)
 *   - false: 실제 시간대 (15:10~15:35) 에만 동작
 *
 * TEST_BYPASS_EXPIRY: 잔여일 가드 우회
 *   - true: 만기당일 아니어도 동작 (잔여일 무관)
 *   - false: 만기당일(잔여일 1) 종목만 동작
 *
 * 사용 시나리오:
 *   - 풀 테스트:           TIME=true,  EXPIRY=true
 *   - 시간만 진짜:         TIME=false, EXPIRY=true
 *   - 만기일만 진짜:       TIME=true,  EXPIRY=false
 *   - 실거래:              TIME=false, EXPIRY=false
 *
 * ⚠️ 실거래 또는 배포 전 둘 다 false로 원복할 것!
 */
export const TEST_BYPASS_TIME = false;
export const TEST_BYPASS_EXPIRY = false;

// UI 배너용 (둘 중 하나라도 true면 표시)
export const TEST_MODE = TEST_BYPASS_TIME || TEST_BYPASS_EXPIRY;