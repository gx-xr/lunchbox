import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, Alert, ScrollView,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Rect, Path } from 'react-native-svg';
import { LineChart } from 'react-native-chart-kit';
import { useAuthStore } from '../../store/authStore';
import { getSymbolByCode } from '../../services/symbol';
import { placeOrder } from '../../services/order';
import { Symbol, OrderSide } from '../../types/trading';

const SCREEN_WIDTH = Dimensions.get('window').width;
type OrderType = 'LIMIT' | 'MARKET';
type ChartType = 'CANDLE' | 'LINE';

interface Candle { open: number; close: number; high: number; low: number; }

function generateMockCandles(base: number): Candle[] {
  let price = base;
  return Array.from({ length: 30 }, () => {
    const open = price;
    const close = parseFloat((open + (Math.random() - 0.48) * base * 0.003).toFixed(2));
    const high = parseFloat((Math.max(open, close) + Math.random() * base * 0.0015).toFixed(2));
    const low = parseFloat((Math.min(open, close) - Math.random() * base * 0.0015).toFixed(2));
    price = close;
    return { open, close, high, low };
  });
}

function generateMockLine(base: number): number[] {
  let price = base;
  return Array.from({ length: 30 }, () => {
    price = parseFloat((price + (Math.random() - 0.48) * base * 0.003).toFixed(2));
    return price;
  });
}

