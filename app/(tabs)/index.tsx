import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { fetchAccountSummary } from '../../services/account';
import { fetchOptionBoard } from '../../services/symbol';
import { AccountSummary } from '../../types/trading';

// ─── mock 데이터 (포지션/주문은 아직 mock) ─────────────────
const mockPositions = [
  { code: 'F2606', name: 'KOSPI200 선물 2606', qty: 2, avgPrice: 360.50, currentPrice: 362.50, side: 'BUY' },
  { code: '201C6360', name: '위클리 콜 360.0', qty: 5, avgPrice: 2.80, currentPrice: 3.20, side: 'BUY' },
  { code: '201P6360', name: '위클리 풋 360.0', qty: 3, avgPrice: 2.00, currentPrice: 1.85, side: 'BUY' },
];

const mockOrders = [
  { id: 'ORD001', code: 'F2606', name: 'KOSPI200 선물 2606', side: 'BUY', qty: 1, price: 361.00, status: 'PENDING' },
  { id: 'ORD002', code: '201C6360', name: '위클리 콜 360.0', side: 'BUY', qty: 3, price: 11.20, status: 'PENDING' },
  { id: 'ORD003', code: '201P6370', name: '위클리 풋 370.0', side: 'SELL', qty: 2, price: 15.80, status: 'FILLED' },
  { id: 'ORD004', code: 'F2606', name: 'KOSPI200 선물 2606', side: 'SELL', qty: 1, price: 363.00, status: 'FILLED' },
  { id: 'ORD005', code: '201C6355', name: '위클리 콜 355.0', side: 'BUY', qty: 2, price: 16.00, status: 'CANCELLED' },
];

const mockFutures = { code: 'F2606', name: 'KOSPI200 선물 2606', price: 362.50, change: 1.25, changeRate: 0.35 };

type HomeTab = 'ACCOUNT' | 'POSITION' | 'ORDERS';
type OptionTab = 'CALL' | 'PUT';
type WeeklyDay = 'MON' | 'THU';

function formatKRW(n: number) { return n.toLocaleString('ko-KR') + '원'; }

