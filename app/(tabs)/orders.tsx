/**
 * app/(tabs)/orders.tsx
 * 주문내역 — 기간별 검색 + 빠른선택 버튼 + 달력 피커
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator, RefreshControl,
  Alert, TextInput, Modal, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../../store/authStore';
import {
  cancelFuturesOrder, placeFuturesOrder,
  fetchFuturesOrders, fetchPeriodOrders,
  FuturesOrderItem, PeriodOrderItem,
} from '../../services/order';
 
type FilterTab = '전체' | '체결' | '미체결';
type QuickRange = '오늘' | '1주일' | '1개월' | '직접입력';
 
interface UnifiedOrder {
  id: string;
  isuNm: string;
  isuCode: string;
  bnsTpNm: string;
  ordPrc: number;
  execPrc: number;
  ordQty: number;
  execQty: number;
  unercQty: number;
  ordTime: string;
  ordDt: string;
  bnsplAmt: number;
  mrcTpNm: string;
  isPending: boolean;
  isFilled: boolean;
  isCancelled: boolean;
  rawTodayOrder?: FuturesOrderItem;
}
 
// ─── 날짜 유틸 ─────────────────────────────────────────────
function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
 
function formatDisplayDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
 
function formatTime(s: string): string {
  const t = s.replace(/\D/g, '');
  if (t.length >= 6) return `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  if (t.length >= 4) return `${t.slice(0, 2)}:${t.slice(2, 4)}`;
  return s;
}
 
function getQuickDates(range: QuickRange): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  if (range === '1주일') start.setDate(end.getDate() - 7);
  else if (range === '1개월') start.setMonth(end.getMonth() - 1);
  return { start, end };
}
 
// ─── t0434 → UnifiedOrder ──────────────────────────────────
function todayToUnified(o: FuturesOrderItem, nameMap: Record<string, string>): UnifiedOrder {
  const isCancelOrder = o.medosu?.includes('취소') || o.status?.includes('취소');
  const isBuy = !isCancelOrder && (o.medosu === '매수' || o.medosu === '2');
  const isPending = !isCancelOrder && o.ordrem > 0;
  const isFilled = !isCancelOrder && o.cheqty > 0 && o.ordrem === 0;
  const displaySide = isCancelOrder
    ? (o.medosu?.includes('매수') ? '매수' : '매도')
    : (isBuy ? '매수' : '매도');
  return {
    id: `today-${o.ordno}`,
    isuNm: o.hname || nameMap[o.expcode] || o.expcode,
    isuCode: o.expcode,
    bnsTpNm: displaySide,
    ordPrc: o.price,
    execPrc: o.cheprice,
    ordQty: o.qty,
    execQty: o.cheqty,
    unercQty: o.ordrem,
    ordTime: formatTime(o.ordtime),
    ordDt: '오늘',
    bnsplAmt: 0,
    mrcTpNm: isCancelOrder ? '취소' : '',
    isPending,
    isFilled,
    isCancelled: isCancelOrder,
    rawTodayOrder: isCancelOrder ? undefined : o,
  };
}
 
// ─── CFOAQ00600 → UnifiedOrder ─────────────────────────────
function periodToUnified(o: PeriodOrderItem): UnifiedOrder {
  const isPending = o.unercQty > 0;
  const isFilled = o.execQty > 0 && o.unercQty === 0;
  const isCancelled = o.mrcTpNm?.includes('취소') || (o.execQty === 0 && o.unercQty === 0);
  const mm = o.ordDt.slice(4, 6);
  const dd = o.ordDt.slice(6, 8);
  return {
    id: `period-${o.ordDt}-${o.ordNo}`,
    isuNm: o.isuNm || o.fnoIsuNo,
    isuCode: o.fnoIsuNo,
    bnsTpNm: o.bnsTpNm || '',
    ordPrc: o.ordPrc,
    execPrc: o.execPrc,
    ordQty: o.ordQty,
    execQty: o.execQty,
    unercQty: o.unercQty,
    ordTime: formatTime(o.ordTime),
    ordDt: `${mm}.${dd}`,
    bnsplAmt: o.bnsplAmt,
    mrcTpNm: o.mrcTpNm || '',
    isPending,
    isFilled,
    isCancelled,
  };
}
 
// ─── 종목명 맵 ─────────────────────────────────────────────
const BASE_URL = 'https://openapi.ls-sec.co.kr:8080';
async function fetchNameMap(token: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const post = async (trCd: string, body: object) => {
      const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': trCd, 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify(body),
      });
      return res.json();
    };
    const kospi = await post('t8433', { t8433InBlock: { dummy: '' } });
    for (const item of (kospi.t8433OutBlock ?? [])) {
      if (item.expcode) map[item.expcode] = item.hname;
      if (item.shcode) map[item.shcode] = item.hname;
    }
    const kosdaq = await post('t8435', { t8435InBlock: { gubun: 'QW' } });
    for (const item of (kosdaq.t8435OutBlock ?? [])) {
      if (item.expcode) map[item.expcode] = item.hname;
      if (item.shcode) map[item.shcode] = item.hname;
    }
    const futKospi = await post('t8432', { t8432InBlock: { dummy: '' } });
    for (const item of (futKospi.t8432OutBlock ?? [])) {
      if (item.shcode) map[item.shcode] = item.hname;
    }
    const futKosdaq = await post('t8435', { t8435InBlock: { gubun: 'SF' } });
    for (const item of (futKosdaq.t8435OutBlock ?? [])) {
      if (item.shcode) map[item.shcode] = item.hname;
    }
  } catch {}
  return map;
}
 
async function fetchTodayNames(token: string, codes: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (codes.length === 0) return map;
  try {
    const uniqueCodes = [...new Set(codes)].slice(0, 20);
    await Promise.all(uniqueCodes.map(async (focode) => {
      try {
        const res = await fetch(`${BASE_URL}/futureoption/market-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't2101', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t2101InBlock: { focode } }),
        });
        const data = await res.json();
        const hname = data.t2101OutBlock?.hname;
        if (hname) map[focode] = hname;
      } catch {}
    }));
  } catch {}
  return map;
}
 
// ─── 정정 모달 ─────────────────────────────────────────────
function ModifyModal({ visible, order, onClose, onConfirm }: {
  visible: boolean; order: UnifiedOrder | null;
  onClose: () => void; onConfirm: (newPrice: number, newQty: number) => void;
}) {
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  useEffect(() => {
    if (order) { setPrice(String(order.ordPrc)); setQty(String(order.unercQty)); }
  }, [order]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <Text style={ms.title}>주문 정정</Text>
          {order && <Text style={ms.subTitle} numberOfLines={1}>{order.isuNm}</Text>}
          <View style={ms.inputRow}>
            <Text style={ms.inputLabel}>정정 가격</Text>
            <TextInput style={ms.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="가격 입력" />
          </View>
          <View style={ms.inputRow}>
            <Text style={ms.inputLabel}>정정 수량</Text>
            <TextInput style={ms.input} value={qty} onChangeText={setQty} keyboardType="numeric" placeholder="수량 입력" />
          </View>
          <View style={ms.btnRow}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose}>
              <Text style={ms.cancelBtnText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.confirmBtn} onPress={() => {
              const p = parseFloat(price), q = parseInt(qty, 10);
              if (!p || !q || q <= 0) { Alert.alert('입력 오류', '올바른 가격과 수량을 입력해주세요.'); return; }
              onConfirm(p, q);
            }}>
              <Text style={ms.confirmBtnText}>정정 접수</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
 
// ─── 주문 카드 ─────────────────────────────────────────────
function OrderCard({ order, onModify, onCancel }: {
  order: UnifiedOrder; onModify: (o: UnifiedOrder) => void; onCancel: (o: UnifiedOrder) => void;
}) {
  const isBuy = order.bnsTpNm?.includes('매수');
  const fillRate = order.ordQty > 0 ? Math.round((order.execQty / order.ordQty) * 100) : 0;
  const hasPnl = order.bnsplAmt !== 0;
  const isToday = order.ordDt === '오늘';
  const statusInfo = order.isCancelled
    ? { text: '취소', color: '#aaa', bg: '#f5f5f5' }
    : order.mrcTpNm?.includes('정정')
    ? { text: '정정', color: '#8b5cf6', bg: '#f5f3ff' }
    : order.isPending
    ? { text: '미체결', color: '#f59e0b', bg: '#fffbeb' }
    : order.isFilled
    ? { text: '체결', color: '#10b981', bg: '#f0fdf4' }
    : { text: '완료', color: '#aaa', bg: '#f5f5f5' };
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.orderName} numberOfLines={1}>{order.isuNm}</Text>
          <Text style={styles.orderMeta}>
            {order.isuCode ? `${order.isuCode} · ` : ''}{order.ordDt} · {order.ordTime}
          </Text>
        </View>
        <View style={styles.cardRight}>
          {isToday && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>오늘</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
            <Text style={[styles.statusText, { color: statusInfo.color }]}>{statusInfo.text}</Text>
          </View>
          <View style={[styles.sideBadge, isBuy ? styles.buyBadge : styles.sellBadge]}>
            <Text style={[styles.sideBadgeText, { color: isBuy ? '#ec4899' : '#3b82f6' }]}>
              {isBuy ? '매수' : '매도'}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.cardMid}>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>주문가</Text>
          <Text style={styles.infoValue}>{order.ordPrc > 0 ? order.ordPrc.toLocaleString() : '-'}</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>체결가</Text>
          <Text style={[styles.infoValue, { color: order.execPrc > 0 ? '#1a1a1a' : '#aaa' }]}>
            {order.execPrc > 0 ? order.execPrc.toLocaleString() : '-'}
          </Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>주문</Text>
          <Text style={styles.infoValue}>{order.ordQty}계약</Text>
        </View>
        <View style={styles.infoItem}>
          <Text style={styles.infoLabel}>체결</Text>
          <Text style={[styles.infoValue, { color: order.execQty > 0 ? '#10b981' : '#aaa' }]}>
            {order.execQty}계약
          </Text>
        </View>
      </View>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${fillRate}%` as any }]} />
      </View>
      {hasPnl && (
        <View style={styles.pnlRow}>
          <Text style={styles.pnlLabel}>매매손익</Text>
          <Text style={[styles.pnlValue, { color: order.bnsplAmt >= 0 ? '#e53e3e' : '#3182f6' }]}>
            {order.bnsplAmt >= 0 ? '+' : ''}{order.bnsplAmt.toLocaleString()}원
          </Text>
        </View>
      )}
      {order.isPending && !order.isCancelled && order.rawTodayOrder && (
        <>
          <View style={styles.actionDivider} />
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.modifyBtn} onPress={() => onModify(order)}>
              <Text style={styles.modifyBtnText}>✏️ 정정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelOrderBtn} onPress={() => onCancel(order)}>
              <Text style={styles.cancelOrderBtnText}>✕ 취소</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
 
// ─── 메인 화면 ─────────────────────────────────────────────
export default function OrdersScreen() {
  const { token } = useAuthStore();
  const [filterTab, setFilterTab] = useState<FilterTab>('전체');
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modifyTarget, setModifyTarget] = useState<UnifiedOrder | null>(null);
  const [processing, setProcessing] = useState(false);
 
  // ─── 기간 선택 ───────────────────────────────────────────
  const [quickRange, setQuickRange] = useState<QuickRange>('오늘');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
 
  const handleQuickRange = (range: QuickRange) => {
    setQuickRange(range);
    if (range !== '직접입력') {
      const { start, end } = getQuickDates(range);
      setStartDate(start);
      setEndDate(end);
    }
  };
 
  const loadOrders = useCallback(async (sDate?: Date, eDate?: Date) => {
    if (!token) return;
    const s = sDate ?? startDate;
    const e = eDate ?? endDate;
 
    const [map, todayList, periodList] = await Promise.all([
      fetchNameMap(token),
      fetchFuturesOrders(token, '0'),
      fetchPeriodOrders(token, toYYYYMMDD(s), toYYYYMMDD(e)),
    ]);
 
    const periodNameMap: Record<string, string> = {};
    for (const o of periodList) {
      if (o.fnoIsuNo && o.isuNm) periodNameMap[o.fnoIsuNo] = o.isuNm;
    }
    const mapWithPeriod = { ...map, ...periodNameMap };
 
    const todayCodes = todayList.map(o => o.expcode).filter(c => c && !mapWithPeriod[c]);
    const todayNameMap = todayCodes.length > 0 ? await fetchTodayNames(token, todayCodes) : {};
    const mergedMap = { ...mapWithPeriod, ...todayNameMap };
 
    const todayUnified = todayList.map(o => todayToUnified(o, mergedMap));
    const todayOrdNos = new Set(todayList.map(o => o.ordno));
    const periodUnified = periodList
      .map(o => periodToUnified(o))
      .filter(o => !todayOrdNos.has(o.id.replace('period-', '').split('-').pop() ?? ''));
 
    setOrders([...todayUnified, ...periodUnified].reverse());
  }, [token, startDate, endDate]);
 
  useEffect(() => {
    setLoading(true);
    loadOrders().finally(() => setLoading(false));
  }, []);
 
  // 기간 변경 시 자동 조회
  useEffect(() => {
    if (quickRange !== '직접입력') {
      loadOrders(startDate, endDate);
    }
  }, [startDate, endDate]);
 
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  }, [loadOrders]);
 
  const filteredOrders = orders.filter(o => {
    if (filterTab === '체결') return o.isFilled;
    if (filterTab === '미체결') return o.isPending;
    return true;
  });
 
  const handleCancel = useCallback((order: UnifiedOrder) => {
    if (!order.rawTodayOrder) return;
    Alert.alert('주문 취소', `${order.isuNm}\n미체결 ${order.unercQty}계약을 취소하시겠습니까?`, [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기', style: 'destructive',
        onPress: async () => {
          if (!token) return;
          setProcessing(true);
          const raw = order.rawTodayOrder!;
          const result = await cancelFuturesOrder(token, {
            fnoIsuNo: raw.expcode, orgOrdNo: Number(raw.ordno), cancQty: raw.ordrem,
          });
          setProcessing(false);
          if (result.success) { Alert.alert('완료', '취소 주문이 접수되었습니다.'); await loadOrders(); }
          else Alert.alert('실패', result.message);
        },
      },
    ]);
  }, [token, loadOrders]);
 
  const handleModifyConfirm = useCallback(async (newPrice: number, newQty: number) => {
    if (!token || !modifyTarget?.rawTodayOrder) return;
    setProcessing(true);
    try {
      const raw = modifyTarget.rawTodayOrder;
      const cancelResult = await cancelFuturesOrder(token, {
        fnoIsuNo: raw.expcode, orgOrdNo: Number(raw.ordno), cancQty: raw.ordrem,
      });
      if (!cancelResult.success) { Alert.alert('정정 실패', cancelResult.message); return; }
      const isBuy = raw.medosu === '매수' || raw.medosu === '2';
      const newOrder = await placeFuturesOrder(token, {
        fnoIsuNo: raw.expcode, bnsTpCode: isBuy ? '2' : '1',
        orderType: '00', price: newPrice, qty: newQty, trdPtnCode: '00',
      });
      if (newOrder.success) {
        Alert.alert('정정 완료', `주문번호: ${newOrder.ordNo}`);
        setModifyTarget(null);
        await loadOrders();
      } else Alert.alert('정정 실패', newOrder.message);
    } finally { setProcessing(false); }
  }, [token, modifyTarget, loadOrders]);
 
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>주문내역</Text>
      </View>
 
      {/* 빠른 선택 버튼 */}
      <View style={styles.quickRow}>
        {(['오늘', '1주일', '1개월', '직접입력'] as QuickRange[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.quickBtn, quickRange === r && styles.quickBtnActive]}
            onPress={() => handleQuickRange(r)}
          >
            <Text style={[styles.quickBtnText, quickRange === r && styles.quickBtnTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
 
      {/* 직접입력 - 날짜 피커 */}
      {quickRange === '직접입력' && (
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
            <Text style={styles.dateBtnText}>{formatDisplayDate(startDate)}</Text>
          </TouchableOpacity>
          <Text style={styles.dateSep}>~</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
            <Text style={styles.dateBtnText}>{formatDisplayDate(endDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); loadOrders().finally(() => setLoading(false)); }}>
            <Text style={styles.searchBtnText}>조회</Text>
          </TouchableOpacity>
        </View>
      )}
 
      {showStartPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowStartPicker(false);
            if (date) setStartDate(date);
          }}
          maximumDate={endDate}
        />
      )}
      {showEndPicker && (
        <DateTimePicker
          value={endDate}
          mode="date"
          display="default"
          onChange={(_, date) => {
            setShowEndPicker(false);
            if (date) setEndDate(date);
          }}
          minimumDate={startDate}
          maximumDate={new Date()}
        />
      )}
 
      {/* 필터 탭 */}
      <View style={styles.filterTabs}>
        {(['전체', '체결', '미체결'] as FilterTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.filterTab, filterTab === t && styles.filterTabActive]}
            onPress={() => setFilterTab(t)}
          >
            <Text style={[styles.filterTabText, filterTab === t && styles.filterTabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
 
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#3182f6" />
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>주문 내역이 없습니다</Text>
            </View>
          ) : (
            filteredOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                onModify={setModifyTarget}
                onCancel={handleCancel}
              />
            ))
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
 
      <ModifyModal
        visible={!!modifyTarget}
        order={modifyTarget}
        onClose={() => setModifyTarget(null)}
        onConfirm={handleModifyConfirm}
      />
 
      {processing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>처리 중...</Text>
        </View>
      )}
    </View>
  );
}
 
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6f8' },
  header: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1a1a1a' },
  quickRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 16, paddingVertical: 10, gap: 6,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  quickBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: '#f5f6f8',
  },
  quickBtnActive: { backgroundColor: '#35bd1a' },
  quickBtnText: { fontSize: 12, fontWeight: '600', color: '#888' },
  quickBtnTextActive: { color: '#fff' },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  dateBtn: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8,
    backgroundColor: '#fff', alignItems: 'center',
  },
  dateBtnText: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  dateSep: { fontSize: 14, color: '#888', fontWeight: '600' },
  searchBtn: {
    paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#35bd1a', borderRadius: 8,
  },
  searchBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  filterTabs: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  filterTab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  filterTabActive: { borderBottomColor: '#35bd1a' },
  filterTabText: { fontSize: 14, fontWeight: '600', color: '#bbb' },
  filterTabTextActive: { color: '#1a1a1a' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  emptyBox: {
    backgroundColor: '#fff', borderRadius: 16, padding: 40,
    alignItems: 'center', marginTop: 24,
  },
  emptyText: { fontSize: 14, color: '#bbb' },
  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2, overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', padding: 16, paddingBottom: 10,
  },
  cardLeft: { flex: 1, marginRight: 8 },
  cardRight: { flexDirection: 'row', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  orderName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  orderMeta: { fontSize: 11, color: '#aaa' },
  todayBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#eff6ff' },
  todayBadgeText: { fontSize: 10, fontWeight: '700', color: '#3b82f6' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '700' },
  sideBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  buyBadge: { backgroundColor: '#fce7f3' },
  sellBadge: { backgroundColor: '#dbeafe' },
  sideBadgeText: { fontSize: 11, fontWeight: '700' },
  cardMid: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
  },
  infoItem: { alignItems: 'center' },
  infoLabel: { fontSize: 10, color: '#aaa', marginBottom: 2 },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  progressBg: { height: 3, backgroundColor: '#f0f0f0', marginHorizontal: 16, marginBottom: 4 },
  progressFill: { height: 3, backgroundColor: '#10b981' },
  pnlRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: '#f5f5f5',
  },
  pnlLabel: { fontSize: 12, color: '#888' },
  pnlValue: { fontSize: 13, fontWeight: '700' },
  actionDivider: { height: 1, backgroundColor: '#f0f0f0', marginHorizontal: 16 },
  actionRow: { flexDirection: 'row', gap: 8, padding: 12 },
  modifyBtn: {
    flex: 1, paddingVertical: 11, backgroundColor: '#f5f5f5',
    borderRadius: 10, alignItems: 'center',
  },
  modifyBtnText: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  cancelOrderBtn: {
    flex: 1, paddingVertical: 11, backgroundColor: '#fff1f0',
    borderRadius: 10, alignItems: 'center',
  },
  cancelOrderBtnText: { fontSize: 13, fontWeight: '700', color: '#e53e3e' },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  processingText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
 
const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  subTitle: { fontSize: 13, color: '#888', marginBottom: 20 },
  inputRow: { marginBottom: 16 },
  inputLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontWeight: '600', color: '#1a1a1a',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, backgroundColor: '#f5f5f5',
    borderRadius: 12, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#666' },
  confirmBtn: {
    flex: 2, paddingVertical: 14, backgroundColor: '#1a1a1a',
    borderRadius: 12, alignItems: 'center',
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});