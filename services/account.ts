import { AccountSummary } from '../types/trading';
import { mockAccount } from '../mocks/account';

const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';

export async function fetchAccountSummary(token: string): Promise<AccountSummary> {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/accno`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 'CFOAQ50600',
        'tr_cont': 'N',
        'tr_cont_key': '',
        'mac_address': '',
      },
      body: JSON.stringify({
        CFOAQ50600InBlock1: {
          QryTp: '1',
          DivTp: '',
          AcntNo: '',
          Pwd: '',
        },
      }),
    });

    const data = await res.json();
    console.log('계좌 응답:', JSON.stringify(data));

    const block = data?.CFOAQ50600OutBlock1;
    if (!block) return mockAccount; // 실패시 mock 반환

    return {
      deposit: block.MgnTotAmt ?? 0,
      orderable: block.OrdAblAmt ?? 0,
      evalProfit: block.TotEvalPnlAmt ?? 0,
    };
  } catch (e) {
    console.log('계좌 조회 에러:', e);
    return mockAccount;
  }
}