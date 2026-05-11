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
 
    let acntNo = '';
    let acntNm = '';
    let ordAblAmt = 0;
    let positions: Position[] = [];
 
    // ─── 1. CFOAQ50600 먼저 시도 ────────────────────────────────
    const acntData = await postApi(token, '/futureoption/accno', 'CFOAQ50600', {
      CFOAQ50600InBlock1: {
        RecCnt: 1,
        OrdDt: ordDt,
        BalEvalTp: '2',
        FutsPrcEvalTp: '2',
        LqtQtyQryTp: '1',
      },
    });
 
    const isSuccess = acntData.rsp_cd === '00000' || acntData.rsp_cd?.startsWith('001');
 
    if (isSuccess) {
      // ✅ 실계좌: CFOAQ50600에서 모두 가져옴
      acntNo = String(acntData.CFOAQ50600OutBlock1?.AcntNo ?? '');
      acntNm = String(acntData.CFOAQ50600OutBlock2?.AcntNm ?? '');
      ordAblAmt = Number(acntData.CFOAQ50600OutBlock2?.MnyOrdAbleAmt ?? 0);
 
      const posList: any[] = Array.isArray(acntData.CFOAQ50600OutBlock3)
        ? acntData.CFOAQ50600OutBlock3
        : [];
 
      positions = posList
        .filter((r: any) => Number(r.UnsttQty ?? 0) > 0)
        .map((r: any) => {
          // ✅ 실계좌: IsuNm에서 행사가 파싱 (예: "코스닥위클리 P 2604W5 2,000" → 2000)
          const isuNm = String(r.IsuNm ?? '');
          const parts = isuNm.trim().split(' ');
          const parsedActprice = parseFloat(parts[parts.length - 1].replace(/,/g, '')) || 0;
          return {
            code: String(r.FnoIsuNo ?? ''),
            name: isuNm,
            side: (r.BnsTpCode === '1' ? 'SELL' : 'BUY') as 'SELL' | 'BUY',
            qty: Number(r.UnsttQty ?? 0),
            avgPrice: Number(r.FnoAvrPrc ?? 0),
            evalAmt: Number(r.EvalAmt ?? 0),
            buyAmt: Number(r.FnoAvrPrc ?? 0) * Number(r.UnsttQty ?? 0),
            evalPnl: Number(r.EvalPnl ?? 0),
            pnlRate: Number(r.PnlRat ?? 0),
            actprice: parsedActprice, // ✅ 종목명에서 파싱
          };
        });
 
      console.log('[CFOAQ50600] 실계좌 조회 성공:', acntNo, '포지션:', positions.length);
 
    } else {
      // ✅ 모의계좌: CFOAQ50600 실패 → CFOAQ00600으로 계좌번호 + t0441로 포지션
      console.log('[CFOAQ50600] 모의계좌 미지원 → t0441 fallback');
 
      // ✅ CFOAQ00600으로 계좌번호 가져오기 (모의계좌도 지원)
      try {
        const acntData2 = await postApi(token, '/futureoption/accno', 'CFOAQ00600', {
          CFOAQ00600InBlock1: {
            QrySrtDt: ordDt,
            QryEndDt: ordDt,
            FnoClssCode: '00',
            PrdgrpCode: '00',
            PrdtExecTpCode: '0',
            StnlnSeqTp: '3',
            CommdaCode: '99',
          },
        });
        acntNo = String(acntData2.CFOAQ00600OutBlock1?.AcntNo ?? '');
        acntNm = String(acntData2.CFOAQ00600OutBlock2?.AcntNm ?? '');
        console.log('[CFOAQ00600] 모의계좌번호:', acntNo ,'계좌이름 :', acntNm);
      } catch (e) {
        console.log('[CFOAQ00600] 계좌번호 조회 실패:', e);
      }
 
      const posData = await postApi(token, '/futureoption/accno', 't0441', {
        t0441InBlock: { cts_expcode: '', cts_medocd: '' },
      });
 
      const posList: any[] = Array.isArray(posData.t0441OutBlock1)
        ? posData.t0441OutBlock1
        : [];
 
      const filteredList = posList.filter((r: any) => Number(r.jqty ?? 0) > 0);
 
      // t2111로 종목명 + 행사가 조회
      for (const r of filteredList) {
        const expcode = String(r.expcode ?? '');
        let hname = expcode;
        let actpriceVal = 0;
        try {
          const nameData = await postApi(token, '/futureoption/market-data', 't2111', {
            t2111InBlock: { focode: expcode },
          });
          hname = String(nameData?.t2111OutBlock?.hname ?? expcode);
          actpriceVal = Number(nameData?.t2111OutBlock?.actprice ?? 0); // ✅ 행사가
        } catch {
          hname = expcode;
        }
 
        positions.push({
          code: expcode,
          name: hname,
          side: (r.medocd === '1' ? 'SELL' : 'BUY') as 'SELL' | 'BUY',
          qty: Number(r.jqty ?? 0),
          avgPrice: Number(r.pamt ?? 0),
          evalAmt: Number(r.appamt ?? 0),
          buyAmt: Number(r.mamt ?? 0),
          evalPnl: Number(r.dtsunik1 ?? 0),
          pnlRate: Number(r.sunikrt ?? 0),
          actprice: actpriceVal, // ✅ t2111에서 직접 가져옴
        });
      }
 
      console.log('[t0441] 모의계좌 포지션:', positions.length);
    }
 
    const account: AccountInfo = { acntNo, acntNm, ordAblAmt };
    return { account, positions };
 
  } catch (e) {
    console.log('잔고 조회 에러:', e);
    return null;
  }
}