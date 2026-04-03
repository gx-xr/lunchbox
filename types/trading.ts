// 앱 전체에서 사용하는 타입 정의

export interface AccountSummary {
  deposit: number;        // 예수금
  orderable: number;      // 주문가능금액
  evalProfit: number;     // 평가손익
}

export interface Symbol {
  code: string;           // 종목코드 (예: 101S6)
  name: string;           // 종목명
  price: number;          // 현재가
  change: number;         // 전일대비
  changeRate: number;     // 등락률(%)
  market: 'KOSPI' | 'KOSDAQ' | 'FUTURES' | 'OPTIONS';
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

export interface AuthCredentials {
  appKey: string;
  appSecret: string;
}