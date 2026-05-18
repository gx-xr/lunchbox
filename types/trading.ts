// trading.ts
// 앱 전체에서 사용하는 타입 정의
 
export interface AuthCredentials {
  appKey: string;
  appSecret: string;
}
 
export interface AccountInfo {
  acntNo: string;       // 계좌번호
  acntNm: string;       // 계좌명
  ordAblAmt: number;    // 주문가능금액 (총 자산으로 표시)
}
 
export interface Position {
  code: string;             // 종목코드
  name: string;             // 종목명
  side: 'BUY' | 'SELL';     // 매수/매도
  qty: number;              // 잔고수량
  avgPrice: number;         // 평균단가
  evalAmt: number;          // 평가금액
  buyAmt: number;           // 매매금액
  evalPnl: number;          // 평가손익
  pnlRate: number;          // 수익률(%)
  actprice: number;         // 행사가
  currentPrice : number;    // 현재가
}
 
export interface IndexPrice {
  name: string;             // 지수명
  price: number;            // 현재가
  change: number;           // 전일대비
  changeRate: number;       // 등락률
  isUp: boolean;            // 상승여부
}
 
export type OrderSide = 'BUY' | 'SELL';
 
export interface OrderRequest {
  symbolCode: string;
  symbolName: string;
  side: OrderSide;
  quantity: number;
  price: number;
}
 
export interface OrderResult {
  orderId: string;
  success: boolean;
  message: string;
}
 
// 자동주문 4가지 시나리오
export type AutoOrderType =
  | 'KOSPI200_PUT_SELL'    // 코스피200 위클리 풋옵션 매도
  | 'KOSDAQ150_PUT_SELL'   // 코스닥150 위클리 풋옵션 매도
  | 'KOSPI200_FUT_BUY'     // 코스피200 선물 매수
  | 'KOSDAQ150_FUT_BUY';   // 코스닥150 선물 매수