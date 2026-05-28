/**
 * services/account.ts
 * 계좌 정보 + 보유 포지션 조회
 * ✅ 실계좌: CFOAQ50600 → t0441 현재가 merge
 * ✅ 모의계좌: CFOAQ00600 계좌번호 → t0441 포지션 → t2111 병렬 호출 종목명
 * ✅ t0441 연속조회 추가 (10개 이상 포지션 처리)
 * ✅ t2111 병렬 호출로 종목명 풀네임 가져오기
 */
import { AccountInfo, Position } from '../types/trading';
import { getMarketFromCode } from '../constants/marketCodes';

 
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
 
// ════════════════════════════════════════
// ── 공통 API 호출 함수 ──────────────────
// ════════════════════════════════════════
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
  return data;
};
 
// ════════════════════════════════════════
// ── t0441 연속조회 (전체 포지션 가져오기) ─
// ════════════════════════════════════════
// t0441은 한 번에 최대 10개까지만 반환하므로
// cts_expcode, cts_medocd가 있으면 연속조회 필요
async function fetchAllT0441Positions(token: string): Promise<any[]> {
  let allList: any[] = [];
  let cts_expcode = '';
  let cts_medocd = '';
 
  while (true) {
    const posData = await postApi(token, '/futureoption/accno', 't0441', {
      t0441InBlock: { cts_expcode, cts_medocd },
    });
 
    const posList: any[] = Array.isArray(posData.t0441OutBlock1)
      ? posData.t0441OutBlock1
      : [];
 
    allList = [...allList, ...posList];
 
    // 연속조회 키 확인 (없으면 마지막 페이지)
    cts_expcode = String(posData.t0441OutBlock?.cts_expcode ?? '').trim();
    cts_medocd = String(posData.t0441OutBlock?.cts_medocd ?? '').trim();
    if (!cts_expcode && !cts_medocd) break;
  }
 
  return allList;
}
 
// ════════════════════════════════════════
// ── t2111 병렬 조회 (종목명 + 행사가) ───
// ════════════════════════════════════════
// Promise.all로 모든 종목 동시 조회
// → 순차 호출 대비 훨씬 빠름 (12개도 1~2초)
async function fetchNameMapByT2111(
  token: string,
  expcodes: string[],
): Promise<Record<string, { hname: string; actprice: number; price: number; jandatecnt: number }>> {
  const result: Record<string, { hname: string; actprice: number; price: number; jandatecnt: number }> = {};
  if (expcodes.length === 0) return result;
 
  // 중복 제거
  const uniqueCodes = [...new Set(expcodes)];
 
  // 모든 종목 동시 조회 (병렬)
  const results = await Promise.all(
    uniqueCodes.map(async (expcode) => {
      try {
        const data = await postApi(token, '/futureoption/market-data', 't2111', {
          t2111InBlock: { focode: expcode },
        });
        return {
          expcode,
          hname: String(data?.t2111OutBlock?.hname ?? expcode),
          actprice: Number(data?.t2111OutBlock?.actprice ?? 0),
          price: Number(data?.t2111OutBlock?.price ?? 0),
          jandatecnt: Number(data?.t2111OutBlock?.jandatecnt ?? 0),
        };
      } catch {
        return { expcode, hname: expcode, actprice: 0, price: 0, jandatecnt: 0 };
      }
    })
  );
 
  for (const item of results) {
    result[item.expcode] = {
      hname: item.hname,
      actprice: item.actprice,
      price: item.price,
      jandatecnt: item.jandatecnt,
    };
  }
 return result;
}
 
