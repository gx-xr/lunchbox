// 계좌 잔고 조회 서비스
// 실제 연동: LS증권 CSPAQ12300 TR

import { AccountSummary } from '../types/trading';
import { mockAccount } from '../mocks/account';

export async function fetchAccountSummary(token: string): Promise<AccountSummary> {
  // --- 실제 연동 시 아래 코드 사용 ---
  // const res = await fetch('https://openapi.ls-sec.co.kr:8080/stock/accno', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'authorization': `Bearer ${token}`,
  //     'tr_cd': 'CSPAQ12300',
  //     'tr_cont': 'N',
  //   },
  //   body: JSON.stringify({ ... }),
  // });
  // const data = await res.json();
  // return { deposit: data.d2_entr, orderable: data.ord_abl_amt, evalProfit: data.evlt_pl_amt };

  await new Promise((r) => setTimeout(r, 300));
  return mockAccount;
}