import React, { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  fetchKP200WeeklyBoard,
  fetchKP200ValidWeeklyKeys,
  fetchKospiSpotPrice,
  OptionBoardItem,
  OptionBoardResult,
} from '../../services/options';
import OptionBoardScreen from '../../components/OptionBoardScreen';
 
type WeekTab = 'ALL' | 'MON' | 'THU';
interface WeekKeyItem { key: string; yyyymm: string; label: string; }
 
export default function KospiOptionsScreen() {
  const token = useAuthStore((s) => s.token);
 
  const [weekKeys, setWeekKeys] = useState<WeekKeyItem[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [weekTab, setWeekTab] = useState<WeekTab>('ALL');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
 
  const applyBoard = (result: OptionBoardResult, spot: number) => {
    setBoard(result.board);
    setFuturePrice(result.futurePrice);
    setJandatecnt(result.jandatecnt);
    setSpotPrice(spot);
  };
 
  const loadBoard = useCallback(async (yyyymm: string) => {
    if (!token || !yyyymm) return;
    try {
      const [result, spot] = await Promise.all([
        fetchKP200WeeklyBoard(token, yyyymm),
        fetchKospiSpotPrice(token),
      ]);
      applyBoard(result, spot);
    } catch (e) {
      console.log('코스피 전광판 로드 에러:', e);
    }
  }, [token]);
 
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchKP200ValidWeeklyKeys(token).then(async ({ keys, firstBoard }) => {
      setWeekKeys(keys);
      if (keys.length > 0) {
        setSelectedWeekKey(keys[0].key);
        if (firstBoard) {
          // ★ 검증 시 이미 받아온 데이터 재사용 → 중복 API 호출 없음
          const spot = await fetchKospiSpotPrice(token);
          applyBoard(firstBoard, spot);
        }
      }
    }).finally(() => setLoading(false));
  }, [token]);
 
  const handleWeekKeyChange = (key: string) => {
    const found = weekKeys.find(k => k.key === key);
    if (!found) return;
    setSelectedWeekKey(key);
    setLoading(true);
    loadBoard(found.yyyymm).finally(() => setLoading(false));
  };
 
  const onRefresh = useCallback(async () => {
    const found = weekKeys.find(k => k.key === selectedWeekKey);
    if (!found) return;
    setRefreshing(true);
    await loadBoard(found.yyyymm);
    setRefreshing(false);
  }, [loadBoard, selectedWeekKey, weekKeys]);
 
  return (
    <OptionBoardScreen
      market="KOSPI200"
      futurePrice={futurePrice}
      futureLabel="선물"
      spotPrice={spotPrice}
      spotLabel="KOSPI200"
      jandatecnt={jandatecnt}
      board={board}
      weekKeys={weekKeys}
      selectedWeekKey={selectedWeekKey}
      loading={loading}
      refreshing={refreshing}
      weekTab={weekTab}
      onWeekTabChange={setWeekTab}
      onWeekKeyChange={handleWeekKeyChange}
      onRefresh={onRefresh}
    />
  );
}