// ─── 계좌 탭 ───────────────────────────────────────────────
function AccountTab({ account, loading, router }: any) {
  const token = useAuthStore((s) => s.token);
  const [optionTab, setOptionTab] = useState<OptionTab>('CALL');
  const [weeklyDay, setWeeklyDay] = useState<WeeklyDay>('MON');
  const [liveCallOptions, setLiveCallOptions] = useState<any[]>([]);
  const [livePutOptions, setLivePutOptions] = useState<any[]>([]);
  const [optionLoading, setOptionLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setOptionLoading(true);

    Promise.all([
      fetchOptionBoard(token, '', '0'), // 콜
      fetchOptionBoard(token, '', '1'), // 풋
    ]).then(([callData, putData]) => {
      if (callData?.t2301OutBlock1) {
        const filtered = callData.t2301OutBlock1
          .filter((o: any) => ['1', '2', '3'].includes(o.atmgubun))
          .filter((o: any) => parseFloat(o.price) > 0)
          .slice(0, 8);
        setLiveCallOptions(filtered);
      }
      if (putData?.t2301OutBlock1) {
        const filtered = putData.t2301OutBlock1
          .filter((o: any) => ['1', '2', '3'].includes(o.atmgubun))
          .filter((o: any) => parseFloat(o.price) > 0)
          .slice(0, 8);
        setLivePutOptions(filtered);
      }
    }).finally(() => setOptionLoading(false));
  }, [token]);

  const options = optionTab === 'CALL' ? liveCallOptions : livePutOptions;

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      {/* 계좌 요약 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>내 계좌</Text>
        {loading
          ? <ActivityIndicator color="#3182f6" />
          : account && <>
            <Text style={s.totalAsset}>{formatKRW(account.deposit + account.evalProfit)}</Text>
            <Text style={s.totalLabel}>총 자산</Text>
            <View style={s.row}>
              <View style={s.col}>
                <Text style={s.colLabel}>예수금</Text>
                <Text style={s.colValue}>{formatKRW(account.deposit)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.col}>
                <Text style={s.colLabel}>주문가능</Text>
                <Text style={s.colValue}>{formatKRW(account.orderable)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.col}>
                <Text style={s.colLabel}>평가손익</Text>
                <Text style={[s.colValue, account.evalProfit >= 0 ? s.up : s.down]}>
                  {account.evalProfit >= 0 ? '+' : ''}{formatKRW(account.evalProfit)}
                </Text>
              </View>
            </View>
          </>
        }
      </View>

      {/* 선물/옵션 바로가기 */}
      <View style={s.card}>
        <Text style={s.cardTitle}>선물 / 옵션 바로가기</Text>

        {/* 선물 */}
        <TouchableOpacity
          style={s.futuresRow}
          onPress={() => router.push(`/order/${mockFutures.code}`)}
          activeOpacity={0.7}
        >
          <View>
            <Text style={s.futuresName}>{mockFutures.name}</Text>
            <Text style={s.futuresCode}>{mockFutures.code}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.futuresPrice}>{mockFutures.price.toLocaleString()}</Text>
            <Text style={[s.changeText, mockFutures.change >= 0 ? s.up : s.down]}>
              {mockFutures.change >= 0 ? '+' : ''}{mockFutures.change} ({mockFutures.changeRate}%)
            </Text>
          </View>
        </TouchableOpacity>

        {/* 위클리 옵션 헤더 */}
        <View style={s.weeklyHeader}>
          <Text style={s.weeklyTitle}>위클리 옵션 (실시간)</Text>
          <View style={s.toggleGroup}>
            {(['MON', 'THU'] as WeeklyDay[]).map((d) => (
              <TouchableOpacity
                key={d}
                style={[s.toggleBtn, weeklyDay === d && s.toggleActive]}
                onPress={() => setWeeklyDay(d)}
              >
                <Text style={[s.toggleText, weeklyDay === d && s.toggleTextActive]}>
                  {d === 'MON' ? '월' : '목'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 콜/풋 탭 */}
        <View style={s.optionTabRow}>
          <TouchableOpacity
            style={[s.optionTab, optionTab === 'CALL' && s.callActive]}
            onPress={() => setOptionTab('CALL')}
          >
            <Text style={[s.optionTabText, optionTab === 'CALL' && s.callText]}>콜 CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.optionTab, optionTab === 'PUT' && s.putActive]}
            onPress={() => setOptionTab('PUT')}
          >
            <Text style={[s.optionTabText, optionTab === 'PUT' && s.putText]}>풋 PUT</Text>
          </TouchableOpacity>
        </View>

        {/* 옵션 리스트 */}
        <View style={s.optionHeader}>
          <Text style={[s.optionHeaderText, { flex: 1 }]}>행사가</Text>
          <Text style={[s.optionHeaderText, { width: 60, textAlign: 'right' }]}>현재가</Text>
          <Text style={[s.optionHeaderText, { width: 80, textAlign: 'right' }]}>등락률</Text>
        </View>

        {optionLoading
          ? <ActivityIndicator color="#3182f6" style={{ marginVertical: 20 }} />
          : options.length === 0
            ? <Text style={s.emptyText}>데이터 없음</Text>
            : options.map((opt: any) => (
              <TouchableOpacity
                key={opt.optcode}
                style={s.optionRow}
                onPress={() => router.push(`/order/${opt.optcode}`)}
                activeOpacity={0.7}
              >
                <Text style={s.strikeText}>{parseFloat(opt.actprice).toFixed(1)}</Text>
                <Text style={s.optionPrice}>{parseFloat(opt.price).toFixed(2)}</Text>
                <Text style={[s.optionRate, parseFloat(opt.diff) >= 0 ? s.up : s.down]}>
                  {parseFloat(opt.diff) >= 0 ? '+' : ''}{parseFloat(opt.diff).toFixed(2)}%
                </Text>
              </TouchableOpacity>
            ))
        }
      </View>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── 포지션 탭 ─────────────────────────────────────────────
function PositionTab({ router }: any) {
  const totalPL = mockPositions.reduce((sum, p) => sum + (p.currentPrice - p.avgPrice) * p.qty, 0);

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.card}>
        <Text style={s.cardTitle}>보유 포지션</Text>
        <View style={s.plRow}>
          <Text style={s.plLabel}>총 평가손익</Text>
          <Text style={[s.plValue, totalPL >= 0 ? s.up : s.down]}>
            {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(2)}
          </Text>
        </View>
      </View>

      {mockPositions.map((p) => {
        const pl = (p.currentPrice - p.avgPrice) * p.qty;
        const isUp = pl >= 0;
        return (
          <TouchableOpacity
            key={p.code}
            style={s.card}
            onPress={() => router.push(`/order/${p.code}`)}
            activeOpacity={0.7}
          >
            <View style={s.posRow}>
              <View style={{ flex: 1 }}>
                <View style={s.posNameRow}>
                  <View style={[s.sideBadge, p.side === 'BUY' ? s.buyBadge : s.sellBadge]}>
                    <Text style={s.sideBadgeText}>{p.side === 'BUY' ? '매수' : '매도'}</Text>
                  </View>
                  <Text style={s.posName}>{p.name}</Text>
                </View>
                <Text style={s.posDetail}>{p.qty}계약 · 평균 {p.avgPrice.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.posPrice}>{p.currentPrice.toLocaleString()}</Text>
                <Text style={[s.posPL, isUp ? s.up : s.down]}>
                  {isUp ? '+' : ''}{pl.toFixed(2)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── 주문내역 탭 ───────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState(mockOrders);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'FILLED'>('ALL');

  function cancelOrder(id: string) {
    Alert.alert('주문 취소', '이 주문을 취소하시겠습니까?', [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기', style: 'destructive',
        onPress: () => setOrders((prev) =>
          prev.map((o) => o.id === id ? { ...o, status: 'CANCELLED' } : o)
        ),
      },
    ]);
  }

  const filtered = orders.filter((o) => {
    if (filter === 'PENDING') return o.status === 'PENDING';
    if (filter === 'FILLED') return o.status === 'FILLED';
    return true;
  });

  const statusLabel = (st: string) => {
    if (st === 'PENDING') return { text: '미체결', color: '#f59e0b' };
    if (st === 'FILLED') return { text: '체결', color: '#10b981' };
    return { text: '취소', color: '#aaa' };
  };

  return (
    <ScrollView style={{ flex: 1 }}>
      <View style={s.filterRow}>
        {(['ALL', 'PENDING', 'FILLED'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterBtn, filter === f && s.filterActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>
              {f === 'ALL' ? '전체' : f === 'PENDING' ? '미체결' : '체결'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 && <Text style={s.emptyText}>주문 내역이 없습니다.</Text>}

      {filtered.map((order) => {
        const st = statusLabel(order.status);
        return (
          <View key={order.id} style={s.card}>
            <View style={s.orderRow}>
              <View style={{ flex: 1 }}>
                <View style={s.orderNameRow}>
                  <View style={[s.sideBadge, order.side === 'BUY' ? s.buyBadge : s.sellBadge]}>
                    <Text style={s.sideBadgeText}>{order.side === 'BUY' ? '매수' : '매도'}</Text>
                  </View>
                  <Text style={s.orderName}>{order.name}</Text>
                </View>
                <Text style={s.orderDetail}>{order.qty}계약 · {order.price.toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <View style={[s.statusBadge, { backgroundColor: st.color + '20' }]}>
                  <Text style={[s.statusText, { color: st.color }]}>{st.text}</Text>
                </View>
                {order.status === 'PENDING' && (
                  <TouchableOpacity style={s.cancelBtn} onPress={() => cancelOrder(order.id)}>
                    <Text style={s.cancelBtnText}>취소</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        );
      })}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── 메인 홈 화면 ──────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HomeTab>('ACCOUNT');

  async function loadAccount() {
    if (!token) return;
    const data = await fetchAccountSummary(token);
    setAccount(data);
  }

  async function onRefresh() {
    setRefreshing(true);
    await loadAccount();
    setRefreshing(false);
  }

  useEffect(() => {
    loadAccount().finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Lunchbox</Text>
      </View>

      {/* 상단 탭 */}
      <View style={s.tabBar}>
        {([
          { key: 'ACCOUNT', label: '계좌' },
          { key: 'POSITION', label: '포지션' },
          { key: 'ORDERS', label: '주문내역' },
        ] as { key: HomeTab; label: string }[]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tabBtn, activeTab === tab.key && s.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 탭 콘텐츠 */}
      <View style={{ flex: 1, backgroundColor: '#f5f6f8' }}>
        {activeTab === 'ACCOUNT' && (
          <AccountTab account={account} loading={loading} router={router} />
        )}
        {activeTab === 'POSITION' && <PositionTab router={router} />}
        {activeTab === 'ORDERS' && <OrdersTab />}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#f5f6f8' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a' },

  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    paddingHorizontal: 16,
  },
  tabBtn: { paddingVertical: 12, paddingHorizontal: 16, marginRight: 4 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#1a1a1a' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#bbb' },
  tabTextActive: { color: '#1a1a1a' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    marginHorizontal: 16, marginTop: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  cardTitle: { fontSize: 13, color: '#888', fontWeight: '600', marginBottom: 14 },

  totalAsset: { fontSize: 28, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  totalLabel: { fontSize: 12, color: '#aaa', marginBottom: 14 },
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f5f5f5', paddingTop: 14 },
  col: { flex: 1, alignItems: 'center' },
  divider: { width: 1, backgroundColor: '#f0f0f0' },
  colLabel: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  colValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },

  futuresRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 16,
  },
  futuresName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  futuresCode: { fontSize: 12, color: '#aaa' },
  futuresPrice: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 2 },
  changeText: { fontSize: 12, fontWeight: '600' },

  weeklyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weeklyTitle: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  toggleGroup: { flexDirection: 'row', gap: 6 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f5f6f8' },
  toggleActive: { backgroundColor: '#1a1a1a' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  toggleTextActive: { color: '#fff' },

  optionTabRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  optionTab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f5f6f8', alignItems: 'center' },
  callActive: { backgroundColor: '#fff0f1' },
  putActive: { backgroundColor: '#eff5ff' },
  optionTabText: { fontSize: 13, fontWeight: '700', color: '#ccc' },
  callText: { color: '#f04452' },
  putText: { color: '#3182f6' },
  optionHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 4 },
  optionHeaderText: { fontSize: 11, color: '#aaa', fontWeight: '600' },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' },
  strikeText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  optionPrice: { width: 60, fontSize: 14, fontWeight: '700', color: '#1a1a1a', textAlign: 'right' },
  optionRate: { width: 80, fontSize: 13, fontWeight: '600', textAlign: 'right' },

  plRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plLabel: { fontSize: 13, color: '#888' },
  plValue: { fontSize: 20, fontWeight: '800' },
  posRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  posNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  posName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  posDetail: { fontSize: 12, color: '#aaa' },
  posPrice: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  posPL: { fontSize: 13, fontWeight: '700' },

  sideBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  buyBadge: { backgroundColor: '#fff0f1' },
  sellBadge: { backgroundColor: '#eff5ff' },
  sideBadgeText: { fontSize: 11, fontWeight: '700' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f5f6f8' },
  filterActive: { backgroundColor: '#1a1a1a' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  filterTextActive: { color: '#fff' },
  emptyText: { textAlign: 'center', color: '#bbb', fontSize: 14, marginTop: 40 },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  orderName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  orderDetail: { fontSize: 12, color: '#aaa' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#f04452' },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: '#f04452' },

  up: { color: '#f04452' },
  down: { color: '#3182f6' },
});