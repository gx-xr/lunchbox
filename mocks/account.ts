import { AccountSummary } from '../types/trading';

// 나중에 account.ts service가 실제 API를 호출하면 이 파일은 사용 안 함
export const mockAccount: AccountSummary = {
  deposit: 5_432_000,
  orderable: 3_200_000,
  evalProfit: 128_500,
};