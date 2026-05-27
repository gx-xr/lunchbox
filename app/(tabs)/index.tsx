// app/(tabs)/index.tsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { fetchAccountAndPositions } from '../../services/account';
import { fetchIndexPrices, fetchNearFutureCode } from '../../services/market';
import { AccountInfo, Position, IndexPrice, AutoOrderType } from '../../types/trading';
import AutoMonitorCard from '../../components/AutoMonitorCard';
import AutoSetupSheet from '../../components/AutoSetupSheet';
import CallAutoSetupSheet from '../../components/CallAutoSetupSheet';
import {
  getMarketFromCode,
  isFuturesCode,
  isCallCode,
  isPutCode,
} from '../../constants/marketCodes';
 
// ════════════════════════════════════════
// ── 상수 ────────────────────────────────
// ════════════════════════════════════════
const AUTO_ORDER_ITEMS: { type: AutoOrderType; label: string }[] = [
  { type: 'KOSPI200_PUT_SELL', label: '코스피 200\n위클리 옵션' },
  { type: 'KOSDAQ150_PUT_SELL', label: '코스닥 150\n위클리 옵션' },
  { type: 'KOSPI200_FUT_BUY', label: '코스피 200\n선물' },
  { type: 'KOSDAQ150_FUT_BUY', label: '코스닥 150\n선물' },
];
 
// ════════════════════════════════════════
// ── 유틸 함수 ───────────────────────────
// ════════════════════════════════════════
 
// ─── 금액 포맷 ───────────────────────────────────────────────
function formatAmount(n: number): string {
  return n.toLocaleString('ko-KR');
}
 
// ─── position.name에서 weekKey 파싱 ─────────────────────────
// 예: "C 목 W3 1,165.0" → "W3THU", "P 월 W2 1,120.0" → "W2MON"
function parseWeekKey(name: string): string {
  const match = name.match(/W(\d)\s*(목|월)/);
  if (!match) return '';
  const weekNum = match[1];
  const day = match[2] === '목' ? 'THU' : 'MON';
  return `W${weekNum}${day}`;
}
 
