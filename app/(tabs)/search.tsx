/**
 * app/(tabs)/search.tsx
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import {
  fetchKP200MonthlyBoard,
  fetchKQ150MonthlyBoard,
  fetchKP200FutureList,
  fetchKQ150FutureList,
  fetchKospiSpotPrice,
  OptionBoardItem,
  OptionBoardResult,
  fetchKP200WeeklyBoard,
  fetchKQ150WeeklyCodes,
  fetchKQ150OptionBoard,
  fetchKP200ValidWeeklyKeys,
  buildKQ150WeekKeys,
  WeeklyOptionCode,
} from '../../services/options';
import OptionBoardScreen from '../../components/OptionBoardScreen';
import { fetchKosdaq150SpotPrice } from '../../services/market';
 
function getOptionExpiryMonths(): { yyyymm: string; label: string }[] {
  const today = new Date();
  const result: { yyyymm: string; label: string }[] = [];
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  while (result.length < 4) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const firstThu = firstDow <= 4 ? 5 - firstDow : 12 - firstDow;
    const secondThu = new Date(year, month, firstThu + 7, 23, 59, 59);
    if (today <= secondThu) {
      const mm = String(month + 1).padStart(2, '0');
      const yy = String(year).slice(2);
      result.push({ yyyymm: `${year}${mm}`, label: `${yy}년 ${month + 1}월` });
    }
    cursor = new Date(year, month + 1, 1);
  }
  return result;
}
 
type MainTab = 'KP200' | 'KP200W' | 'KQ150' | 'KQ150W';
interface FutureItem { shcode: string; hname: string; }
 
function MonthlyOptionBoard({
  board, futurePrice, spotPrice, spotLabel, jandatecnt, loading, refreshing, onRefresh, market,
}: {
  board: OptionBoardItem[]; futurePrice: number; spotPrice?: number;
  spotLabel?: string;
  jandatecnt: number; loading: boolean; refreshing: boolean;
  onRefresh: () => void; market: 'KP200' | 'KQ150';
}) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<OptionBoardItem | null>(null);
  const [clickedSide, setClickedSide] = useState<'CALL' | 'PUT' | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
 
  const atmActprice = board.length > 0 && futurePrice > 0
    ? board.reduce((prev, cur) => Math.abs(cur.actprice - futurePrice) < Math.abs(prev.actprice - futurePrice) ? cur : prev).actprice
    : null;
 
  useEffect(() => {
    if (!atmActprice || board.length === 0) return;
    const atmIndex = board.findIndex(item => item.actprice === atmActprice);
    if (atmIndex > 0 && flatListRef.current) {
      setTimeout(() => { flatListRef.current?.scrollToIndex({ index: Math.max(0, atmIndex - 2), animated: true }); }, 300);
    }
  }, [atmActprice, board.length]);
 
  const handleAction = (params: { putCode: string; actprice: number; putPrice: number; optionType: 'PUT' | 'CALL'; side: 'BUY' | 'SELL'; isuNm?: string; }) => {
    //console.log('jandatecnt:', jandatecnt); // 월물옵션 잔여일 확인
    setSheetVisible(false);
    const mktLabel = market === 'KP200' ? '코스피200' : '코스닥150';
    const optLabel = params.optionType === 'CALL' ? '콜옵션' : '풋옵션';
    router.push({ pathname: '/order/put-order', params: { putCode: params.putCode, actprice: String(params.actprice), putPrice: String(params.putPrice), market: market === 'KP200' ? 'KOSPI200' : 'KOSDAQ150', optionType: params.optionType, side: params.side, isuNm: params.isuNm ?? `${mktLabel} ${optLabel} ${params.actprice}`, jandatecnt: String(jandatecnt) } });
  };
 
  if (loading) return <ActivityIndicator size="large" color="#3182f6" style={{ marginTop: 40 }} />;
 
  return (
    <>
      <View style={s.summaryRow}>
        <View style={s.summaryLeft}>
          {spotPrice != null && spotPrice > 0 && <View style={s.priceItem}><Text style={s.priceLabel}>{spotLabel ?? (market === 'KP200' ? 'KP200' : 'KQ150')}</Text><Text style={s.priceValue}>{spotPrice.toFixed(2)}</Text></View>}
          {futurePrice > 0 && <View style={s.priceItem}><Text style={s.priceLabel}>선물</Text><Text style={s.priceValue}>{futurePrice.toFixed(2)}</Text></View>}
        </View>
        {jandatecnt > 0 && <Text style={s.jandateText}>잔존 <Text style={s.jandateValue}>{jandatecnt}일</Text></Text>}
      </View>
      <View style={s.tableHeader}>
        <Text style={[s.th, { flex: 1.2, color: '#888' }]}>대비</Text>
        <Text style={[s.th, { flex: 1.2, color: '#f04452' }]}>콜</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: 'center' }]}>행사가</Text>
        <Text style={[s.th, { flex: 1.2, color: '#3182f6', textAlign: 'right' }]}>풋</Text>
        <Text style={[s.th, { flex: 1.2, color: '#888', textAlign: 'right' }]}>대비</Text>
      </View>
      <FlatList
        ref={flatListRef} data={board} keyExtractor={item => String(item.actprice)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onScrollToIndexFailed={() => {}}
        renderItem={({ item }) => {
          const isATM = item.actprice === atmActprice;
          const callColor = item.callChange > 0 ? '#f04452' : item.callChange < 0 ? '#3182f6' : '#1a1a1a';
          const putColor = item.putChange > 0 ? '#f04452' : item.putChange < 0 ? '#3182f6' : '#1a1a1a';
          const callChangeColor = item.callChange > 0 ? '#f04452' : item.callChange < 0 ? '#3182f6' : '#cccccc';
          const putChangeColor = item.putChange > 0 ? '#f04452' : item.putChange < 0 ? '#3182f6' : '#cccccc';
          return (
            <View style={[s.row, isATM && s.atmRow]}>
              <Text style={[s.cell, { flex: 1.2, color: callChangeColor, fontSize: 12 }]}>{item.callChange !== 0 ? (item.callChange > 0 ? '▲' : '▼') : ''}{item.callChange !== 0 ? Math.abs(item.callChange).toFixed(2) : '-'}</Text>
              <TouchableOpacity style={{ flex: 1.2 }} onPress={() => { setSelectedItem(item); setClickedSide('CALL'); setSheetVisible(true); }} activeOpacity={0.6}>
                <Text style={[s.cell, { color: callColor, fontWeight: '700' }]}>{item.callPrice > 0 ? item.callPrice.toFixed(2) : '-'}</Text>
              </TouchableOpacity>
              <View style={[s.actpriceCell, isATM && s.atmCell]}>
                <Text style={[s.actpriceText, isATM && s.atmText]}>{item.actprice.toLocaleString()}</Text>
                {isATM && <Text style={s.atmBadge}>ATM</Text>}
              </View>
              <TouchableOpacity style={{ flex: 1.2 }} onPress={() => { setSelectedItem(item); setClickedSide('PUT'); setSheetVisible(true); }} activeOpacity={0.6}>
                <Text style={[s.cell, { color: putColor, fontWeight: '700', textAlign: 'right' }]}>{item.putPrice > 0 ? item.putPrice.toFixed(2) : '-'}</Text>
              </TouchableOpacity>
              <Text style={[s.cell, { flex: 1.2, color: putChangeColor, textAlign: 'right', fontSize: 12 }]}>{item.putChange !== 0 ? (item.putChange > 0 ? '▲' : '▼') : ''}{item.putChange !== 0 ? Math.abs(item.putChange).toFixed(2) : '-'}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>데이터가 없습니다</Text></View>}
      />
      {selectedItem && (
        <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => setSheetVisible(false)}>
          <TouchableOpacity style={as.overlay} activeOpacity={1} onPress={() => setSheetVisible(false)} />
          <View style={as.sheet}>
            <View style={as.handle} />
            <View style={as.titleRow}><Text style={as.title}>행사가 {selectedItem.actprice.toLocaleString()}</Text><TouchableOpacity onPress={() => setSheetVisible(false)}><Text style={as.closeBtn}>✕</Text></TouchableOpacity></View>
            <View style={as.priceRow}>
              {(!clickedSide || clickedSide === 'CALL') && <View style={as.priceItem}><Text style={as.priceLabel}>콜</Text><Text style={[as.priceValue, { color: '#f04452' }]}>{selectedItem.callPrice > 0 ? selectedItem.callPrice.toFixed(2) : '-'}</Text></View>}
              {!clickedSide && <View style={as.priceDivider} />}
              {(!clickedSide || clickedSide === 'PUT') && <View style={as.priceItem}><Text style={as.priceLabel}>풋</Text><Text style={[as.priceValue, { color: '#3182f6' }]}>{selectedItem.putPrice > 0 ? selectedItem.putPrice.toFixed(2) : '-'}</Text></View>}
            </View>
            <View style={as.actionGrid}>
              {(!clickedSide || clickedSide === 'CALL') && (<><TouchableOpacity style={[as.actionBtn, { backgroundColor: '#fff1f0' }]} onPress={() => handleAction({ putCode: selectedItem.callCode, actprice: selectedItem.actprice, putPrice: selectedItem.callPrice, optionType: 'CALL', side: 'BUY' })}><Text style={[as.actionLabel, { color: '#f04452' }]}>콜 매수</Text><Text style={[as.actionSublabel, { color: '#f04452' }]}>{selectedItem.callPrice.toFixed(2)}</Text></TouchableOpacity><TouchableOpacity style={[as.actionBtn, { backgroundColor: '#eff6ff' }]} onPress={() => handleAction({ putCode: selectedItem.callCode, actprice: selectedItem.actprice, putPrice: selectedItem.callPrice, optionType: 'CALL', side: 'SELL' })}><Text style={[as.actionLabel, { color: '#3182f6' }]}>콜 매도</Text><Text style={[as.actionSublabel, { color: '#3182f6' }]}>{selectedItem.callPrice.toFixed(2)}</Text></TouchableOpacity></>)}
              {(!clickedSide || clickedSide === 'PUT') && (<><TouchableOpacity style={[as.actionBtn, { backgroundColor: '#fff1f0' }]} onPress={() => handleAction({ putCode: selectedItem.putCode, actprice: selectedItem.actprice, putPrice: selectedItem.putPrice, optionType: 'PUT', side: 'BUY' })}><Text style={[as.actionLabel, { color: '#f04452' }]}>풋 매수</Text><Text style={[as.actionSublabel, { color: '#f04452' }]}>{selectedItem.putPrice.toFixed(2)}</Text></TouchableOpacity><TouchableOpacity style={[as.actionBtn, { backgroundColor: '#eff6ff' }]} onPress={() => handleAction({ putCode: selectedItem.putCode, actprice: selectedItem.actprice, putPrice: selectedItem.putPrice, optionType: 'PUT', side: 'SELL' })}><Text style={[as.actionLabel, { color: '#3182f6' }]}>풋 매도</Text><Text style={[as.actionSublabel, { color: '#3182f6' }]}>{selectedItem.putPrice.toFixed(2)}</Text></TouchableOpacity></>)}
            </View>
            <View style={{ height: 24 }} />
          </View>
        </Modal>
      )}
    </>
  );
}
 
function KP200Tab({ token }: { token: string }) {
  const router = useRouter();
  const [futures, setFutures] = useState<FutureItem[]>([]);
  const [optionMonths] = useState(() => getOptionExpiryMonths());
  const [selectedYyyymm, setSelectedYyyymm] = useState(() => getOptionExpiryMonths()[0]?.yyyymm ?? '');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownY, setDropdownY] = useState(0);
  const dropdownBtnRef = useRef<any>(null);
  useEffect(() => { fetchKP200FutureList(token).then(list => setFutures(list)); }, [token]);
  useEffect(() => { if (selectedYyyymm) loadBoard(selectedYyyymm); }, []);
  const loadBoard = async (yyyymm: string) => {
    setLoading(true);
    try {
      const [result, spot] = await Promise.all([fetchKP200MonthlyBoard(token, yyyymm), fetchKospiSpotPrice(token)]);
      setBoard(result.board); setFuturePrice(result.futurePrice); setJandatecnt(result.jandatecnt); setSpotPrice(spot);
    } catch {}
    setLoading(false);
  };
  const onRefresh = async () => { setRefreshing(true); await loadBoard(selectedYyyymm); setRefreshing(false); };
  const selectedLabel = optionMonths.find(m => m.yyyymm === selectedYyyymm)?.label ?? '';
  const openDropdown = () => { dropdownBtnRef.current?.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => { setDropdownY(py + h); }); setDropdownVisible(true); };
  return (
    <View style={{ flex: 1 }}>
      <View style={s.futureRow}>{futures.slice(0, 4).map(f => (<TouchableOpacity key={f.shcode} style={s.futureBtn} onPress={() => router.push({ pathname: '/order/futures', params: { futCode: f.shcode, market: 'KOSPI200' } })}><Text style={s.futureBtnText}>{f.hname}</Text></TouchableOpacity>))}</View>
      <View style={s.maturityRow}><Text style={s.maturityLabel}>만기월</Text><TouchableOpacity ref={dropdownBtnRef} style={[s.dropdownBtn, { marginLeft: 'auto' }]} onPress={openDropdown}><Text style={s.dropdownBtnText}>{selectedLabel}</Text><Text style={s.dropdownArrow}>▼</Text></TouchableOpacity></View>
      <Modal visible={dropdownVisible} transparent animationType="fade" onRequestClose={() => setDropdownVisible(false)}><TouchableOpacity style={s.dropdownOverlay} activeOpacity={1} onPress={() => setDropdownVisible(false)} /><View style={[s.dropdownMenu, { top: dropdownY }]}>{optionMonths.map(m => (<TouchableOpacity key={m.yyyymm} style={[s.dropdownItem, selectedYyyymm === m.yyyymm && s.dropdownItemActive]} onPress={() => { setSelectedYyyymm(m.yyyymm); loadBoard(m.yyyymm); setDropdownVisible(false); }}><Text style={[s.dropdownItemText, selectedYyyymm === m.yyyymm && s.dropdownItemTextActive]}>{m.label}</Text>{selectedYyyymm === m.yyyymm && <Text style={s.dropdownCheck}>✓</Text>}</TouchableOpacity>))}</View></Modal>
      <MonthlyOptionBoard board={board} futurePrice={futurePrice} spotPrice={spotPrice} jandatecnt={jandatecnt} loading={loading} refreshing={refreshing} onRefresh={onRefresh} market="KP200" />
    </View>
  );
}
 
function KQ150Tab({ token }: { token: string }) {
  const router = useRouter();
  const [futures, setFutures] = useState<FutureItem[]>([]);
  const [optionMonths] = useState(() => getOptionExpiryMonths());
  const [selectedYyyymm, setSelectedYyyymm] = useState(() => getOptionExpiryMonths()[0]?.yyyymm ?? '');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownY, setDropdownY] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const dropdownBtnRef = useRef<any>(null);
  useEffect(() => { fetchKQ150FutureList(token).then(list => setFutures(list)); }, [token]);
  useEffect(() => { if (selectedYyyymm) loadBoard(selectedYyyymm); }, []);
  const loadBoard = async (yyyymm: string) => {
    setLoading(true);
    try {
      const [result, spot] = await Promise.all([
        fetchKQ150MonthlyBoard(token, yyyymm),
        fetchKosdaq150SpotPrice(token),
      ]);
      setBoard(result.board);
      setFuturePrice(result.futurePrice);
      setJandatecnt(result.jandatecnt);
      setSpotPrice(spot);
    } catch {}
    setLoading(false);
  };
  const onRefresh = async () => { setRefreshing(true); await loadBoard(selectedYyyymm); setRefreshing(false); };
  const selectedLabel = optionMonths.find(m => m.yyyymm === selectedYyyymm)?.label ?? '';
  const openDropdown = () => { dropdownBtnRef.current?.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => { setDropdownY(py + h); }); setDropdownVisible(true); };
  return (
    <View style={{ flex: 1 }}>
      <View style={s.futureRow}>{futures.slice(0, 4).map(f => (<TouchableOpacity key={f.shcode} style={s.futureBtn} onPress={() => router.push({ pathname: '/order/futures', params: { futCode: f.shcode, market: 'KOSDAQ150' } })}><Text style={s.futureBtnText}>{f.hname}</Text></TouchableOpacity>))}</View>
      <View style={s.maturityRow}><Text style={s.maturityLabel}>만기월</Text><TouchableOpacity ref={dropdownBtnRef} style={[s.dropdownBtn, { marginLeft: 'auto' }]} onPress={openDropdown}><Text style={s.dropdownBtnText}>{selectedLabel}</Text><Text style={s.dropdownArrow}>▼</Text></TouchableOpacity></View>
      <Modal visible={dropdownVisible} transparent animationType="fade" onRequestClose={() => setDropdownVisible(false)}><TouchableOpacity style={s.dropdownOverlay} activeOpacity={1} onPress={() => setDropdownVisible(false)} /><View style={[s.dropdownMenu, { top: dropdownY }]}>{optionMonths.map(m => (<TouchableOpacity key={m.yyyymm} style={[s.dropdownItem, selectedYyyymm === m.yyyymm && s.dropdownItemActive]} onPress={() => { setSelectedYyyymm(m.yyyymm); loadBoard(m.yyyymm); setDropdownVisible(false); }}><Text style={[s.dropdownItemText, selectedYyyymm === m.yyyymm && s.dropdownItemTextActive]}>{m.label}</Text>{selectedYyyymm === m.yyyymm && <Text style={s.dropdownCheck}>✓</Text>}</TouchableOpacity>))}</View></Modal>
      <MonthlyOptionBoard board={board} futurePrice={futurePrice} jandatecnt={jandatecnt} loading={loading} refreshing={refreshing} onRefresh={onRefresh} spotPrice={spotPrice} spotLabel="KQ150" market="KQ150" />
    </View>
  );
}
 
// ─── KP200 위클리 탭 ──────────────────────────────────────────
function KP200WeeklyTab({ token }: { token: string }) {
  const [weekKeys, setWeekKeys] = useState<{ key: string; yyyymm: string; label: string }[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [weekTab, setWeekTab] = useState<'ALL' | 'MON' | 'THU'>('ALL');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
 
  const applyBoard = (result: OptionBoardResult, spot: number) => {
    setBoard(result.board); setFuturePrice(result.futurePrice);
    setJandatecnt(result.jandatecnt); setSpotPrice(spot);
  };
 
  const loadBoard = useCallback(async (yyyymm: string) => {
    if (!token || !yyyymm) return;
    const [result, spot] = await Promise.all([fetchKP200WeeklyBoard(token, yyyymm), fetchKospiSpotPrice(token)]);
    applyBoard(result, spot);
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
      market="KOSPI200" futurePrice={futurePrice} futureLabel="코스피200 선물"
      spotPrice={spotPrice} spotLabel="KOSPI200" jandatecnt={jandatecnt} board={board}
      weekKeys={weekKeys} selectedWeekKey={selectedWeekKey} loading={loading} refreshing={refreshing}
      weekTab={weekTab} onWeekTabChange={setWeekTab} onWeekKeyChange={handleWeekKeyChange} onRefresh={onRefresh}
    />
  );
}
 
// ─── KQ150 위클리 탭 ──────────────────────────────────────────
function KQ150WeeklyTab({ token }: { token: string }) {
  const [allCodes, setAllCodes] = useState<WeeklyOptionCode[]>([]);
  const [weekKeys, setWeekKeys] = useState<{ key: string; label: string }[]>([]);
  const [selectedWeekKey, setSelectedWeekKey] = useState('');
  const [weekTab, setWeekTab] = useState<'ALL' | 'MON' | 'THU'>('ALL');
  const [board, setBoard] = useState<OptionBoardItem[]>([]);
  const [futurePrice, setFuturePrice] = useState(0);
  const [jandatecnt, setJandatecnt] = useState(0);
  const [spotPrice, setSpotPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!token) return;
    fetchKQ150WeeklyCodes(token).then(codes => {
      setAllCodes(codes);
      const keys = buildKQ150WeekKeys(codes);
      setWeekKeys(keys);
      if (keys.length > 0) setSelectedWeekKey(keys[0].key);
    }).finally(() => setLoading(false));
  }, [token]);
  const loadBoard = useCallback(async (weekKey: string, codes: WeeklyOptionCode[]) => {
      if (!token || !weekKey) return;
      const week = weekKey.slice(0, 2);
      const day = weekKey.slice(2) as 'MON' | 'THU';
      const filtered = codes.filter(c => c.week === week && c.weekDay === day);
      const [result, spot] = await Promise.all([
        fetchKQ150OptionBoard(token, filtered),
        fetchKosdaq150SpotPrice(token)
      ]);
      setBoard(result.board);
      setFuturePrice(result.futurePrice);
      setJandatecnt(result.jandatecnt);
      setSpotPrice(spot);
    }, [token]);

    useEffect(() => { if (selectedWeekKey && allCodes.length > 0) loadBoard(selectedWeekKey, allCodes); }, [selectedWeekKey, allCodes]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadBoard(selectedWeekKey, allCodes); setRefreshing(false); }, [loadBoard, selectedWeekKey, allCodes]);
  return (
    <OptionBoardScreen
      market="KOSDAQ150" futurePrice={futurePrice} futureLabel="코스닥150 선물"
      jandatecnt={jandatecnt} board={board} weekKeys={weekKeys} selectedWeekKey={selectedWeekKey}
      loading={loading} refreshing={refreshing} weekTab={weekTab} onWeekTabChange={setWeekTab}
      spotPrice={spotPrice} spotLabel="KQ150" 
      onWeekKeyChange={setSelectedWeekKey} onRefresh={onRefresh}
    />
  );
}
 
const MAIN_TABS: { key: MainTab; label: string }[] = [
  { key: 'KP200', label: 'KP200' }, { key: 'KP200W', label: 'KP200 위클리' },
  { key: 'KQ150', label: 'KQ150' }, { key: 'KQ150W', label: 'KQ150 위클리' },
];
 
export default function SearchScreen() {
  const token = useAuthStore((s) => s.token) ?? '';
  const [activeTab, setActiveTab] = useState<MainTab>('KP200');
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}><Text style={s.headerTitle}>종목 검색</Text></View>
      <View style={s.tabRow}>{MAIN_TABS.map(tab => (<TouchableOpacity key={tab.key} style={[s.mainTab, activeTab === tab.key && s.mainTabActive]} onPress={() => setActiveTab(tab.key)}><Text style={[s.mainTabText, activeTab === tab.key && s.mainTabTextActive]}>{tab.label}</Text></TouchableOpacity>))}</View>
      <View style={{ flex: 1 }}>
        {activeTab === 'KP200' && <KP200Tab token={token} />}
        {activeTab === 'KP200W' && <KP200WeeklyTab token={token} />}
        {activeTab === 'KQ150' && <KQ150Tab token={token} />}
        {activeTab === 'KQ150W' && <KQ150WeeklyTab token={token} />}
      </View>
    </SafeAreaView>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  mainTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f5f6f8' },
  mainTabActive: { backgroundColor: '#1a1a1a' },
  mainTabText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  mainTabTextActive: { color: '#fff' },
  futureRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  futureBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fff' },
  futureBtnText: { fontSize: 13, fontWeight: '700', color: '#888' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  summaryLeft: { flexDirection: 'row', gap: 16 },
  priceItem: { alignItems: 'flex-start' },
  priceLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  priceValue: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  jandateText: { fontSize: 12, color: '#888' },
  jandateValue: { fontWeight: '700', color: '#1a1a1a' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  th: { fontSize: 11, fontWeight: '700', color: '#888', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  atmRow: { backgroundColor: '#f0fdf4' },
  cell: { fontSize: 14, flex: 1 },
  actpriceCell: { flex: 1.5, alignItems: 'center', backgroundColor: '#f5f6f8', borderRadius: 8, paddingVertical: 5, marginHorizontal: 2 },
  atmCell: { backgroundColor: '#bbf7d0' },
  actpriceText: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  atmText: { color: '#15803d' },
  atmBadge: { fontSize: 9, fontWeight: '800', color: '#15803d', marginTop: 1 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#bbb', fontSize: 14 },
  maturityRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  maturityLabel: { fontSize: 12, fontWeight: '700', color: '#888' },
  dropdownBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  dropdownBtnText: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  dropdownArrow: { fontSize: 10, color: '#1a1a1a' },
  dropdownOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)' },
  dropdownMenu: { position: 'absolute', right: 16, backgroundColor: '#fff', borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8, minWidth: 140, overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  dropdownItemActive: { backgroundColor: '#f0fdf4' },
  dropdownItemText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  dropdownItemTextActive: { color: '#15803d', fontWeight: '800' },
  dropdownCheck: { fontSize: 14, color: '#15803d', fontWeight: '800' },
});
 
const as = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  closeBtn: { fontSize: 18, color: '#aaa', padding: 4 },
  priceRow: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 20, gap: 8 },
  priceItem: { flex: 1, alignItems: 'center' },
  priceDivider: { width: 1, backgroundColor: '#e0e0e0' },
  priceLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  priceValue: { fontSize: 20, fontWeight: '800' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47.5%', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionLabel: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  actionSublabel: { fontSize: 13, fontWeight: '600' },
});