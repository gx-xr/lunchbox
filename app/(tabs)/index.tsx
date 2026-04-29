import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { fetchAccountAndPositions } from '../../services/account';
import { fetchIndexPrices, fetchNearFutureCode } from '../../services/market';
import { placeFuturesOrder } from '../../services/order';
import { AccountInfo, Position, IndexPrice, AutoOrderType } from '../../types/trading';
import AutoMonitorCard from '../../components/AutoMonitorCard';
import AutoSetupSheet from '../../components/AutoSetupSheet';
import { reinitAutoTradingStore } from '../../store/autoTradingStore';
 
const AUTO_ORDER_ITEMS: { type: AutoOrderType; label: string }[] = [
  { type: 'KOSPI200_PUT_SELL', label: '코스피 200\n위클리 풋옵션 매도' },
  { type: 'KOSDAQ150_PUT_SELL', label: '코스닥 150\n위클리 풋옵션 매도' },
  { type: 'KOSPI200_FUT_BUY', label: '코스피 200\n선물 매수' },
  { type: 'KOSDAQ150_FUT_BUY', label: '코스닥 150\n선물 매수' },
];
 
function formatAmount(n: number): string {
  return n.toLocaleString('ko-KR');
}
 
function PositionCard({
  position, onAutoRegister, token,
}: {
  position: Position;
  onAutoRegister: (position: Position) => void;
  token: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [liquidating, setLiquidating] = useState(false);
  const isProfit = position.evalPnl >= 0;
  const isPutSell = position.side === 'SELL' && position.name.includes('P ');
 
  // 청산 핸들러
  const handleLiquidate = useCallback(() => {
    const oppositeSide = position.side === 'SELL' ? '매수' : '매도';
    Alert.alert(
      '⚡ 청산',
      `${position.name}\n${position.qty}계약 시장가 ${oppositeSide}로 청산하시겠습니까?`,
      [
        { text: '아니오', style: 'cancel' },
        {
          text: '청산하기',
          style: 'destructive',
          onPress: async () => {
            setLiquidating(true);
            try {
              const result = await placeFuturesOrder(token, {
                fnoIsuNo: position.code,
                bnsTpCode: position.side === 'SELL' ? '2' : '1', // 반대 방향
                orderType: '03', // 시장가
                price: 0,
                qty: position.qty,
                trdPtnCode: '03', // 청산
              });
              if (result.success) {
                Alert.alert('완료', `청산 주문 접수\n주문번호: ${result.ordNo}`);
              } else {
                Alert.alert('실패', result.message);
              }
            } catch (e) {
              Alert.alert('오류', '청산 중 문제가 발생했습니다.');
            } finally {
              setLiquidating(false);
            }
          },
        },
      ]
    );
  }, [token, position]);
 
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
          <View style={styles.detailGrid}>
            {[
              ['평균가', formatAmount(position.avgPrice)],
              ['잔고', String(position.qty)],
              ['매입금액', formatAmount(position.buyAmt)],
              ['평가금액', formatAmount(position.evalAmt)],
              ['평가손익', (isProfit ? '+' : '') + formatAmount(position.evalPnl)],
              ['수익률', (isProfit ? '+' : '') + position.pnlRate.toFixed(2) + '%'],
            ].map(([label, value]) => (
              <View key={label} style={styles.detailItem}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={[styles.detailValue,
                  (label === '평가손익' || label === '수익률') ? { color: isProfit ? '#e53e3e' : '#3182f6' } : {}
                ]}>{value}</Text>
              </View>
            ))}
          </View>
 
          {/* 버튼 영역 */}
          <View style={styles.positionBtnRow}>
            {/* 청산 버튼 — 항상 표시 */}
            <TouchableOpacity
              style={[styles.liquidateBtn, liquidating && styles.btnDisabled]}
              onPress={handleLiquidate}
              disabled={liquidating}
              activeOpacity={0.8}
            >
              {liquidating
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.liquidateBtnText}>⚡ 청산</Text>
              }
            </TouchableOpacity>
 
            {/* 자동화 등록 — 풋옵션 매도만 */}
            {isPutSell && (
              <TouchableOpacity
                style={styles.autoRegisterBtn}
                onPress={() => onAutoRegister(position)}
                activeOpacity={0.8}
              >
                <Text style={styles.autoRegisterText}>🤖 자동화</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
 
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
 
export default function HomeScreen() {
  const router = useRouter();
  const { token, logout, setAcntNo } = useAuthStore();
 
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [kospi200, setKospi200] = useState<IndexPrice | null>(null);
  const [kosdaq150, setKosdaq150] = useState<IndexPrice | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoSheet, setAutoSheet] = useState<{
    visible: boolean; putCode: string; putName: string;
    actprice: number; currentPrice: number; market: 'KOSPI200' | 'KOSDAQ150';
  }>({ visible: false, putCode: '', putName: '', actprice: 0, currentPrice: 0, market: 'KOSPI200' });
 
  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [acctResult, futCode] = await Promise.all([
        fetchAccountAndPositions(token),
        fetchNearFutureCode(token),
      ]);
      if (acctResult) {
        setAccount(acctResult.account);
        setPositions(acctResult.positions);
        setAcntNo(acctResult.account.acntNo);
      }
      const indexResult = await fetchIndexPrices(token, futCode);
      setKospi200(indexResult.kospi200);
      setKosdaq150(indexResult.kosdaq150);
    } catch (e) {
      console.log('홈 데이터 로드 에러:', e);
    }
  }, [token]);
 
  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);
 
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);
 
  const handleAutoRegister = useCallback((position: Position) => {
    const market: 'KOSPI200' | 'KOSDAQ150' = position.name.includes('코스닥') ? 'KOSDAQ150' : 'KOSPI200';
    const parts = position.name.trim().split(' ');
    const actprice = parseFloat(parts[parts.length - 1].replace(/,/g, '')) || 0;
    setAutoSheet({
      visible: true,
      putCode: position.code,
      putName: position.name,
      actprice,
      currentPrice: position.avgPrice,
      market,
    });
  }, []);
 
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
 
  return (
    <>
      <ScrollView
        style={styles.container} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.appTitle}>🌱이삭줍기🌱</Text>
          <TouchableOpacity onPress={async () => { await logout(); router.replace('/login'); }}>
            <Text style={styles.logoutBtn}>로그아웃</Text>
          </TouchableOpacity>
        </View>
 
        <View style={styles.accountCard}>
          <View style={styles.accountHeader}>
            <Text style={styles.accountLabel}>내 계좌</Text>
            <Text style={styles.accountNo} numberOfLines={1}>{account?.acntNo ?? '-'}  {account?.acntNm ?? ''}</Text>
          </View>
          <Text style={styles.accountAmount}>{formatAmount(account?.ordAblAmt ?? 0)}원</Text>
          <Text style={styles.accountSubLabel}>총 자산 (주문가능금액)</Text>
        </View>
 
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>보유 포지션</Text>
          {positions.length === 0 ? (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>보유 중인 포지션이 없습니다</Text></View>
          ) : (
            positions.map((pos) => (
              <PositionCard
                key={`${pos.code}-${pos.side}`}
                position={pos}
                onAutoRegister={handleAutoRegister}
                token={token ?? ''}
              />
            ))
          )}
        </View>
 
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>실시간 지수</Text>
          {kospi200 && <IndexCard index={kospi200} />}
          {kosdaq150 && <IndexCard index={kosdaq150} />}
          {!kospi200 && !kosdaq150 && (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>지수 데이터를 불러올 수 없습니다</Text></View>
          )}
        </View>
 
        <AutoMonitorCard />
 
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
 
      <AutoSetupSheet
        visible={autoSheet.visible}
        onClose={() => setAutoSheet(prev => ({ ...prev, visible: false }))}
        putCode={autoSheet.putCode}
        putName={autoSheet.putName}
        actprice={autoSheet.actprice}
        currentPrice={autoSheet.currentPrice}
        market={autoSheet.market}
      />
    </>
  );
}
 
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
  liquidateBtn: {
    flex: 1, backgroundColor: '#f97316', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  liquidateBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  autoRegisterBtn: {
    flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  autoRegisterText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
  indexCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  indexName: { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  indexRight: { alignItems: 'flex-end' },
  indexPrice: { fontSize: 18, fontWeight: '800' },
  indexChange: { fontSize: 12, marginTop: 2 },
  autoOrderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  autoOrderBtn: { width: '47.5%', backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 90 },
  autoOrderText: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', lineHeight: 22 },
});