// ════════════════════════════════════════
// ── 보유 포지션 카드 컴포넌트 ────────────
// ════════════════════════════════════════
function PositionCard({
  position, onPutAutoRegister, onCallAutoRegister, token,
}: {
  position: Position;
  onPutAutoRegister: (position: Position) => void;
  onCallAutoRegister: (position: Position) => void;
  token: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isProfit = position.evalPnl >= 0;
  const router = useRouter();
 
  // ─── 종목코드 기반 판별 (종목명 무관) ───────────────────────
  const isFutures = isFuturesCode(position.code);
  const isCall = isCallCode(position.code);
  const isPut = isPutCode(position.code);
  const posMarket = getMarketFromCode(position.code);
  const isWeekly = !isFutures && position.name.includes('W');
  const weekKey = isWeekly ? parseWeekKey(position.name) : '';
  const posOptionType = isCall ? 'CALL' : 'PUT';
 
  // ─── 풋매도/콜매도 판별 (종목코드 기반) ─────────────────────
  const isPutSell = isPut && position.side === 'SELL';
  const isCallSell = isCall && position.side === 'SELL';
 
  // ─── 매도/매수 버튼 핸들러 ──────────────────────────────────
  const handleSellPress = () => {
    if (isFutures) {
      router.push({ pathname: '/order/futures', params: { futCode: position.code, market: posMarket, side: 'SELL' } });
    } else {
      router.push({ pathname: '/order/put-order', params: {
        putCode: position.code,
        actprice: String(position.actprice),
        putPrice: String(position.currentPrice),
        market: posMarket,
        optionType: posOptionType,
        side: 'SELL',
        weekKey,
      }});
    }
  };
 
  const handleBuyPress = () => {
    if (isFutures) {
      router.push({ pathname: '/order/futures', params: { futCode: position.code, market: posMarket, side: 'BUY' } });
    } else {
      router.push({ pathname: '/order/put-order', params: {
        putCode: position.code,
        actprice: String(position.actprice),
        putPrice: String(position.currentPrice),
        market: posMarket,
        optionType: posOptionType,
        side: 'BUY',
        weekKey,
      }});
    }
  };
 
  // ════════════════════════════════════════
  // ── UI 렌더링 ───────────────────────────
  // ════════════════════════════════════════
  return (
    <View style={styles.positionCard}>
      <TouchableOpacity style={styles.positionRow} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={styles.positionLeft}>
          <Text style={styles.positionName} numberOfLines={1}>{position.name}</Text>
          <View style={styles.positionBadgeRow}>
            <View style={[styles.sideBadge, position.side === 'SELL' ? styles.sellBadge : styles.buyBadge]}>
              <Text style={[styles.sideBadgeText, { color: position.side === 'SELL' ? '#3b82f6' : '#ec4899' }]}>
                {position.side === 'SELL' ? '매도' : '매수'}
              </Text>
            </View>
            <Text style={styles.positionQty}>×{position.qty}</Text>
          </View>
        </View>
        <View style={styles.positionRight}>
          <Text style={[styles.positionPnl, { color: isProfit ? '#e53e3e' : '#3182f6' }]}>
            {isProfit ? '+' : ''}{formatAmount(position.evalPnl)}
          </Text>
          <Text style={[styles.positionRate, { color: isProfit ? '#e53e3e' : '#3182f6' }]}>
            {isProfit ? '+' : ''}{position.pnlRate.toFixed(2)}%
          </Text>
        </View>
        <Text style={styles.expandArrow}>{expanded ? '∧' : '∨'}</Text>
      </TouchableOpacity>
 
      {expanded && (
        <View style={styles.positionDetail}>
          <View style={styles.detailDivider} />
 
          {/* ── 상세 정보 그리드 ── */}
          <View style={styles.detailGrid}>
            {([
              ['매매단가', formatAmount(position.avgPrice), undefined],
              ['현재가', formatAmount(position.currentPrice), '#009414'],
              ['잔고', String(position.qty), undefined],
              ['잔여일', position.jandatecnt > 0 ? `${position.jandatecnt}일` : '-', '#ff0000'],
              ['매입금액', formatAmount(position.buyAmt), undefined],
              ['평가금액', formatAmount(position.evalAmt), undefined],
              ['평가손익', (isProfit ? '+' : '') + formatAmount(position.evalPnl), isProfit ? '#f04452' : '#3182f6'],
              ['수익률', (isProfit ? '+' : '') + position.pnlRate.toFixed(2) + '%', isProfit ? '#f04452' : '#3182f6'],
            ] as [string, string, string | undefined][]).map(([label, value, color]) => (
              <View key={label} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={[styles.detailValue, { color: color ?? '#1a1a1a' }]}>{value}</Text>
              </View>
            ))}
          </View>
 
          {/* ── 버튼 행 ── */}
          <View style={styles.positionBtnRow}>
            {/* 차트 버튼 - 추후 추가 */}
            <TouchableOpacity style={styles.chartBtn} disabled activeOpacity={0.5}>
              <Text style={styles.chartBtnText}>📊 차트</Text>
            </TouchableOpacity>
 
            {/* 매도 버튼 */}
            <TouchableOpacity style={styles.sellBtn} onPress={handleSellPress} activeOpacity={0.8}>
              <Text style={styles.sellBtnText}>매도</Text>
            </TouchableOpacity>
 
            {/* 매수 버튼 */}
            <TouchableOpacity style={styles.buyBtn} onPress={handleBuyPress} activeOpacity={0.8}>
              <Text style={styles.buyBtnText}>매수</Text>
            </TouchableOpacity>
 
            {/* 자동화 버튼 - 풋매도/콜매도만 */}
            {isPutSell && (
              <TouchableOpacity style={styles.autoBtn} onPress={() => onPutAutoRegister(position)} activeOpacity={0.8}>
                <Text style={styles.autoBtnText}>🤖 자동화</Text>
              </TouchableOpacity>
            )}
            {isCallSell && (
              <TouchableOpacity style={styles.autoBtn} onPress={() => onCallAutoRegister(position)} activeOpacity={0.8}>
                <Text style={styles.autoBtnText}>🤖 자동화</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
 
// ════════════════════════════════════════
// ── 지수 카드 컴포넌트 ──────────────────
// ════════════════════════════════════════
function IndexCard({ index }: { index: IndexPrice }) {
  return (
    <View style={styles.indexCard}>
      <Text style={styles.indexName}>{index.name}</Text>
      <View style={styles.indexRight}>
        <Text style={[styles.indexPrice, { color: index.isUp ? '#e53e3e' : '#3182f6' }]}>{formatAmount(index.price)}</Text>
        <Text style={[styles.indexChange, { color: index.isUp ? '#e53e3e' : '#3182f6' }]}>
          {index.isUp ? '▲' : '▼'} {Math.abs(index.change).toFixed(2)} ({Math.abs(index.changeRate).toFixed(2)}%)
        </Text>
      </View>
    </View>
  );
}
 
// ════════════════════════════════════════
// ── 홈 화면 메인 ────────────────────────
// ════════════════════════════════════════
export default function HomeScreen() {
  const router = useRouter();
  const { token, logout, setAcntNo } = useAuthStore();
 
  // ─── State 선언 ──────────────────────────────────────────
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [kospi200, setKospi200] = useState<IndexPrice | null>(null);
  const [kosdaq150, setKosdaq150] = useState<IndexPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
 
  // ─── 풋매도 자동화 시트 State ────────────────────────────
  // ✅ qty, jandatecnt 추가
  const [autoSheet, setAutoSheet] = useState<{
    visible: boolean; putCode: string; putName: string;
    actprice: number; currentPrice: number; market: 'KOSPI200' | 'KOSDAQ150';
    weekKey: string; qty: number; jandatecnt: number;
  }>({ visible: false, putCode: '', putName: '', actprice: 0, currentPrice: 0, market: 'KOSPI200', weekKey: '', qty: 1, jandatecnt: 0 });
 
  // ─── 콜매도 자동화 시트 State ────────────────────────────
  // ✅ qty, jandatecnt 추가
  const [callAutoSheet, setCallAutoSheet] = useState<{
    visible: boolean; callCode: string; callName: string;
    actprice: number; currentPrice: number; market: 'KOSPI200' | 'KOSDAQ150';
    weekKey: string; qty: number; jandatecnt: number;
  }>({ visible: false, callCode: '', callName: '', actprice: 0, currentPrice: 0, market: 'KOSPI200', weekKey: '', qty: 1, jandatecnt: 0 });
 
  // ─── 데이터 로드 ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [acctResult] = await Promise.all([
        fetchAccountAndPositions(token),
        fetchNearFutureCode(token),
      ]);
      if (acctResult) {
        setAccount(acctResult.account);
        setPositions(acctResult.positions);
        setAcntNo(acctResult.account.acntNo);
      }
      const indexResult = await fetchIndexPrices(token);
      setKospi200(indexResult.kospi200);
      setKosdaq150(indexResult.kosdaq150);
    } catch (e) {
      console.log('홈 데이터 로드 에러:', e);
    }
  }, [token]);
 
  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const timer = setInterval(() => { loadData(); }, 15000);
    return () => clearInterval(timer);
  }, [loadData]);
 
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);
 
  // ─── 풋매도 자동화 등록 ──────────────────────────────────
  // ✅ qty, jandatecnt 추가
  const handlePutAutoRegister = useCallback((position: Position) => {
    const market = getMarketFromCode(position.code);
    const weekKey = parseWeekKey(position.name);
    setAutoSheet({
      visible: true,
      putCode: position.code,
      putName: position.name,
      actprice: position.actprice,
      currentPrice: position.avgPrice,
      market,
      weekKey,
      qty: position.qty,           // ✅ 풋옵션 계약수
      jandatecnt: position.jandatecnt, // ✅ 잔여일
    });
  }, []);
 
  // ─── 콜매도 자동화 등록 ──────────────────────────────────
  // ✅ qty, jandatecnt 추가
  const handleCallAutoRegister = useCallback((position: Position) => {
    const market = getMarketFromCode(position.code);
    const weekKey = parseWeekKey(position.name);
    setCallAutoSheet({
      visible: true,
      callCode: position.code,
      callName: position.name,
      actprice: position.actprice,
      currentPrice: position.avgPrice,
      market,
      weekKey,
      qty: position.qty,            // ✅ 콜옵션 계약수
      jandatecnt: position.jandatecnt, // ✅ 잔여일
    });
  }, []);
 
  // ─── 바로가기 버튼 핸들러 ────────────────────────────────
  const handleAutoOrder = (type: AutoOrderType) => {
    if (type === 'KOSDAQ150_PUT_SELL') router.push('/order/kosdaq-options');
    else if (type === 'KOSPI200_PUT_SELL') router.push('/order/kospi-options');
    else if (type === 'KOSPI200_FUT_BUY') router.push('/order/futures?market=KOSPI200');
    else if (type === 'KOSDAQ150_FUT_BUY') router.push('/order/futures?market=KOSDAQ150');
    else Alert.alert('준비 중', '곧 추가될 예정입니다.');
  };
 
  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#3182f6" /></View>;
  }
 
  // ════════════════════════════════════════
  // ── UI 렌더링 ───────────────────────────
  // ════════════════════════════════════════
  return (
    <>
      <ScrollView
        style={styles.container} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 헤더 ── */}
        <View style={styles.header}>
          <Text style={styles.appTitle}>🌱이삭줍기🌱</Text>
          <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
            <Text style={styles.logoutBtn}>로그아웃</Text>
          </TouchableOpacity>
        </View>
 
        {/* ── 계좌 카드 ── */}
        <View style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <Text style={styles.accountLabel}>내 계좌</Text>
            <Text style={styles.accountNo} numberOfLines={1}>{account?.acntNo ?? '-'}  {account?.acntNm ?? ''}</Text>
          </View>
          <Text style={styles.accountAmount}>{formatAmount(account?.ordAblAmt ?? 0)}원</Text>
          <Text style={styles.accountSubLabel}>총 자산 (주문가능금액)</Text>
        </View>
 
        {/* ── 보유 포지션 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>보유 포지션</Text>
          {positions.length === 0 ? (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>보유 중인 포지션이 없습니다</Text></View>
          ) : (
            positions.map((pos) => (
              <PositionCard
                key={`${pos.code}-${pos.side}`}
                position={pos}
                onPutAutoRegister={handlePutAutoRegister}
                onCallAutoRegister={handleCallAutoRegister}
                token={token ?? ''}
              />
            ))
          )}
        </View>
 
        {/* ── 실시간 지수 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>실시간 지수</Text>
          {kospi200 && <IndexCard index={kospi200} />}
          {kosdaq150 && <IndexCard index={kosdaq150} />}
          {!kospi200 && !kosdaq150 && (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>지수 데이터를 불러올 수 없습니다</Text></View>
          )}
        </View>
 
        {/* ── 자동화 모니터 카드 ── */}
        <AutoMonitorCard />
 
        {/* ── 바로가기 ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>바로가기</Text>
          <View style={styles.autoOrderGrid}>
            {AUTO_ORDER_ITEMS.map((item) => (
              <TouchableOpacity key={item.type} style={styles.autoOrderBtn} onPress={() => handleAutoOrder(item.type)} activeOpacity={0.7}>
                <Text style={styles.autoOrderText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
 
        <View style={{ height: 32 }} />
      </ScrollView>
 
      {/* ── 풋매도 자동화 시트 ── */}
      {/* ✅ qty, jandatecnt 추가 */}
      <AutoSetupSheet
        visible={autoSheet.visible}
        onClose={() => setAutoSheet(prev => ({ ...prev, visible: false }))}
        putCode={autoSheet.putCode}
        putName={autoSheet.putName}
        actprice={autoSheet.actprice}
        currentPrice={autoSheet.currentPrice}
        market={autoSheet.market}
        weekKey={autoSheet.weekKey}
        qty={autoSheet.qty}
        jandatecnt={autoSheet.jandatecnt}
      />
 
      {/* ── 콜매도 자동화 시트 ── */}
      {/* ✅ qty, jandatecnt 추가 */}
      <CallAutoSetupSheet
        visible={callAutoSheet.visible}
        onClose={() => setCallAutoSheet(prev => ({ ...prev, visible: false }))}
        callCode={callAutoSheet.callCode}
        callName={callAutoSheet.callName}
        actprice={callAutoSheet.actprice}
        currentPrice={callAutoSheet.currentPrice}
        market={callAutoSheet.market}
        weekKey={callAutoSheet.weekKey}
        qty={callAutoSheet.qty}
        jandatecnt={callAutoSheet.jandatecnt}
      />
    </>
  );
}
 
