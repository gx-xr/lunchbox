import { AccountInfo, Position } from '../types/trading';
 
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
  console.log(`[${trCd}] 응답:`, JSON.stringify(data).slice(0, 300));
  return data;
};
 
export async function fetchAccountAndPositions(token: string): Promise<{
  account: AccountInfo;
  positions: Position[];
} | null> {
  try {
    const today = new Date();
    const ordDt = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
 
    const data = await postApi(token, '/futureoption/accno', 'CFOAQ50600', {
      CFOAQ50600InBlock1: {
        RecCnt: 1, OrdDt: ordDt,
        BalEvalTp: '2',
        FutsPrcEvalTp: '2',
        LqtQtyQryTp: '1',
      },
    });
 
    // 00136 = "조회가 완료되었습니다" → 정상! 실패 아님
    const FAIL_CODES = ['00009', 'IGW40011'];
    if (data.rsp_cd && FAIL_CODES.includes(data.rsp_cd)) {
      console.log('잔고 조회 실패:', data.rsp_cd, data.rsp_msg);
      return null;
    }
 
    const b1 = data.CFOAQ50600OutBlock1 ?? {};
    const b2 = data.CFOAQ50600OutBlock2 ?? {};
    const b3: any[] = Array.isArray(data.CFOAQ50600OutBlock3) ? data.CFOAQ50600OutBlock3 : [];
 
    const account: AccountInfo = {
      acntNo: String(b1.AcntNo ?? ''),
      acntNm: String(b2.AcntNm ?? ''),
      ordAblAmt: Number(b2.MnyOrdAbleAmt ?? 0),
    };
 
    const positions: Position[] = b3.map((r: any) => ({
      code: String(r.FnoIsuNo ?? ''),
      name: String(r.IsuNm ?? ''),
      side: r.BnsTpCode === '1' ? 'SELL' : 'BUY',
      qty: Number(r.UnsttQty ?? 0),
      avgPrice: Number(r.FnoAvrPrc ?? 0),
      evalAmt: Number(r.EvalAmt ?? 0),
      buyAmt: Number(r.FnoAvrPrc ?? 0) * Number(r.UnsttQty ?? 0),
      evalPnl: Number(r.EvalPnl ?? 0),
      pnlRate: Number(r.PnlRat ?? 0),
    }));
 
    return { account, positions };
  } catch (e) {
    console.log('잔고 조회 에러:', e);
    return null;
  }
}