// SVG 캔들스틱 차트 컴포넌트
function CandleChart({ candles, width, height }: { candles: Candle[]; width: number; height: number }) {
  if (candles.length === 0) return null;
  const pad = { top: 10, bottom: 20, left: 8, right: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const allPrices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = maxP - minP || 1;
  const toY = (p: number) => pad.top + chartH - ((p - minP) / range) * chartH;
  const candleW = Math.max(3, (chartW / candles.length) * 0.6);
  const step = chartW / candles.length;

  return (
    <Svg width={width} height={height}>
      {candles.map((c, i) => {
        const x = pad.left + i * step + step / 2;
        const isUp = c.close >= c.open;
        const color = isUp ? '#f04452' : '#3182f6';
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(toY(c.open) - toY(c.close)));
        return (
          <React.Fragment key={i}>
            {/* 심지 */}
            <Line x1={x} y1={toY(c.high)} x2={x} y2={toY(c.low)} stroke={color} strokeWidth={1} />
            {/* 몸통 */}
            <Rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export default function OrderScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const [symbol, setSymbol] = useState<Symbol | null>(null);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [chartType, setChartType] = useState<ChartType>('CANDLE');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [lineData, setLineData] = useState<number[]>([]);

  useEffect(() => {
    if (code) {
      getSymbolByCode(code).then((s) => {
        setSymbol(s);
        if (s) {
          setPrice(String(s.price));
          setCandles(generateMockCandles(s.price));
          setLineData(generateMockLine(s.price));
        }
      });
    }
  }, [code]);

  function adjustQty(delta: number) {
    setQuantity(String(Math.max(1, (Number(quantity) || 1) + delta)));
  }

  function adjustPrice(delta: number) {
    const tick = symbol?.market === 'FUTURES' ? 0.05 : 0.01;
    setPrice(String(Math.max(0, parseFloat(((Number(price) || 0) + delta * tick).toFixed(2)))));
  }

  function handleOrder() {
    if (Number(quantity) <= 0) { Alert.alert('입력 오류', '수량을 확인해주세요.'); return; }
    if (orderType === 'LIMIT' && Number(price) <= 0) { Alert.alert('입력 오류', '가격을 확인해주세요.'); return; }
    setConfirmVisible(true);
  }

  async function confirmOrder() {
    if (!symbol || !token) return;
    setConfirmVisible(false);
    setLoading(true);
    try {
      const result = await placeOrder(token, {
        symbolCode: symbol.code, symbolName: symbol.name,
        side, quantity: Number(quantity),
        price: orderType === 'MARKET' ? 0 : Number(price),
      });
      Alert.alert('✅ 주문 완료', result.message, [
        { text: '계속 주문', style: 'cancel' },
        { text: '홈으로', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('주문 실패', '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (!symbol) return <View style={s.center}><ActivityIndicator color="#3182f6" /></View>;

  const isBuy = side === 'BUY';
  const isLimit = orderType === 'LIMIT';
  const isUp = symbol.change >= 0;
  const totalAmount = (Number(quantity) || 0) * (Number(price) || symbol.price);
  const chartW = SCREEN_WIDTH - 64;

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled">

          {/* 종목 정보 */}
          <View style={s.card}>
            <View style={s.symbolRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.symbolName}>{symbol.name}</Text>
                <Text style={s.symbolCode}>{symbol.code} · {symbol.market}</Text>
              </View>
              <View style={s.priceBlock}>
                <Text style={s.currentPrice}>{symbol.price.toLocaleString()}</Text>
                <Text style={[s.changeText, isUp ? s.up : s.down]}>
                  {isUp ? '▲' : '▼'} {Math.abs(symbol.change)} ({Math.abs(symbol.changeRate).toFixed(2)}%)
                </Text>
              </View>
            </View>
          </View>

          {/* 차트 */}
          <View style={s.card}>
            <View style={s.chartHeader}>
              <Text style={s.cardTitle}>차트 (5분봉 · mock)</Text>
              <View style={s.chartToggle}>
                {(['CANDLE', 'LINE'] as ChartType[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.toggleBtn, chartType === t && s.toggleActive]}
                    onPress={() => setChartType(t)}
                  >
                    <Text style={[s.toggleText, chartType === t && s.toggleTextActive]}>
                      {t === 'CANDLE' ? '캔들' : '라인'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {chartType === 'CANDLE'
              ? <CandleChart candles={candles} width={chartW} height={180} />
              : lineData.length > 0 && (
                <LineChart
                  data={{ labels: [], datasets: [{ data: lineData }] }}
                  width={chartW}
                  height={180}
                  chartConfig={{
                    backgroundGradientFrom: '#fff',
                    backgroundGradientTo: '#fff',
                    color: () => '#3182f6',
                    strokeWidth: 2,
                    propsForDots: { r: '0' },
                    propsForLabels: { fontSize: 9 },
                    decimalPlaces: 2,
                  }}
                  bezier
                  withInnerLines={false}
                  withOuterLines={false}
                  withVerticalLabels={false}
                  style={{ borderRadius: 8 }}
                />
              )
            }
          </View>

          {/* 매수/매도 */}
          <View style={s.sideRow}>
            {(['BUY', 'SELL'] as OrderSide[]).map((sd) => (
              <TouchableOpacity
                key={sd}
                style={[s.sideBtn, side === sd && (sd === 'BUY' ? s.buyActive : s.sellActive)]}
                onPress={() => setSide(sd)}
                activeOpacity={0.8}
              >
                <Text style={[s.sideBtnText, side === sd && (sd === 'BUY' ? s.buyText : s.sellText)]}>
                  {sd === 'BUY' ? '매수' : '매도'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 주문 입력 */}
          <View style={s.card}>
            <View style={s.orderTypeRow}>
              {(['LIMIT', 'MARKET'] as OrderType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, orderType === t && s.typeActive]}
                  onPress={() => { setOrderType(t); if (t === 'MARKET') setPrice(String(symbol.price)); }}
                >
                  <Text style={[s.typeText, orderType === t && s.typeTextActive]}>
                    {t === 'LIMIT' ? '지정가' : '시장가'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>수량 (계약)</Text>
            <View style={s.inputRow}>
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(-1)}><Text style={s.adjText}>－</Text></TouchableOpacity>
              <TextInput style={s.inputCenter} value={quantity} onChangeText={setQuantity} keyboardType="numeric" textAlign="center" />
              <TouchableOpacity style={s.adjBtn} onPress={() => adjustQty(1)}><Text style={s.adjText}>＋</Text></TouchableOpacity>
            </View>

            {isLimit && <>
              <Text style={s.inputLabel}>가격</Text>
              <View style={s.inputRow}>
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustPrice(-1)}><Text style={s.adjText}>－</Text></TouchableOpacity>
                <TextInput style={s.inputCenter} value={price} onChangeText={setPrice} keyboardType="numeric" textAlign="center" />
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustPrice(1)}><Text style={s.adjText}>＋</Text></TouchableOpacity>
              </View>
              <TouchableOpacity style={s.resetBtn} onPress={() => setPrice(String(symbol.price))}>
                <Text style={s.resetText}>현재가로 초기화 ({symbol.price.toLocaleString()})</Text>
              </TouchableOpacity>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>주문금액 (예상)</Text>
                <Text style={s.totalValue}>{totalAmount.toLocaleString()}원</Text>
              </View>
            </>}

            {!isLimit && (
              <View style={s.notice}>
                <Text style={s.noticeText}>⚠️ 시장가 주문은 체결 가격이 다를 수 있습니다.</Text>
              </View>
            )}
          </View>
          <View style={{ height: 16 }} />
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.orderBtn, isBuy ? s.buyBtn : s.sellBtn, loading && s.disabled]}
            onPress={handleOrder} disabled={loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> :
              <Text style={s.orderBtnText}>
                {isBuy ? '매수' : '매도'} {quantity}계약{isLimit ? ` @ ${Number(price).toLocaleString()}` : ' (시장가)'}
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
              ['종목', symbol.name],
              ['구분', `${isBuy ? '매수' : '매도'} · ${isLimit ? '지정가' : '시장가'}`],
              ['수량', `${quantity}계약`],
              ...(isLimit ? [['가격', Number(price).toLocaleString()]] : []),
            ].map(([label, value], i) => (
              <View key={i} style={s.modalRow}>
                <Text style={s.modalLabel}>{label}</Text>
                <Text style={[s.modalValue, label === '구분' && (isBuy ? s.up : s.down)]}>{value}</Text>
              </View>
            ))}
            <View style={[s.modalRow, { borderBottomWidth: 0, paddingTop: 14 }]}>
              <Text style={s.modalLabel}>총 금액</Text>
              <Text style={[s.modalValue, { fontSize: 18, fontWeight: '800' }]}>{totalAmount.toLocaleString()}원</Text>
            </View>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setConfirmVisible(false)}>
                <Text style={s.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.confirmBtn, isBuy ? s.buyBtn : s.sellBtn]} onPress={confirmOrder}>
                <Text style={s.confirmText}>확인</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardTitle: { fontSize: 13, color: '#888', fontWeight: '600' },
  symbolRow: { flexDirection: 'row', justifyContent: 'space-between' },
  symbolName: { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  symbolCode: { fontSize: 12, color: '#aaa' },
  priceBlock: { alignItems: 'flex-end' },
  currentPrice: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  changeText: { fontSize: 12, fontWeight: '600' },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  chartToggle: { flexDirection: 'row', gap: 6 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: '#f5f6f8' },
  toggleActive: { backgroundColor: '#1a1a1a' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  toggleTextActive: { color: '#fff' },
  sideRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  sideBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center' },
  buyActive: { backgroundColor: '#fff0f1' },
  sellActive: { backgroundColor: '#eff5ff' },
  sideBtnText: { fontSize: 16, fontWeight: '800', color: '#ccc' },
  buyText: { color: '#f04452' },
  sellText: { color: '#3182f6' },
  orderTypeRow: { flexDirection: 'row', marginBottom: 20, gap: 8 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8', alignItems: 'center' },
  typeActive: { backgroundColor: '#1a1a1a' },
  typeText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  typeTextActive: { color: '#fff' },
  inputLabel: { fontSize: 12, color: '#aaa', fontWeight: '600', marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  adjBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 20, color: '#1a1a1a' },
  inputCenter: { flex: 1, height: 44, backgroundColor: '#f5f6f8', borderRadius: 10, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  resetBtn: { alignItems: 'center', marginBottom: 16 },
  resetText: { fontSize: 12, color: '#3182f6', fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  totalLabel: { fontSize: 13, color: '#888' },
  totalValue: { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  notice: { backgroundColor: '#fffbeb', borderRadius: 8, padding: 12 },
  noticeText: { fontSize: 12, color: '#b45309' },
  footer: { padding: 16, paddingBottom: 24, backgroundColor: '#f5f6f8' },
  orderBtn: { borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  buyBtn: { backgroundColor: '#f04452' },
  sellBtn: { backgroundColor: '#3182f6' },
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
  up: { color: '#f04452' },
  down: { color: '#3182f6' },
});