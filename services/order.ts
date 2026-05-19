// order.ts
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
console.log('NEW ORDER.TS LOADED')
console.log('=== NEW ORDER.TS v2 ===');
 
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
  console.log(`[${trCd}] 응답:`, JSON.stringify(data).slice(0, 600));
  return data;
};
 
export type OrderPriceType = '00' | '03'; // 00: 지정가, 03: 시장가
export type TrdPtnCode = '00' | '03';     // 00: 신규, 03: 청산
 
export interface FuturesOrderParams {
  fnoIsuNo: string;
  bnsTpCode: '1' | '2';  // 1: 매도, 2: 매수
  orderType: OrderPriceType;
  price: number;
  qty: number;
  trdPtnCode?: TrdPtnCode;
}
 
export interface OrderResult {
  success: boolean;
  ordNo?: string;
  message: string;
}
 
// ─── CFOAT00100: 선물옵션 신규주문 ───────────────────────────
export async function placeFuturesOrder(
  token: string,
  params: FuturesOrderParams,
): Promise<OrderResult> {
  try {
    const data = await postApi(token, '/futureoption/order', 'CFOAT00100', {
      CFOAT00100InBlock1: {
        FnoIsuNo: params.fnoIsuNo,
        BnsTpCode: params.bnsTpCode,
        FnoOrdprcPtnCode: params.orderType,
        FnoOrdPrc: params.orderType === '03' ? 0 : params.price,
        OrdQty: params.qty,
        FnoTrdPtnCode: params.trdPtnCode ?? '00',
        FnoOrdPtnCode: '00',  // ✅ 추가
      },
    });
 
    // OrdNo는 OutBlock2에 있음 (OutBlock1엔 없음)
    const ordNo = data.CFOAT00100OutBlock2?.OrdNo ?? data.CFOAT00100OutBlock1?.OrdNo;
    if (ordNo && Number(ordNo) > 0) {
      return { success: true, ordNo: String(ordNo), message: '주문이 접수되었습니다.' };
    }
 
    // 명시적 실패 코드
    const FAIL_CODES = ['00009', 'IGW40011'];
    if (data.rsp_cd && FAIL_CODES.includes(data.rsp_cd)) {
      return { success: false, message: data.rsp_msg ?? '주문 실패' };
    }
 
    // 00000 또는 000xx 계열 = 성공 (모의투자 포함: 00039 등)
    if (data.rsp_cd === '00000' || data.rsp_cd?.startsWith('000')) {
      const fallbackOrdNo = data.CFOAT00100OutBlock2?.OrdNo ?? '';
      return { success: true, ordNo: String(fallbackOrdNo), message: data.rsp_msg ?? '주문이 접수되었습니다.' };
    }
 
    if (data.rsp_cd) {
      return { success: false, message: data.rsp_msg ?? '주문 실패' };
    }
 
    return { success: true, ordNo: '', message: '주문이 접수되었습니다.' };
 
  } catch (e) {
    console.log('주문 에러:', e);
    return { success: false, message: '주문 중 오류가 발생했습니다.' };
  }
}
 
// ─── CFOAT00300: 선물옵션 취소주문 ───────────────────────────
export interface CancelOrderParams {
  fnoIsuNo: string;
  orgOrdNo: number | string;
  cancQty: number;
}
 
export async function cancelFuturesOrder(
  token: string,
  params: CancelOrderParams,
): Promise<OrderResult> {
  try {
    const data = await postApi(token, '/futureoption/order', 'CFOAT00300', {
      CFOAT00300InBlock1: {
        FnoIsuNo: params.fnoIsuNo,
        OrgOrdNo: Number(params.orgOrdNo),
        CancQty: params.cancQty,
      },
    });
 
    // OutBlock1 또는 OutBlock2에서 OrdNo 확인
    const ordNo = data.CFOAT00300OutBlock1?.OrdNo ?? data.CFOAT00300OutBlock2?.OrdNo;
    if (ordNo) {
      return { success: true, ordNo: String(ordNo), message: '취소 주문이 접수되었습니다.' };
    }
 
    // 명시적 실패 코드
    const FAIL_CODES = ['00009', 'IGW40011'];
    if (data.rsp_cd && FAIL_CODES.includes(data.rsp_cd)) {
      return { success: false, message: data.rsp_msg ?? '취소 실패' };
    }
 
    // 00000 또는 004xx 계열 = 성공 (모의투자 포함)
    if (data.rsp_cd === '00000' || data.rsp_cd?.startsWith('004')) {
      return { success: true, ordNo: '', message: '취소 주문이 접수되었습니다.' };
    }
 
    if (data.rsp_cd) {
      return { success: false, message: data.rsp_msg ?? '취소 실패' };
    }
 
    return { success: true, ordNo: '', message: '취소 주문이 접수되었습니다.' };
 
  } catch (e) {
    console.log('취소주문 에러:', e);
    return { success: false, message: '취소 중 오류가 발생했습니다.' };
  }
}
 
