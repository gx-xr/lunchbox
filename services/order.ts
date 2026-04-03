// 주문 서비스
// 실제 연동: LS증권 CSPAT00600 (현물매수), CSPAT00700 (현물매도)

import { OrderRequest, OrderResult } from '../types/trading';

export async function placeOrder(
  token: string,
  order: OrderRequest
): Promise<OrderResult> {
  // --- 실제 연동 시 아래 코드 사용 ---
  // const trCd = order.side === 'BUY' ? 'CSPAT00600' : 'CSPAT00700';
  // const res = await fetch('https://openapi.ls-sec.co.kr:8080/stock/order', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'authorization': `Bearer ${token}`,
  //     'tr_cd': trCd,
  //     'tr_cont': 'N',
  //   },
  //   body: JSON.stringify({
  //     IsuNo: order.symbolCode,
  //     OrdQty: order.quantity,
  //     OrdPrc: order.price,
  //     BnsTpCode: order.side === 'BUY' ? '2' : '1',
  //     OrdprcPtnCode: '00',
  //   }),
  // });
  // const data = await res.json();
  // return { orderId: data.OrdNo, success: true, message: '주문 완료' };

  await new Promise((r) => setTimeout(r, 600));
  return {
    orderId: `MOCK-${Date.now()}`,
    success: true,
    message: `${order.symbolName} ${order.side === 'BUY' ? '매수' : '매도'} 주문이 접수되었습니다.`,
  };
}