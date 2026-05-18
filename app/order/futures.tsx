//futures.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { placeFuturesOrder } from '../../services/order';
import { fetchAccountAndPositions } from '../../services/account';
import {
  fetchNearFutureCode,
  fetchNearKqdaqFutureCode,
  fetchFuturesPrice,
  fetchFuturesHogaData,
  fetchKosdaq150SpotPrice,
} from '../../services/market';
 
type Side = 'BUY' | 'SELL';
type Market = 'KOSPI200' | 'KOSDAQ150';
 
interface HogaRow { price: number; qty: number; }
interface FuturesPrice {
  price: number; change: number; changeRate: number; isUp: boolean;
  open: number; high: number; low: number; jnilClose: number;
}
 
const MARKET_CONFIG = {
  KOSPI200: {
    name: '코스피200 선물', multiplier: 250000,
    spotLabel: 'KP200', defaultCode: 'A0166000', tickSize: 0.05,
  },
  KOSDAQ150: {
    name: '코스닥150 선물', multiplier: 10000,
    spotLabel: 'KQ150', defaultCode: 'A0666000', tickSize: 0.05,
  },
};
 
function adjustByTick(price: number, delta: number, tick: number): number {
  return Math.max(tick, parseFloat((price + delta * tick).toFixed(2)));
}
 