// ════════════════════════════════════════
// ── 계좌 + 포지션 조회 메인 함수 ────────
// ════════════════════════════════════════
export async function fetchAccountAndPositions(token: string): Promise<{
  account: AccountInfo;
  positions: Position[];
} | null> {
  try {
    const today = new Date();
    const ordDt = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
 
    let acntNo = '';
    let acntNm = '';
    let ordAblAmt = 0;
    let positions: Position[] = [];
 
    // ─── 1. CFOAQ50600 실계좌 조회 시도 ─────────────────────────
    const acntData = await postApi(token, '/futureoption/accno', 'CFOAQ50600', {
      CFOAQ50600InBlock1: {
        RecCnt: 1,
        OrdDt: ordDt,
        BalEvalTp: '1',
        FutsPrcEvalTp: '1', // 당초가 : 매입단가 기준
        LqtQtyQryTp: '1',
      },
    });
    const isSuccess = acntData.rsp_cd === '00000' || acntData.rsp_cd?.startsWith('001');
    // console.log('[isSuccess]', isSuccess, acntData.rsp_cd);
    if (isSuccess) {
      // ─── 실계좌: CFOAQ50600에서 계좌정보 + 포지션 가져옴 ────────
      acntNo = String(acntData.CFOAQ50600OutBlock1?.AcntNo ?? '');
      acntNm = String(acntData.CFOAQ50600OutBlock2?.AcntNm ?? '');
      ordAblAmt = Number(acntData.CFOAQ50600OutBlock2?.MnyOrdAbleAmt ?? 0);
 
      const posList: any[] = Array.isArray(acntData.CFOAQ50600OutBlock3)
        ? acntData.CFOAQ50600OutBlock3
        : [];
 
      positions = posList
        .filter((r: any) => Number(r.UnsttQty ?? 0) > 0)
        .map((r: any) => {
          // IsuNm에서 행사가 파싱 (예: "코스닥위클리 P 2604W5 2,000" → 2000)
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
            buyAmt: Number(r.FnoAvrPrc ?? 0) * Number(r.UnsttQty ?? 0) * (getMarketFromCode(String(r.FnoIsuNo ?? '')) === 'KOSPI200' ? 250000 : 10000),
            evalPnl: Number(r.EvalPnl ?? 0),
            pnlRate: Number(r.PnlRat ?? 0),
            actprice: parsedActprice,
            currentPrice: Number(r.price ?? 0),
            jandatecnt: 0,
          };
        });
 
      // ─── t0441 연속조회로 현재가 merge ──────────────────────────
      const priceList = await fetchAllT0441Positions(token);
      positions = positions.map(pos => {
        const match = priceList.find(r => String(r.expcode) === pos.code);
        return { ...pos, currentPrice: match ? Number(match.price) : pos.currentPrice };
      });

      // t2111로 jandatecnt 채우기
      const expcodes = positions.map(p => p.code);
      const nameMap = await fetchNameMapByT2111(token, expcodes);
      positions = positions.map(pos => ({
        ...pos,
        jandatecnt: nameMap[pos.code]?.jandatecnt ?? 0,
        name: nameMap[pos.code]?.hname || pos.name,    //t2111에서 넘겨주는 짧은 이름
      }));
      console.log('[t2111 jandatecnt 확인]', nameMap);
 
    } else {
      // ─── 모의계좌: CFOAQ50600 실패 → fallback ───────────────────
 
      // CFOAQ00600으로 계좌번호 조회 (모의계좌 지원)
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
      } catch (e) {
        console.log('[CFOAQ00600] 계좌번호 조회 실패:', e);
      }
 
      // ─── t0441 연속조회로 포지션 전체 조회 ──────────────────────
      const allPosList = await fetchAllT0441Positions(token);
      const filteredList = allPosList.filter((r: any) => Number(r.jqty ?? 0) > 0);
 
      if (filteredList.length > 0) {
        // ─── t2111 병렬 호출로 종목명 + 행사가 한번에 가져오기 ────
        // Promise.all로 동시에 조회 → 순차 대비 훨씬 빠름
        const expcodes = filteredList.map(r => String(r.expcode ?? ''));
        const nameMap = await fetchNameMapByT2111(token, expcodes);
 
        for (const r of filteredList) {
          const expcode = String(r.expcode ?? '');
          const info = nameMap[expcode];
 
          positions.push({
            code: expcode,
            name: info?.hname ?? expcode,              // t2111 풀네임 종목명
            side: (r.medocd === '1' ? 'SELL' : 'BUY') as 'SELL' | 'BUY',
            qty: Number(r.jqty ?? 0),
            avgPrice: Number(r.pamt ?? 0),
            evalAmt: Number(r.appamt ?? 0),
            buyAmt: Number(r.mamt ?? 0),
            evalPnl: Number(r.dtsunik1 ?? 0),
            pnlRate: Number(r.sunikrt ?? 0),
            actprice: info?.actprice ?? 0,             // t2111 행사가
            currentPrice: info?.price ?? Number(r.price ?? 0),
            jandatecnt: info?.jandatecnt ?? 0,
          });
        }
      }
    }
 
    const account: AccountInfo = { acntNo, acntNm, ordAblAmt };
    return { account, positions };
 
  } catch (e) {
    console.log('잔고 조회 에러:', e);
    return null;
  }
}