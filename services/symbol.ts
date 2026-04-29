const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';

// ─── t8433: 지수옵션 마스터 조회 (위클리 종목코드 가져오기) ───
export async function fetchWeeklyOptionCodes(token: string): Promise<{
  callCode: string;
  putCode: string;
} | null> {
  try {
    const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'tr_cd': 't8433',
        'tr_cont': 'N',
        'tr_cont_key': '',
        'mac_address': '',
      },
      body: JSON.stringify({
        t8433InBlock: { dummy: '' },
      }),
    });
    const data = await res.json();
    console.log('t8433 전체 hname:', JSON.stringify(data?.t8433OutBlock?.map((i: any) => i.hname)));

    if (!data?.t8433OutBlock) return null;

  
// hname 기준으로 위클리(2812) 콜/풋 찾기
const weeklyCall = data.t8433OutBlock.find((item: any) =>
  item.hname?.includes('2812') && item.hname?.trimStart().startsWith('C')
);
const weeklyPut = data.t8433OutBlock.find((item: any) =>
  item.hname?.includes('2812') && item.hname?.trimStart().startsWith('P')
);

console.log('위클리 콜 항목:', JSON.stringify(weeklyCall));
console.log('위클리 풋 항목:', JSON.stringify(weeklyPut));

if (!weeklyCall || !weeklyPut) return null;

return {
  callCode: weeklyCall.expcode,  // shcode → expcode!
  putCode: weeklyPut.expcode,
};
  } catch (e) {
    return null;
  }
}

// ─── t2301: 옵션전광판 (콜/풋 행사가 리스트) ─────────────────
export async function fetchOptionBoard(
  token: string, 
  expcode: string, 
  gubn: '0' | '1' | 'W') {
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
        yyyymm: expcode,  
        gubun: gubn,
      },
    }),
    });
    const data = await res.json();
    console.log('t2301 응답키:', JSON.stringify(Object.keys(data)));  // ← 추가!
    console.log('t2301 rsp_cd:', data.rsp_cd, data.rsp_msg);          // ← 추가!
    return data;
  } catch (e) {
    console.log('t2301 에러:', e);
    return null;
  }
}

// ─── t2101: 선물/옵션 현재가 시세 조회 ───────────────────────
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
      t2101InBlock: { focode: expcode },  // expcode → focode!
    }),
    });
    const data = await res.json();
    console.log('t2101 응답:', JSON.stringify(data?.t2101OutBlock));
    return data?.t2101OutBlock ?? null;
  } catch (e) {
    return null;
  }
}