export default function FuturesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { side: initSide, market: initMarket, futCode: initFutCode } = useLocalSearchParams<{ side?: string; market?: string; futCode?: string }>();
  const token = useAuthStore((s) => s.token);
 
  const market = (initMarket as Market) ?? 'KOSPI200';
  const config = MARKET_CONFIG[market];
 
  const [futuresCode, setFuturesCode] = useState(config.defaultCode);
  const [futures, setFutures] = useState<FuturesPrice | null>(null);
  const [hoga, setHoga] = useState<{ asks: HogaRow[]; bids: HogaRow[] } | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [spotChange, setSpotChange] = useState(0);
  const [spotChangeRate, setSpotChangeRate] = useState(0);
  const [spotIsUp, setSpotIsUp] = useState(true);
  const [priceLoading, setPriceLoading] = useState(true);
 
  const [side, setSide] = useState<Side>((initSide as Side) ?? 'BUY');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('0');
  const [jandatecnt, setJandatecnt] = useState(0);
  const [ordAblAmt, setOrdAblAmt] = useState(0);
  const [maxQty, setMaxQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
 
  const isBuy = side === 'BUY';
  const sideColor = isBuy ? '#f04452' : '#3182f6';
 
  // ✅ 현물지수 조회
  const loadSpotPrice = useCallback(async () => {
    if (!token) return;
    try {
      if (market === 'KOSPI200') {
        const res = await fetch('https://openapi.ls-sec.co.kr:8080/indtp/market-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't1511', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t1511InBlock: { upcode: '101' } }),
        });
        const data = await res.json();
        const b = data?.t1511OutBlock;
        if (b) {
          const sp = Number(b.pricejisu ?? 0);
          const ch = Number(b.change ?? 0);
          const cr = Number(b.diffjisu ?? 0);
          const sign = String(b.sign ?? '3');
          const isUp = sign === '1' || sign === '2';
          setSpotPrice(sp);
          setSpotChange(isUp ? Math.abs(ch) : -Math.abs(ch));
          setSpotChangeRate(isUp ? Math.abs(cr) : -Math.abs(cr));
          setSpotIsUp(isUp);
        }
      } else {
        // t1511 코스닥150 현물지수
        const res = await fetch('https://openapi.ls-sec.co.kr:8080/indtp/market-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'authorization': `Bearer ${token}`,
            'tr_cd': 't1511', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
          },
          body: JSON.stringify({ t1511InBlock: { upcode: '405' } }),
        });
        const data = await res.json();
        const b = data?.t1511OutBlock;
        if (b) {
          const sp = Number(b.pricejisu ?? 0);
          const ch = Number(b.change ?? 0);
          const cr = Number(b.diffjisu ?? 0);
          const sign = String(b.sign ?? '3');
          const isUp = sign === '1' || sign === '2';
          setSpotPrice(sp);
          setSpotChange(isUp ? Math.abs(ch) : -Math.abs(ch));
          setSpotChangeRate(isUp ? Math.abs(cr) : -Math.abs(cr));
          setSpotIsUp(isUp);
        }
      }
    } catch {}
  }, [token, market]);
 
  const loadMarketData = useCallback(async () => {
    if (!token) return;
    const code = initFutCode ?? (market === 'KOSPI200'
      ? await fetchNearFutureCode(token)
      : await fetchNearKqdaqFutureCode(token));
    setFuturesCode(code);
 
    const [f, h] = await Promise.all([
      fetchFuturesPrice(token, code),
      fetchFuturesHogaData(token, code),
    ]);
 
    if (f) {
      setFutures(f);
      setPrice((prev) => (prev === '0' || prev === '') ? String(f.price) : prev);
      if (f.jandatecnt > 0) setJandatecnt(f.jandatecnt);
    }
    if (h) setHoga(h);
    setPriceLoading(false);
  }, [token, market, initFutCode]);
 
  useEffect(() => {
    loadMarketData();
    loadSpotPrice();
    const timer = setInterval(() => {
      loadMarketData();
      loadSpotPrice();
    }, 3000);
    return () => clearInterval(timer);
  }, [loadMarketData, loadSpotPrice]);
 
  useEffect(() => {
    if (!token) return;
    fetchAccountAndPositions(token).then((result) => {
      if (result) setOrdAblAmt(result.account.ordAblAmt);
    });
  }, [token]);
 
  useEffect(() => {
    const p = Number(price);
    if (p > 0 && ordAblAmt > 0) {
      setMaxQty(Math.floor(ordAblAmt / (p * config.multiplier)));
    }
  }, [price, ordAblAmt]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: `${config.name} ${isBuy ? '매수' : '매도'}`,
    });
  }, [isBuy]);
 
  function adjustQty(delta: number) {
    const next = Math.max(1, Math.min(maxQty || 99, (Number(qty) || 1) + delta));
    setQty(String(next));
  }
 
  function onHogaPress(hogaPrice: number, clickedSide: Side) {
    setSide(clickedSide);
    setPrice(String(hogaPrice));
  }
 
  function handleOrder() {
    if (Number(qty) <= 0) { Alert.alert('입력 오류', '수량을 확인해주세요.'); return; }
    if (Number(price) <= 0) { Alert.alert('입력 오류', '가격을 확인해주세요.'); return; }
    setConfirmVisible(true);
  }
 
  async function confirmOrder() {
    if (!token) return;
    setConfirmVisible(false);
    setLoading(true);
    try {
      const result = await placeFuturesOrder(token, {
        fnoIsuNo: futuresCode,
        bnsTpCode: isBuy ? '2' : '1',
        orderType: '00', // ✅ 지정가 고정
        price: Number(price),
        qty: Number(qty),
        trdPtnCode: '00',
      });
      if (result.success) {
        Alert.alert(`✅ ${isBuy ? '매수' : '매도'} 완료`, `주문번호: ${result.ordNo}`, [
          { text: '확인', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('❌ 주문 실패', result.message);
      }
    } catch {
      Alert.alert('오류', '주문 중 문제가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }
 
  const estimatedMargin = Number(qty) * Number(price) * config.multiplier;
  const changeColor = futures?.isUp ? '#f04452' : '#3182f6';
  const changeSign = futures && futures.change >= 0 ? '+' : '';
  const maxHogaQty = hoga
    ? Math.max(...hoga.asks.map(r => r.qty), ...hoga.bids.map(r => r.qty), 1)
    : 1;
 
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
 
          {/* 현재가 + 현물지수 */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.symbolName}>{config.name}</Text>
                <Text style={s.symbolCode}>{futuresCode}</Text>
              </View>
              {priceLoading ? <ActivityIndicator color="#3182f6" /> : (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.currentPrice, { color: changeColor }]}>
                    {futures?.price.toFixed(2) ?? '-'}
                  </Text>
                  <Text style={[s.changeText, { color: changeColor }]}>
                    {changeSign}{futures?.change.toFixed(2)} ({changeSign}{futures?.changeRate.toFixed(2)}%)
                  </Text>
                </View>
              )}
            </View>
 
            {futures && (
              <View style={s.ohlcRow}>
                {[['시가', futures.open], ['고가', futures.high], ['저가', futures.low], ['전일', futures.jnilClose]].map(([label, val]) => (
                  <View key={label as string} style={s.ohlcItem}>
                    <Text style={s.ohlcLabel}>{label}</Text>
                    <Text style={s.ohlcValue}>{(val as number).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
 
            {/* ✅ 현물지수 + 잔여일 */}
            {spotPrice != null && spotPrice > 0 && (
              <View style={[s.spotRow, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.spotLabel}>{config.spotLabel}</Text>
                  <Text style={[s.spotPrice, { color: spotIsUp ? '#f04452' : '#3182f6' }]}>
                    {spotPrice.toFixed(2)}
                  </Text>
                  <Text style={[s.spotChange, { color: spotIsUp ? '#f04452' : '#3182f6' }]}>
                    {spotIsUp ? '▲' : '▼'} {Math.abs(spotChange).toFixed(2)} ({Math.abs(spotChangeRate).toFixed(2)}%)
                  </Text>
                </View>
                {jandatecnt > 0 && (
                <View style={s.infoTag}>
                  <Text style={s.infoTagText}>잔여 <Text style={{ color: '#f04452' }}>{jandatecnt}</Text>일</Text>
                </View>
              )}
              </View>
            )}
            
          </View>
 
          {/* 호가창 */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>
              호가{'  '}<Text style={s.hogaHint}>눌러서 주문가격 입력</Text>
            </Text>
            {!hoga ? (
              <Text style={s.hogaEmpty}>장중에만 호가가 표시됩니다</Text>
            ) : (
              <>
                {hoga.asks.map((row, i) => (
                  <TouchableOpacity key={`ask-${i}`} style={s.hogaRow} onPress={() => onHogaPress(row.price, 'BUY')}>
                    <View style={s.hogaSide}>
                      <View style={[s.hogaBarBg, { backgroundColor: '#eff6ff' }]}>
                        <View style={[s.hogaBarFillRight, { width: `${(row.qty / maxHogaQty) * 100}%` as any, backgroundColor: '#bfdbfe' }]} />
                      </View>
                      <Text style={[s.hogaQty, { color: '#3182f6' }]}>{row.qty}</Text>
                    </View>
                    <Text style={[s.hogaPrice, { color: '#3182f6' }]}>{row.price.toFixed(2)}</Text>
                    <View style={s.hogaSide} />
                  </TouchableOpacity>
                ))}
                <View style={[s.currentBar, { borderColor: changeColor }]}>
                  <Text style={[s.currentBarTxt, { color: changeColor }]}>
                    현재가  {futures?.price.toFixed(2)}
                  </Text>
                </View>
                {hoga.bids.map((row, i) => (
                  <TouchableOpacity key={`bid-${i}`} style={s.hogaRow} onPress={() => onHogaPress(row.price, 'SELL')}>
                    <View style={s.hogaSide} />
                    <Text style={[s.hogaPrice, { color: '#f04452' }]}>{row.price.toFixed(2)}</Text>
                    <View style={s.hogaSide}>
                      <Text style={[s.hogaQty, { color: '#f04452' }]}>{row.qty}</Text>
                      <View style={[s.hogaBarBg, { backgroundColor: '#fff1f2' }]}>
                        <View style={[s.hogaBarFill, { width: `${(row.qty / maxHogaQty) * 100}%` as any, backgroundColor: '#fecdd3' }]} />
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
 
          {/* 주문가능금액 */}
          <View style={s.card}>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>주문가능금액</Text>
              <Text style={s.infoValue}>{ordAblAmt.toLocaleString()}원</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>최대 주문 가능</Text>
              <Text style={s.infoValue}>{maxQty > 0 ? `${maxQty}계약` : '잔고 부족'}</Text>
            </View>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>계약승수</Text>
              <Text style={s.infoValue}>{config.multiplier.toLocaleString()}원</Text>
            </View>
          </View>
 
          {/* 주문 입력 — 지정가 고정 */}
          <View style={s.card}>
            <View style={s.sideRow}>
              <TouchableOpacity style={[s.sideBtn, side === 'BUY' && s.sideBuyActive]} onPress={() => setSide('BUY')}>
                <Text style={[s.sideText, side === 'BUY' && { color: '#fff' }]}>매수</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.sideBtn, side === 'SELL' && s.sideSellActive]} onPress={() => setSide('SELL')}>
                <Text style={[s.sideText, side === 'SELL' && { color: '#fff' }]}>매도</Text>
              </TouchableOpacity>
            </View>
 
            <Text style={s.inputLabel}>수량 (계약)</Text>
            <View style={s.inputRow}>
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(-1)}>
                <Text style={s.adjText}>－</Text>
              </TouchableOpacity>
              <TextInput
                style={s.inputCenter} value={qty}
                onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ''))}
                keyboardType="numeric" textAlign="center"
              />
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(1)}>
                <Text style={s.adjText}>＋</Text>
              </TouchableOpacity>
            </View>
            <View style={s.quickRow}>
              {[1, 2, 3, 5].map((n) => (
                <TouchableOpacity key={n} style={[s.quickBtn, Number(qty) === n && { backgroundColor: sideColor }]} onPress={() => setQty(String(n))}>
                  <Text style={[s.quickText, Number(qty) === n && { color: '#fff' }]}>{n}</Text>
                </TouchableOpacity>
              ))}
              {maxQty > 0 && (
                <TouchableOpacity style={[s.quickBtn, Number(qty) === maxQty && { backgroundColor: sideColor }]} onPress={() => setQty(String(maxQty))}>
                  <Text style={[s.quickText, Number(qty) === maxQty && { color: '#fff' }]}>최대</Text>
                </TouchableOpacity>
              )}
            </View>
 
            {/* ✅ 지정가 고정 */}
            <Text style={s.inputLabel}>가격 (지정가)</Text>
            <View style={s.inputRow}>
              <TouchableOpacity style={s.adjBtn} onPress={() => setPrice(String(adjustByTick(Number(price), -1, config.tickSize)))}>
                <Text style={s.adjText}>－</Text>
              </TouchableOpacity>
              <TextInput
                style={s.inputCenter} value={price}
                onChangeText={setPrice} keyboardType="numeric" textAlign="center"
              />
              <TouchableOpacity style={s.adjBtn} onPress={() => setPrice(String(adjustByTick(Number(price), 1, config.tickSize)))}>
                <Text style={s.adjText}>＋</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.resetBtn} onPress={() => futures && setPrice(String(futures.price))}>
              <Text style={[s.resetText, { color: sideColor }]}>
                현재가로 초기화 ({futures?.price.toFixed(2) ?? '-'})
              </Text>
            </TouchableOpacity>
 
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>예상 증거금</Text>
              <Text style={s.totalValue}>{estimatedMargin.toLocaleString()}원</Text>
            </View>
          </View>
 
          <View style={{ height: 16 }} />
        </ScrollView>
 
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.orderBtn, { backgroundColor: sideColor }, loading && s.disabled]}
            onPress={handleOrder} disabled={loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.orderBtnText}>
                {isBuy ? '매수' : '매도'} {qty}계약 @ {Number(price).toFixed(2)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
 
      <Modal transparent visible={confirmVisible} animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>주문 확인</Text>
            {[
              ['종목', config.name],
              ['구분', `${isBuy ? '매수' : '매도'} · 신규`],
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
                <Text style={s.confirmText}>{isBuy ? '매수' : '매도'} 확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  scroll: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbolName: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  symbolCode: { fontSize: 12, color: '#aaa' },
  currentPrice: { fontSize: 26, fontWeight: '800' },
  changeText: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  ohlcRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  ohlcItem: { alignItems: 'center', flex: 1 },
  ohlcLabel: { fontSize: 11, color: '#aaa', marginBottom: 4 },
  ohlcValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  // 현물지수
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  // 잔여일
  infoTagRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  infoTag: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f5f6f8', borderRadius: 8 },
  infoTagText: { fontSize: 11, fontWeight: '700', color: '#888' },
  //현물지수
  spotLabel: { fontSize: 11, color: '#aaa', fontWeight: '700' },
  spotPrice: { fontSize: 14, fontWeight: '800' },
  spotChange: { fontSize: 12, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 10 },
  hogaHint: { fontSize: 11, color: '#bbb', fontWeight: '400' },
  hogaEmpty: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 16 },
  hogaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  hogaSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  hogaPrice: { width: 72, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  hogaQty: { fontSize: 12, width: 28, textAlign: 'center' },
  hogaBarBg: { flex: 1, height: 18, borderRadius: 3, overflow: 'hidden' },
  hogaBarFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3 },
  hogaBarFillRight: { position: 'absolute', top: 0, bottom: 0, right: 0, borderRadius: 3 },
  currentBar: { borderWidth: 1, borderRadius: 8, padding: 6, alignItems: 'center', marginVertical: 6 },
  currentBarTxt: { fontSize: 13, fontWeight: '800' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { fontSize: 13, color: '#888' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  sideRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  sideBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center' },
  sideBuyActive: { backgroundColor: '#f04452' },
  sideSellActive: { backgroundColor: '#3182f6' },
  sideText: { fontSize: 15, fontWeight: '800', color: '#aaa' },
  inputLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  adjBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 22, color: '#1a1a1a' },
  inputCenter: { flex: 1, height: 48, backgroundColor: '#f5f6f8', borderRadius: 12, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8' },
  quickText: { fontSize: 13, fontWeight: '600', color: '#888' },
  resetBtn: { alignItems: 'center', marginBottom: 12 },
  resetText: { fontSize: 12, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  totalLabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 16, fontWeight: '800', color: '#1a1a1a' },
  footer: { padding: 16, paddingBottom: 24, backgroundColor: '#f5f6f8' },
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