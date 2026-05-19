/**
 * app/order/put-order.tsx
 * 옵션 주문 화면 — futures.tsx 카드 레이아웃 스타일
 * ✅ 지정가 고정 (시장가 제거)
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Alert, ActivityIndicator,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
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
  const navigation = useNavigation();
  const {
    putCode, actprice, putPrice, weekKey, market,
    optionType, side, isuNm,
    jandatecnt: jandatecntParam,
  } = useLocalSearchParams<{
    putCode: string;
    actprice: string;
    putPrice: string;
    weekKey: string;
    market: 'KOSPI200' | 'KOSDAQ150';
    optionType?: 'PUT' | 'CALL';
    side?: 'BUY' | 'SELL';
    isuNm?: string;
    jandatecnt?: string;
  }>();
  const token = useAuthStore((s) => s.token);
 
  const isSell = side !== 'BUY';
  const isCall = optionType === 'CALL';
  const optionLabel = isCall ? '콜옵션' : '풋옵션';
  const sideLabel = isSell ? '매도' : '매수';
  const sideColor = isSell ? '#3182f6' : '#f04452';
 
  const actPrice = Number(actprice ?? 0);
  const marketName = market === 'KOSPI200' ? '코스피200' : '코스닥150';
  const multiplier = market === 'KOSPI200' ? 250000 : 10000;
  const spotLabel = market === 'KOSPI200' ? 'KP200' : 'KQ150';
  const upcode = market === 'KOSPI200' ? '101' : '405';
 
  // weekKey (예: W3MON, W3THU) → "W3 월" / "W3 목"
  const weekLabel = weekKey
    ? weekKey
        .replace(/^\d{6}_/, '') // 앞에 202605_ 제거
        .replace(/^(W\d)(MON|THU)$/, (_, w, d) => `${w} ${d === 'MON' ? '월' : '목'}`)
    : '';
  const symbolName = `${spotLabel} ${isCall ? 'C' : 'P'} ${weekLabel} ${actPrice > 0 ? actPrice.toLocaleString() : ''}`.trim();
 
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
 
  // 현물지수
  const [spotPrice, setSpotPrice] = useState(0);
  const [spotChange, setSpotChange] = useState(0);
  const [spotChangeRate, setSpotChangeRate] = useState(0);
  const [spotIsUp, setSpotIsUp] = useState(true);
  const jandatecnt = Number(jandatecntParam ?? 0);
 
  // ── 현물지수 조회 ──
  const loadSpotPrice = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('https://openapi.ls-sec.co.kr:8080/indtp/market-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'authorization': `Bearer ${token}`,
          'tr_cd': 't1511', 'tr_cont': 'N', 'tr_cont_key': '0', 'mac_address': '',
        },
        body: JSON.stringify({ t1511InBlock: { upcode } }),
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
    } catch {}
  }, [token, upcode]);
 
  useEffect(() => {
    if (!token) return;
    fetchAccountAndPositions(token).then(result => {
      if (result) {
        const amt = result.account.ordAblAmt;
        setOrdAblAmt(amt);
        setMaxQty(calcMaxQty(amt, currentPrice, market ?? 'KOSPI200'));
      }
    });
    loadSpotPrice();
  }, [token]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: `${optionLabel} ${sideLabel}`,
    });
  }, [optionLabel, sideLabel]);
 
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
    loadSpotPrice();
    const interval = setInterval(() => {
      loadHoga();
      loadSpotPrice();
    }, 3000);
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
        orderType: '00',
        price: Number(price),
        qty: Number(qty),
        trdPtnCode: '00',
      });
      if (result.success) {
        setOrdNo(result.ordNo ?? '');
 
        if (isSell && !isCall) {
          let checked = false;
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const orders = await fetchFuturesOrders(token, '1');
            const matched = orders.find(o => o.expcode === putCode && o.cheqty > 0);
            if (matched) { checked = true; break; }
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
  const maxHogaQty = Math.max(...asks.map(a => a.qty), ...bids.map(b => b.qty), 1);
  const spotChangeColor = spotIsUp ? '#f04452' : '#3182f6';
 
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">
 
          {/* ── 종목 정보 카드 ── */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={s.symbolName}>{symbolName}</Text>
                <Text style={s.symbolCode}>{putCode}</Text>
                {spotPrice > 0 && (
                  <View style={s.spotRow}>
                    <Text style={s.spotLabel}>{spotLabel}</Text>
                    <Text style={[s.spotPrice, { color: spotChangeColor }]}>
                      {spotPrice.toFixed(2)}
                    </Text>
                    <Text style={[s.spotChange, { color: spotChangeColor }]}>
                      {spotIsUp ? '▲' : '▼'} {Math.abs(spotChange).toFixed(2)}{'  '}{spotIsUp ? '' : '-'}{Math.abs(spotChangeRate).toFixed(2)}%
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[s.currentPrice, { color: sideColor }]}>
                  {currentPrice.toFixed(2)}
                </Text>
                <View style={[s.sideBadge, { backgroundColor: isSell ? '#eff6ff' : '#fff1f0' }]}>
                  <Text style={[s.sideBadgeText, { color: sideColor }]}>{sideLabel}</Text>
                </View>
              </View>
            </View>
            {jandatecnt > 0 && (
              <View style={s.infoTagRow}>
                <View style={s.infoTag}>
                  <Text style={s.infoTagText}>잔여 <Text style={{ color: '#f04452' }}>{jandatecnt}</Text>일</Text>
                </View>
              </View>
            )}
          </View>
 
          {/* ── 호가창 카드 ── */}
          <View style={s.card}>
            <Text style={s.sectionTitle}>
              호가{'  '}<Text style={s.hogaHint}>눌러서 주문가격 입력</Text>
            </Text>
 
            {hogaLoading ? (
              <Text style={s.hogaEmpty}>호가 불러오는 중...</Text>
            ) : asks.length === 0 && bids.length === 0 ? (
              <Text style={s.hogaEmpty}>장중에만 호가가 표시됩니다</Text>
            ) : (
              <>
                {asks.map((row, i) => (
                  <TouchableOpacity key={`ask-${i}`} style={s.hogaRow} onPress={() => handleHogaPress(row.price)} activeOpacity={0.7}>
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
 
                <View style={[s.currentBar, { borderColor: sideColor }]}>
                  <Text style={[s.currentBarTxt, { color: sideColor }]}>
                    현재가  {currentPrice.toFixed(2)}
                  </Text>
                </View>
 
                {bids.map((row, i) => (
                  <TouchableOpacity key={`bid-${i}`} style={s.hogaRow} onPress={() => handleHogaPress(row.price)} activeOpacity={0.7}>
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
 
          {/* ── 주문가능금액 카드 ── */}
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
              <Text style={s.infoValue}>{multiplier.toLocaleString()}원</Text>
            </View>
          </View>
 
          {/* ── 주문 입력 카드 ── */}
          <View style={s.card}>
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
              <Text style={[s.resetText, { color: sideColor }]}>
                현재가로 초기화 ({currentPrice.toFixed(2)})
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
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.orderBtnText}>
                  {sideLabel} {qty}계약 @ {Number(price).toFixed(2)}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
 
      <Modal transparent visible={confirmVisible} animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>주문 확인</Text>
            {[
              ['종목', symbolName],
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
  scroll: { flex: 1, padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbolName: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  symbolCode: { fontSize: 12, color: '#aaa', marginBottom: 4 },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  spotLabel: { fontSize: 11, color: '#aaa', fontWeight: '700' },
  spotPrice: { fontSize: 13, fontWeight: '800' },
  spotChange: { fontSize: 12, fontWeight: '600' },
  currentPrice: { fontSize: 26, fontWeight: '800' },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  sideBadgeText: { fontSize: 12, fontWeight: '700' },
  infoTagRow: { flexDirection: 'row', gap: 6, marginTop: 12, flexWrap: 'wrap' },
  infoTag: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f5f6f8', borderRadius: 8 },
  infoTagText: { fontSize: 11, fontWeight: '700', color: '#888' },
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