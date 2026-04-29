/**
 * app/order/put-order.tsx
 * 옵션 주문 화면 — 호가창 + 주문 입력 통합
 * ✅ 지정가 고정 (시장가 제거)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { placeFuturesOrder, calcMaxQty, fetchFuturesOrders } from '../../services/order';
import { fetchAccountAndPositions } from '../../services/account';
import { fetchFuturesHogaData } from '../../services/market';
import AutoSetupSheet from '../../components/AutoSetupSheet';
 
interface HogaLevel {
  price: number;
  qty: number;
}
 
export default function PutOrderScreen() {
  const router = useRouter();
  const {
    putCode, actprice, putPrice, weekKey, market,
    optionType, side, isuNm,
  } = useLocalSearchParams<{
    putCode: string;
    actprice: string;
    putPrice: string;
    weekKey: string;
    market: 'KOSPI200' | 'KOSDAQ150';
    optionType?: 'PUT' | 'CALL';
    side?: 'BUY' | 'SELL';
    isuNm?: string;
  }>();
  const token = useAuthStore((s) => s.token);
 
  const isSell = side !== 'BUY';
  const isCall = optionType === 'CALL';
  const optionLabel = isCall ? '콜옵션' : '풋옵션';
  const sideLabel = isSell ? '매도' : '매수';
  const sideColor = isSell ? '#3182f6' : '#f04452';
 
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState(putPrice ?? '0');
  const [maxQty, setMaxQty] = useState(0);
  const [ordAblAmt, setOrdAblAmt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [autoSheetVisible, setAutoSheetVisible] = useState(false);
  const [ordNo, setOrdNo] = useState('');
 
  // 호가 데이터
  const [asks, setAsks] = useState<HogaLevel[]>([]);
  const [bids, setBids] = useState<HogaLevel[]>([]);
  const [hogaLoading, setHogaLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(Number(putPrice ?? 0));
 
  const actPrice = Number(actprice ?? 0);
  const marketName = market === 'KOSPI200' ? '코스피200' : '코스닥150';
  const multiplier = market === 'KOSPI200' ? 250000 : 10000;
 
  useEffect(() => {
    if (!token) return;
    fetchAccountAndPositions(token).then(result => {
      if (result) {
        const amt = result.account.ordAblAmt;
        setOrdAblAmt(amt);
        setMaxQty(calcMaxQty(amt, currentPrice, market ?? 'KOSPI200'));
      }
    });
  }, [token]);
 
  const loadHoga = useCallback(async () => {
    if (!token || !putCode) return;
    try {
      const data = await fetchFuturesHogaData(token, putCode);
      if (data) {
        setAsks(data.asks.filter(a => a.price > 0));
        setBids(data.bids.filter(b => b.price > 0));
        if (data.bids[0]?.price > 0) {
          setCurrentPrice(data.bids[0].price);
        }
      }
    } catch {}
    setHogaLoading(false);
  }, [token, putCode]);
 
  useEffect(() => {
    loadHoga();
    const interval = setInterval(loadHoga, 10000);
    return () => clearInterval(interval);
  }, [loadHoga]);
 
  const handleHogaPress = (hogaPrice: number) => {
    setPrice(String(hogaPrice));
  };
 
  function adjustQty(delta: number) {
    const next = Math.max(1, Math.min(maxQty || 99, (Number(qty) || 1) + delta));
    setQty(String(next));
  }
 
  function adjustPrice(delta: number) {
    const cur = Number(price) || 0;
    const tick = cur < 0.1 ? 0.01 : 0.05;
    const next = Math.max(0.01, parseFloat((cur + delta * tick).toFixed(2)));
    setPrice(String(next));
  }
 
  function handleOrder() {
    if (Number(qty) <= 0) { Alert.alert('입력 오류', '수량을 확인해주세요.'); return; }
    if (Number(price) <= 0) { Alert.alert('입력 오류', '가격을 확인해주세요.'); return; }
    setConfirmVisible(true);
  }
 
  async function confirmOrder() {
    if (!token || !putCode) return;
    setConfirmVisible(false);
    setLoading(true);
    try {
      const result = await placeFuturesOrder(token, {
        fnoIsuNo: putCode,
        bnsTpCode: isSell ? '1' : '2',
        orderType: '00', // 지정가 고정
        price: Number(price),
        qty: Number(qty),
        trdPtnCode: '00',
      });
      if (result.success) {
        setOrdNo(result.ordNo ?? '');
 
        if (isSell && !isCall) {
          // ✅ 체결 확인 후 자동화 시트 오픈 (최대 5초 대기)
          let checked = false;
          for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const orders = await fetchFuturesOrders(token, '1'); // 1: 체결만
            const matched = orders.find(o =>
              o.expcode === putCode && o.cheqty > 0
            );
            if (matched) {
              checked = true;
              break;
            }
          }
          if (checked) {
            setAutoSheetVisible(true);
          } else {
            Alert.alert(
              '⚠️ 미체결',
              `주문번호: ${result.ordNo}\n아직 체결되지 않았습니다.\n체결 후 자동화를 설정해주세요.`,
              [{ text: '확인', onPress: () => router.back() }]
            );
          }
        } else {
          Alert.alert(
            '✅ 주문 완료',
            `주문번호: ${result.ordNo}\n${marketName} ${optionLabel} ${sideLabel} 주문이 접수되었습니다.`,
            [{ text: '확인', onPress: () => router.back() }]
          );
        }
      } else {
        Alert.alert('❌ 주문 실패', result.message);
      }
    } catch {
      Alert.alert('오류', '주문 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }
 
  const estimatedMargin = Number(qty) * Number(price) * multiplier;
  const maxQty2 = asks.length > 0 ? Math.max(...asks.map(a => a.qty)) : 1;
  const maxBidQty = bids.length > 0 ? Math.max(...bids.map(b => b.qty)) : 1;
 
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
 
        {/* 헤더 */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>
              {isuNm ? isuNm : `${marketName} ${optionLabel}`}
            </Text>
            <Text style={s.headerSub}>
              {actPrice > 0 ? `행사가 ${actPrice.toLocaleString()} · ` : ''}{putCode}
            </Text>
          </View>
          <View style={s.headerRight}>
            <Text style={[s.headerPrice, { color: sideColor }]}>{currentPrice.toFixed(2)}</Text>
            <View style={[s.sideBadge, { backgroundColor: isSell ? '#eff6ff' : '#fff1f0' }]}>
              <Text style={[s.sideBadgeText, { color: sideColor }]}>{sideLabel}</Text>
            </View>
          </View>
        </View>
 
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
 
          {/* 호가창 */}
          <View style={s.hogaCard}>
            <View style={s.hogaHeader}>
              <Text style={s.hogaHeaderText}>잔량</Text>
              <Text style={[s.hogaHeaderText, { color: '#3182f6' }]}>매도호가</Text>
              <Text style={[s.hogaHeaderText, { color: '#e53e3e', textAlign: 'right' }]}>매수호가</Text>
              <Text style={[s.hogaHeaderText, { textAlign: 'right' }]}>잔량</Text>
            </View>
 
            {hogaLoading ? (
              <View style={s.hogaLoading}>
                <ActivityIndicator size="small" color="#3182f6" />
              </View>
            ) : (
              <>
                {asks.map((ask, i) => (
                  <TouchableOpacity
                    key={`ask-${i}`}
                    style={s.hogaRow}
                    onPress={() => handleHogaPress(ask.price)}
                    activeOpacity={0.7}
                  >
                    <View style={s.hogaQtyCell}>
                      <View style={[s.hogaBarAsk, { width: `${Math.min(100, (ask.qty / maxQty2) * 100)}%` }]} />
                      <Text style={s.hogaQtyText}>{ask.qty}</Text>
                    </View>
                    <Text style={[s.hogaPrice, { color: '#3182f6' }]}>{ask.price.toFixed(2)}</Text>
                    <Text style={s.hogaPrice}></Text>
                    <View style={s.hogaQtyCell} />
                  </TouchableOpacity>
                ))}
 
                <View style={s.hogaDivider}>
                  <Text style={[s.hogaDividerText, { color: sideColor }]}>
                    현재가 {currentPrice.toFixed(2)}
                  </Text>
                </View>
 
                {bids.map((bid, i) => (
                  <TouchableOpacity
                    key={`bid-${i}`}
                    style={s.hogaRow}
                    onPress={() => handleHogaPress(bid.price)}
                    activeOpacity={0.7}
                  >
                    <View style={s.hogaQtyCell} />
                    <Text style={s.hogaPrice}></Text>
                    <Text style={[s.hogaPrice, { color: '#e53e3e', textAlign: 'right' }]}>{bid.price.toFixed(2)}</Text>
                    <View style={[s.hogaQtyCell, { alignItems: 'flex-end' }]}>
                      <View style={[s.hogaBarBid, { width: `${Math.min(100, (bid.qty / maxBidQty) * 100)}%` }]} />
                      <Text style={[s.hogaQtyText, { textAlign: 'right' }]}>{bid.qty}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <Text style={s.hogaHint}>호가를 누르면 가격이 자동입력됩니다</Text>
          </View>
 
          {/* 주문가능금액 */}
          <View style={s.card}>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>주문가능금액</Text>
              <Text style={s.infoValue}>{ordAblAmt.toLocaleString()}원</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>최대 주문 가능</Text>
              <Text style={s.infoValue}>{maxQty}계약</Text>
            </View>
          </View>
 
          {/* 주문 입력 — 지정가 고정 */}
          <View style={s.card}>
            {/* 수량 */}
            <Text style={s.inputLabel}>수량 (계약)</Text>
            <View style={s.inputRow}>
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(-1)}>
                <Text style={s.adjText}>－</Text>
              </TouchableOpacity>
              <TextInput
                style={s.inputCenter} value={qty}
                onChangeText={v => setQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="numeric" textAlign="center"
              />
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(1)}>
                <Text style={s.adjText}>＋</Text>
              </TouchableOpacity>
            </View>
            <View style={s.quickRow}>
              {[1, 2, 3, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.quickBtn, Number(qty) === n && { backgroundColor: sideColor }]}
                  onPress={() => setQty(String(n))}
                >
                  <Text style={[s.quickText, Number(qty) === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
              {maxQty > 0 && (
                <TouchableOpacity
                  style={[s.quickBtn, Number(qty) === maxQty && { backgroundColor: sideColor }]}
                  onPress={() => setQty(String(maxQty))}
                >
                  <Text style={[s.quickText, Number(qty) === maxQty && { color: '#fff' }]}>최대</Text>
                </TouchableOpacity>
              )}
            </View>
 
            {/* 가격 — 지정가 고정 */}
            <Text style={s.inputLabel}>가격 (지정가)</Text>
            <View style={s.inputRow}>
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustPrice(-1)}>
                <Text style={s.adjText}>－</Text>
              </TouchableOpacity>
              <TextInput
                style={s.inputCenter} value={price}
                onChangeText={setPrice} keyboardType="numeric" textAlign="center"
              />
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustPrice(1)}>
                <Text style={s.adjText}>＋</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.resetBtn} onPress={() => setPrice(String(currentPrice))}>
              <Text style={s.resetText}>현재가로 초기화 ({currentPrice.toFixed(2)})</Text>
            </TouchableOpacity>
 
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>예상 증거금</Text>
              <Text style={s.totalValue}>{estimatedMargin.toLocaleString()}원</Text>
            </View>
          </View>
 
          <View style={{ height: 16 }} />
        </ScrollView>
 
        {/* 주문 버튼 */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.orderBtn, { backgroundColor: sideColor }, loading && s.disabled]}
            onPress={handleOrder} disabled={loading} activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.orderBtnText}>
                  {sideLabel} {qty}계약 @ {Number(price).toFixed(2)}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
 
      {/* 주문 확인 모달 */}
      <Modal transparent visible={confirmVisible} animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>주문 확인</Text>
            {[
              ['종목', `${marketName} ${optionLabel} ${actPrice.toLocaleString()}`],
              ['구분', `${sideLabel} · 신규`],
              ['유형', '지정가'],
              ['수량', `${qty}계약`],
              ['가격', Number(price).toFixed(2)],
              ['예상 증거금', `${estimatedMargin.toLocaleString()}원`],
            ].map(([label, value], i) => (
              <View key={i} style={s.modalRow}>
                <Text style={s.modalLabel}>{label}</Text>
                <Text style={[s.modalValue, label === '구분' && { color: sideColor }]}>{value}</Text>
              </View>
            ))}
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setConfirmVisible(false)}>
                <Text style={s.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, { backgroundColor: sideColor }]} onPress={confirmOrder}>
                <Text style={s.confirmText}>{sideLabel} 확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
 
      {/* 자동화 설정 바텀시트 */}
      <AutoSetupSheet
        visible={autoSheetVisible}
        onClose={() => { setAutoSheetVisible(false); router.back(); }}
        putCode={putCode ?? ''}
        putName={`${marketName} 위클리 풋옵션 행사가 ${actPrice.toLocaleString()}`}
        actprice={actPrice}
        currentPrice={currentPrice}
        market={market ?? 'KOSPI200'}
        ordNo={ordNo}
      />
    </SafeAreaView>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  headerSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerPrice: { fontSize: 22, fontWeight: '800' },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  sideBadgeText: { fontSize: 12, fontWeight: '700' },
  hogaCard: {
    backgroundColor: '#fff', marginHorizontal: 0, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  hogaHeader: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  hogaHeaderText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#888' },
  hogaLoading: { height: 120, justifyContent: 'center', alignItems: 'center' },
  hogaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#fafafa',
  },
  hogaQtyCell: { flex: 1, position: 'relative', height: 20, justifyContent: 'center' },
  hogaBarAsk: {
    position: 'absolute', left: 0, top: 2, bottom: 2,
    backgroundColor: '#dbeafe', borderRadius: 2,
  },
  hogaBarBid: {
    position: 'absolute', right: 0, top: 2, bottom: 2,
    backgroundColor: '#fee2e2', borderRadius: 2,
  },
  hogaQtyText: { fontSize: 12, color: '#666', fontWeight: '600', zIndex: 1 },
  hogaPrice: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  hogaDivider: {
    paddingHorizontal: 16, paddingVertical: 6,
    backgroundColor: '#f5f6f8', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#e0e0e0', alignItems: 'center',
  },
  hogaDividerText: { fontSize: 12, fontWeight: '700' },
  hogaHint: {
    textAlign: 'center', fontSize: 10, color: '#ccc',
    paddingVertical: 6, paddingBottom: 8,
  },
  card: {
    backgroundColor: '#fff', padding: 18, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: '#888' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  inputLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  adjBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 22, color: '#1a1a1a' },
  inputCenter: { flex: 1, height: 48, backgroundColor: '#f5f6f8', borderRadius: 12, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8' },
  quickText: { fontSize: 13, fontWeight: '600', color: '#888' },
  resetBtn: { alignItems: 'center', marginBottom: 12 },
  resetText: { fontSize: 12, color: '#3182f6', fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  totalLabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  footer: { padding: 16, paddingBottom: 24, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  orderBtn: { borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  orderBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '85%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#1a1a1a', textAlign: 'center', marginBottom: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  modalLabel: { fontSize: 13, color: '#888' },
  modalValue: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#888' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});