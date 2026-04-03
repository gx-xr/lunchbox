import { AuthCredentials } from '../types/trading';

const BASE_URL = 'https://openapi.ls-sec.co.kr:9080'; // 모의투자

export async function fetchToken(creds: AuthCredentials): Promise<string> {
  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: creds.appKey,
      appsecretkey: creds.appSecret,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('토큰 발급 실패');
  return data.access_token;
}