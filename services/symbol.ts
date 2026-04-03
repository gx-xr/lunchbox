import { Symbol } from '../types/trading';
import { mockSymbols } from '../mocks/symbols';


const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';

// 옵션전광판 (t2301) - 위클리 콜/풋 행사가 리스트
export async function fetchOptionBoard(
  token: string,
  expcode: string, // 종목코드 (예: KR4101W60008)
  gubn: '0' | '1'  // 0: 콜, 1: 풋
) {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't2301',
        'tr_cont': 'N',
        'tr_cont_key': '',
        'mac_address': '',
      },
      body: JSON.stringify({
        t2301InBlock: {
          expcode,
          gubn,
        },
      }),
    });
    const data = await res.json();
    console.log('옵션전광판 응답:', JSON.stringify(data));
    return data;
  } catch (e) {
    console.log('옵션전광판 에러:', e);
    return null;
  }
}

// 선물/옵션 현재가 (t2101)
export async function fetchCurrentPrice(token: string, expcode: string) {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't2101',
        'tr_cont': 'N',
        'tr_cont_key': '',
        'mac_address': '',
      },
      body: JSON.stringify({
        t2101InBlock: { expcode },
      }),
    });
    const data = await res.json();
    console.log('현재가 응답:', JSON.stringify(data));
    return data;
  } catch (e) {
    console.log('현재가 에러:', e);
    return null;
  }
}

// 기존 mock 검색 (종목 검색용)
export async function searchSymbols(query: string): Promise<Symbol[]> {
  await new Promise((r) => setTimeout(r, 200));
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return mockSymbols.filter(
    (s) => s.name.toLowerCase().includes(q) || s.code.includes(q)
  );
}

export async function getSymbolByCode(code: string): Promise<Symbol | null> {
  await new Promise((r) => setTimeout(r, 100));
  return mockSymbols.find((s) => s.code === code) ?? null;
}