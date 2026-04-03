import { AuthCredentials } from '../types/trading';

const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';

export async function fetchToken(creds: AuthCredentials): Promise<string> {
  try {
    console.log('토큰 요청 시작!');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      appkey: creds.appKey,
      appsecretkey: creds.appSecret,
      scope: 'oob',
    });

    const res = await fetch(`${BASE_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    console.log('응답 상태:', res.status);
    const data = await res.json();
    console.log('응답 데이터:', JSON.stringify(data));
    if (!data.access_token) throw new Error('토큰 없음');
    return data.access_token;
  } catch (e) {
    console.log('에러:', e);
    throw e;
  }
}