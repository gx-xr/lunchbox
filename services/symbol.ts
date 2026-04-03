// 종목 검색 서비스
// 실제 연동: LS증권 종목 마스터 또는 t8436 TR

import { Symbol } from '../types/trading';
import { mockSymbols } from '../mocks/symbols';

export async function searchSymbols(query: string): Promise<Symbol[]> {
  // --- 실제 연동 시 API 호출로 교체 ---
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