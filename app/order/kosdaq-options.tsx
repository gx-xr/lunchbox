import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  fetchKQ150WeeklyCodes,
  fetchKQ150OptionBoard,
  buildKQ150WeekKeys,
  WeeklyOptionCode,
  OptionBoardItem,
} from '../../services/options';
import OptionBoardScreen from '../../components/OptionBoardScreen';
 
type WeekTab = 'ALL' | 'MON' | 'THU';
interface WeekKeyItem { key: string; label: string; }
 
export default function KosdaqOptionsScreen() {
  const token = useAuthStore((s) => s.token);
 
  const [allCodes, setAllCodes] = useState<WeeklyOptionCode[]>([]);
  const [weekKeys, setWeekKeys] = useState<WeekKeyItem[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [weekTab, setWeekTab] = useState<WeekTab>('ALL');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
 
  const loadCodes = useCallback(async () => {
    if (!token) return;
    try {
      const codes = await fetchKQ150WeeklyCodes(token);
      setAllCodes(codes);
      // buildKQ150WeekKeys: 이번달+다음달 탐색, API 반환 코드 기반
      const keys = buildKQ150WeekKeys(codes);
      setWeekKeys(keys);
      if (keys.length > 0) setSelectedWeekKey(keys[0].key);
    } catch (e) {
      console.log('코드 로드 에러:', e);
    }
  }, [token]);
 
  const loadBoard = useCallback(async (weekKey: string, codes: WeeklyOptionCode[]) => {
    if (!token || !weekKey) return;
    try {
      const week = weekKey.slice(0, 2);
      const day = weekKey.slice(2) as 'MON' | 'THU';
      const filtered = codes.filter(c => c.week === week && c.weekDay === day);
      const result = await fetchKQ150OptionBoard(token, filtered);
      setBoard(result.board);
      setFuturePrice(result.futurePrice);
      setJandatecnt(result.jandatecnt);

      // t1511 코스닥150 현물지수 (upcode: '405')
      const spotRes = await fetch('https://openapi.ls-sec.co.kr:8080/indtp/market-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't1511', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t1511InBlock: { upcode: '405' } }),
      });
      const spotData = await spotRes.json();
      const sp = Number(spotData?.t1511OutBlock?.pricejisu ?? 0);
      if (sp > 0) setSpotPrice(sp);
    } catch (e) {
      console.log('전광판 로드 에러:', e);
    }
  }, [token]);
 
  useEffect(() => {
    loadCodes().finally(() => setLoading(false));
  }, [loadCodes]);
 
  useEffect(() => {
    if (selectedWeekKey && allCodes.length > 0) {
      loadBoard(selectedWeekKey, allCodes);
    }
  }, [selectedWeekKey, allCodes]);
 
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBoard(selectedWeekKey, allCodes);
    setRefreshing(false);
  }, [loadBoard, selectedWeekKey, allCodes]);
 
  return (
    <OptionBoardScreen
      market="KOSDAQ150"
      futurePrice={futurePrice}
      futureLabel="코스닥150 선물"
      spotPrice={spotPrice}
      spotLabel="KQ150"
      jandatecnt={jandatecnt}
      board={board}
      weekKeys={weekKeys}
      selectedWeekKey={selectedWeekKey}
      loading={loading}
      refreshing={refreshing}
      weekTab={weekTab}
      onWeekTabChange={setWeekTab}
      onWeekKeyChange={setSelectedWeekKey}
      onRefresh={onRefresh}
    />
  );
}