// ─── t0434: 당일 체결/미체결 조회 ────────────────────────────
export interface FuturesOrderItem {
  ordno: string;
  expcode: string;
  medosu: string;
  qty: number;
  price: number;
  cheqty: number;
  cheprice: number;
  ordrem: number;
  status: string;
  ordtime: string;
  hname: string;
}
 
export async function fetchFuturesOrders(
  token: string,
  chegb: '0' | '1' | '2' = '0',
): Promise<FuturesOrderItem[]> {
  try {
    const data = await postApi(token, '/futureoption/accno', 't0434', {
      t0434InBlock: {
        expcode: '',
        chegb,
        sortgb: '1',
        cts_ordno: ' ',
      },
    });
 
    const list: any[] = data.t0434OutBlock1 ?? [];
    return list.map((r: any) => ({
      ordno: String(r.ordno ?? ''),  // API엔 Number로 전달
      expcode: String(r.expcode ?? ''),
      medosu: String(r.medosu ?? ''),
      qty: Number(r.qty ?? 0),
      price: Number(r.price ?? 0),
      cheqty: Number(r.cheqty ?? 0),
      cheprice: Number(r.cheprice ?? 0),
      ordrem: Number(r.ordrem ?? 0),
      status: String(r.status ?? ''),
      ordtime: String(r.ordtime ?? ''),
      hname: String(r.hname ?? ''),
    }));
  } catch (e) {
    console.log('체결조회 에러:', e);
    return [];
  }
}
 
// ─── CFOAQ00600: 기간별 주문체결내역 조회 ────────────────────
export interface PeriodOrderItem {
  ordDt: string;       // 주문일 (YYYYMMDD)
  ordNo: string;       // 주문번호
  orgOrdNo: string;    // 원주문번호
  ordTime: string;     // 주문시각
  isuNm: string;       // 종목명
  bnsTpNm: string;     // 매매구분 (매수/매도)
  ordPrc: number;      // 주문가
  ordQty: number;      // 주문수량
  ordTpNm: string;     // 주문구분명 (지정가/시장가 등)
  execTpNm: string;    // 체결구분명
  execPrc: number;     // 체결가
  execQty: number;     // 체결수량
  unercQty: number;    // 미체결수량
  bnsplAmt: number;    // 매매손익금액
  fnoIsuNo: string;    // 선물옵션종목번호
  mrcTpNm: string;     // 정정취소구분명
}
 
export async function fetchPeriodOrders(
  token: string,
  srtDt: string,  // YYYYMMDD
  endDt: string,  // YYYYMMDD
): Promise<PeriodOrderItem[]> {
  try {
    const data = await postApi(token, '/futureoption/accno', 'CFOAQ00600', {
      CFOAQ00600InBlock1: {
        RecCnt: 1,
        QrySrtDt: srtDt,
        QryEndDt: endDt,
        FnoClssCode: '00',   // 전체
        PrdgrpCode: '00',    // 전체
        PrdtExecTpCode: '0', // 전체
        StnlnSeqTp: '4',      // 역순
        CommdaCode: '99',    // 전체
      },
    });
 
    const list: any[] = data.CFOAQ00600OutBlock3 ?? [];
    return list.map((r: any) => ({
      ordDt: String(r.OrdDt ?? ''),
      ordNo: String(r.OrdNo ?? ''),
      orgOrdNo: String(r.OrgOrdNo ?? ''),
      ordTime: String(r.OrdTime ?? ''),
      isuNm: String(r.IsuNm ?? ''),
      bnsTpNm: String(r.BnsTpNm ?? ''),
      ordPrc: Number(r.OrdPrc ?? 0),
      ordQty: Number(r.OrdQty ?? 0),
      ordTpNm: String(r.OrdTpNm ?? ''),
      execTpNm: String(r.ExecTpNm ?? ''),
      execPrc: Number(r.ExecPrc ?? 0),
      execQty: Number(r.ExecQty ?? 0),
      unercQty: Number(r.UnercQty ?? 0),
      bnsplAmt: Number(r.BnsplAmt ?? 0),
      fnoIsuNo: String(r.FnoIsuNo ?? ''),
      mrcTpNm: String(r.MrcTpNm ?? ''),
    }));
  } catch (e) {
    console.log('기간별 주문조회 에러:', e);
    return [];
  }
}
 
// ─── 최대 주문 가능 계약수 계산 ──────────────────────────────
export function calcMaxQty(
  ordAblAmt: number,
  price: number,
  market: 'KOSPI200' | 'KOSDAQ150',
): number {
  const multiplier = market === 'KOSPI200' ? 250000 : 10000;
  if (price <= 0) return 0;
  return Math.floor(ordAblAmt / (price * multiplier));
}