// ════════════════════════════════════════
// ── 스타일 ──────────────────────────────
// ════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  content: { paddingHorizontal: 20, paddingTop: 56 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f6f8' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  appTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a' },
  logoutBtn: { fontSize: 13, color: '#aaa' },
  accountCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  accountLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  accountNo: { fontSize: 12, color: '#aaa', flex: 1 },
  accountAmount: { fontSize: 32, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  accountSubLabel: { fontSize: 12, color: '#aaa' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  emptyBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  emptyText: { fontSize: 14, color: '#bbb' },
  positionCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden' },
  positionRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  positionLeft: { flex: 1 },
  positionName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  positionBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartBtn: { flex: 1, backgroundColor: '#f0f0f0', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: 0.5 },
  chartBtnText: { fontSize: 13, fontWeight: '700', color: '#aaa' },
  sellBtn: { flex: 1, backgroundColor: '#3182f6', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  sellBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  buyBtn: { flex: 1, backgroundColor: '#f04452', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buyBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  autoBtn: { flex: 1, backgroundColor: '#0ca320', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  autoBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sideBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sellBadge: { backgroundColor: '#dbeafe' },
  buyBadge: { backgroundColor: '#fce7f3' },
  sideBadgeText: { fontSize: 12, fontWeight: '600' },
  positionQty: { fontSize: 12, color: '#888' },
  positionRight: { alignItems: 'flex-end' },
  positionPnl: { fontSize: 16, fontWeight: '700' },
  positionRate: { fontSize: 12, marginTop: 2 },
  expandArrow: { fontSize: 12, color: '#bbb', marginLeft: 4 },
  positionDetail: { paddingHorizontal: 16, paddingBottom: 16 },
  detailDivider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 12 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  detailItem: { width: '45%' },
  detailLabel: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  detailValue: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  positionBtnRow: { flexDirection: 'row', gap: 8 },
  indexCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  indexName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  indexRight: { alignItems: 'flex-end' },
  indexPrice: { fontSize: 18, fontWeight: '800' },
  indexChange: { fontSize: 12, marginTop: 2 },
  autoOrderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  autoOrderBtn: { width: '47.5%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 90 },
  autoOrderText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', lineHeight: 22 },
});