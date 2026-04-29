/**
 * components/AutoSetupSheet.tsx
 * ✅ 가격 여유값(priceMargin) 제거
 * ✅ 매수호가 그대로 주문 (스프레드 체크는 autoTrading.ts에서 처리)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Modal, Animated, Dimensions,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useAutoTradingStore, AutoTradingEntry, AutoSellConfig } from '../store/autoTradingStore';
import { useAuthStore } from '../store/authStore';
import { startAutoTrading } from '../services/autoTrading';
import { fetchNearFutureCode, fetchNearKqdaqFutureCode } from '../services/market';
import { fetchKQ150WeeklyCodes, fetchKP200ValidWeeklyKeys } from '../services/options';
 
const { height: SCREEN_H } = Dimensions.get('window');
 
interface WeekKeyItem { key: string; label: string; }
 
interface Props {
  visible: boolean;
  onClose: () => void;
  putCode: string;
  putName: string;
  actprice: number;
  currentPrice: number;
  market: 'KOSPI200' | 'KOSDAQ150';
  ordNo?: string;
}
 
export default function AutoSetupSheet({
  visible, onClose, putCode, putName, actprice, currentPrice, market, ordNo,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
 
  // 이삭줍기 설정
  const [closingPrice, setClosingPrice] = useState('0.02');
  const [hedgeQty, setHedgeQty] = useState('1');
  const [futuresCode, setFuturesCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
 
  // 자동 풋매도 설정
  const [autoSellEnabled, setAutoSellEnabled] = useState(false);
  const [emaEnabled, setEmaEnabled] = useState(false); // ✅ AI 매도 (EMA)
  const [nextWeeklyKeys, setNextWeeklyKeys] = useState<WeekKeyItem[]>([]);
  const [selectedNextWeekly, setSelectedNextWeekly] = useState('');
  const [sellTime, setSellTime] = useState('1510');
  const [gapThreshold, setGapThreshold] = useState(market === 'KOSPI200' ? '50' : '10');
  const [priceThreshold, setPriceThreshold] = useState('10');
  const [loadingWeekly, setLoadingWeekly] = useState(false);
 
  const addEntry = useAutoTradingStore((s) => s.addEntry);
  const addAutoSellConfig = useAutoTradingStore((s) => s.addAutoSellConfig);
  const isRunning = useAutoTradingStore((s) => s.isRunning);
  const token = useAuthStore((s) => s.token) ?? '';
  const acntNo = useAuthStore((s) => s.acntNo) ?? '';
 
  const marketName = market === 'KOSPI200' ? '코스피200' : '코스닥150';
 
  useEffect(() => {
    if (!visible || !token) return;
 
    setFuturesCode(null);
    setLoadingCode(true);
    const fetchFutures = market === 'KOSPI200'
      ? fetchNearFutureCode(token)
      : fetchNearKqdaqFutureCode(token);
    fetchFutures
      .then((code) => setFuturesCode(code))
      .catch(() => setFuturesCode(market === 'KOSPI200' ? 'A0166000' : 'A0666000'))
      .finally(() => setLoadingCode(false));
 
    setLoadingWeekly(true);
    loadNextWeeklyKeys();
  }, [visible, token, market]);
 
  const loadNextWeeklyKeys = async () => {
    try {
      let keys: WeekKeyItem[] = [];
 
      if (market === 'KOSDAQ150') {
        const codes = await fetchKQ150WeeklyCodes(token);
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const todayDate = today.getDate();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const unique = [...new Set(codes.map(c => `${c.week}${c.weekDay}`))];
        const withDates = unique.map(key => {
          const weekNum = parseInt(key.slice(1, 2));
          const isMonday = key.endsWith('MON');
          const targetDay = isMonday ? 1 : 4;
          let count = 0, actualDate = 999;
          for (let d = 1; d <= daysInMonth; d++) {
            if (new Date(year, month, d).getDay() === targetDay) {
              count++;
              if (count === weekNum) { actualDate = d; break; }
            }
          }
          return { key, label: `${weekNum}주 ${isMonday ? '월요일' : '목요일'}`, actualDate };
        });
        keys = withDates
          .filter(k => k.actualDate >= todayDate)
          .sort((a, b) => a.actualDate - b.actualDate)
          .map(({ actualDate, ...k }) => k);
      } else {
        // ✅ fetchKP200ValidWeeklyKeys: API 호출 필요한 async 함수
        const { keys: kp200Keys } = await fetchKP200ValidWeeklyKeys(token);
        keys = kp200Keys.map(k => ({ key: k.yyyymm, label: k.label }));
      }
 
      setNextWeeklyKeys(keys);
      if (keys.length > 0) setSelectedNextWeekly(keys[0].key);
    } catch (e) {
      console.log('다음 위클리 조회 에러:', e);
    } finally {
      setLoadingWeekly(false);
    }
  };
 
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);
 
  function adjustClosingPrice(delta: number) {
    const cur = parseFloat(closingPrice) || 0.02;
    const next = Math.max(0.01, parseFloat((cur + delta * 0.01).toFixed(2)));
    setClosingPrice(String(next));
  }
 
  function adjustHedgeQty(delta: number) {
    const next = Math.max(1, (parseInt(hedgeQty) || 1) + delta);
    setHedgeQty(String(next));
  }
 
  function adjustGapThreshold(delta: number) {
    const next = Math.max(1, (parseInt(gapThreshold) || 30) + delta);
    setGapThreshold(String(next));
  }
 
  async function handleStart() {
    if (!futuresCode) return;
 
    // 이삭줍기 등록
    const entry: AutoTradingEntry = {
      putCode, putName, actprice, market,
      closingPrice: parseFloat(closingPrice) || 0.02,
      hedgeQty: parseInt(hedgeQty) || 1,
      futuresCode,
      status: 'monitoring',
      currentPrice,
      registeredAt: new Date().toLocaleTimeString('ko-KR'),
      acntNo,
      emaEnabled, // ✅ AI 매도 활성화 여부
    };
    addEntry(entry);
 
    // 자동 풋매도 등록
    if (autoSellEnabled && selectedNextWeekly) {
      const found = nextWeeklyKeys.find(k => k.key === selectedNextWeekly);
      const config: AutoSellConfig = {
        enabled: true,
        market,
        nextWeeklyKey: selectedNextWeekly,
        nextWeeklyLabel: found?.label ?? selectedNextWeekly,
        sellTime: sellTime.replace(':', ''),
        gapThreshold: parseInt(gapThreshold) || (market === 'KOSPI200' ? 50 : 10),
        priceThreshold: parseInt(priceThreshold) || 10,
        acntNo,
        sold: false,
        checked: false,
      };
      addAutoSellConfig(config);
    }
 
    if (!isRunning) await startAutoTrading();
    onClose();
  }
 
  if (!visible) return null;
 
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.handle} />
 
            <View style={s.header}>
              <Text style={s.title}>🤖 자동화 설정</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
 
            {ordNo ? (
              <View style={s.ordNoBox}>
                <Text style={s.ordNoText}>✅ 주문번호 {ordNo} 접수완료</Text>
              </View>
            ) : null}
 
            {/* 종목 정보 */}
            <View style={s.infoCard}>
              <View style={s.infoTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.putName}>{putName}</Text>
                  <Text style={s.putCode}>{putCode}</Text>
                </View>
                <Text style={s.monitoringBadge}>● 모니터링 예정</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoSub}>행사가</Text>
                <Text style={s.infoVal}>{actprice.toLocaleString()}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoSub}>현재 옵션가</Text>
                <Text style={[s.infoVal, { color: '#3182f6' }]}>{currentPrice.toFixed(2)}</Text>
              </View>
            </View>
 
            {/* 청산 예약가 */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>● 청산 예약가</Text>
                <Text style={s.sectionSub}>옵션가가 이 가격 이하면 자동 청산</Text>
              </View>
              <View style={s.inputRow}>
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustClosingPrice(-1)}>
                  <Text style={s.adjText}>－</Text>
                </TouchableOpacity>
                <TextInput
                  style={s.inputBox} value={closingPrice}
                  onChangeText={setClosingPrice} keyboardType="numeric" textAlign="center"
                />
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustClosingPrice(1)}>
                  <Text style={s.adjText}>＋</Text>
                </TouchableOpacity>
              </View>
              <View style={s.quickRow}>
                {['0.01', '0.02', '0.05', '0.10'].map((v) => (
                  <TouchableOpacity
                    key={v} style={[s.quickBtn, closingPrice === v && s.quickBtnActive]}
                    onPress={() => setClosingPrice(v)}
                  >
                    <Text style={[s.quickText, closingPrice === v && s.quickTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
 
            {/* 선물 자동 매수 */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>● 선물 자동 매수</Text>
                <Text style={s.sectionSub}>{marketName} 현물 {'<'} 행사가 시 실행 (15:30~15:35)</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoSub}>근월물 코드</Text>
                {loadingCode ? (
                  <ActivityIndicator size="small" color="#3182f6" />
                ) : (
                  <Text style={s.infoVal}>{futuresCode ?? '-'}</Text>
                )}
              </View>
              <View style={s.inputRow}>
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustHedgeQty(-1)}>
                  <Text style={s.adjText}>－</Text>
                </TouchableOpacity>
                <TextInput
                  style={s.inputBox} value={`${hedgeQty}계약`}
                  onChangeText={(v) => setHedgeQty(v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric" textAlign="center"
                />
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustHedgeQty(1)}>
                  <Text style={s.adjText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
 
            {/* 자동 풋매도 예약 */}
            <View style={[s.section, autoSellEnabled && s.sectionActive]}>
              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setAutoSellEnabled(!autoSellEnabled)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, autoSellEnabled && s.checkboxChecked]}>
                  {autoSellEnabled && <Text style={s.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>다음 위클리 풋옵션 매도 예약</Text>
                  <Text style={s.sectionSub}>조건 충족 시 다음 만기 풋옵션 자동 매도</Text>
                </View>
              </TouchableOpacity>
 
              {autoSellEnabled && (
                <View style={s.autoSellBody}>
                  {/* 다음 위클리 선택 */}
                  <Text style={s.inputLabel}>다음 위클리</Text>
                  {loadingWeekly ? (
                    <ActivityIndicator size="small" color="#10b981" style={{ marginBottom: 12 }} />
                  ) : (
                    <View style={s.weekBtnRow}>
                      {nextWeeklyKeys.map(k => (
                        <TouchableOpacity
                          key={k.key}
                          style={[s.weekBtn, selectedNextWeekly === k.key && s.weekBtnActive]}
                          onPress={() => setSelectedNextWeekly(k.key)}
                        >
                          <Text style={[s.weekBtnText, selectedNextWeekly === k.key && s.weekBtnTextActive]}>
                            {k.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
 
                  {/* 매도 시점 */}
                  <Text style={s.inputLabel}>매도 시점 (HHMM)</Text>
                  <TextInput
                    style={s.timeInput}
                    value={sellTime}
                    onChangeText={setSellTime}
                    keyboardType="numeric"
                    placeholder="1510"
                    maxLength={4}
                  />
 
                  {/* 기준 차이값 */}
                  <Text style={s.inputLabel}>기준 차이값 (현물가 - 행사가 ≥ ?)</Text>
                  <View style={s.inputRow}>
                    <TouchableOpacity style={s.adjBtn} onPress={() => adjustGapThreshold(-5)}>
                      <Text style={s.adjText}>－</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={s.inputBox} value={gapThreshold}
                      onChangeText={v => setGapThreshold(v.replace(/[^0-9]/g, ''))}
                      keyboardType="numeric" textAlign="center"
                    />
                    <TouchableOpacity style={s.adjBtn} onPress={() => adjustGapThreshold(5)}>
                      <Text style={s.adjText}>＋</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.quickRow}>
                    {['10', '20', '30', '50'].map((v) => (
                      <TouchableOpacity
                        key={v} style={[s.quickBtn, gapThreshold === v && s.quickBtnActive]}
                        onPress={() => setGapThreshold(v)}
                      >
                        <Text style={[s.quickText, gapThreshold === v && s.quickTextActive]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
 
                  {/* 지정호가 */}
                  <Text style={[s.inputLabel, { marginTop: 12 }]}>지정호가 (최소 옵션 프리미엄 ≥ ?)</Text>
                  <View style={s.quickRow}>
                    {['5', '7', '10', '15', '20'].map((v) => (
                      <TouchableOpacity
                        key={v} style={[s.quickBtn, priceThreshold === v && s.quickBtnActive]}
                        onPress={() => setPriceThreshold(v)}
                      >
                        <Text style={[s.quickText, priceThreshold === v && s.quickTextActive]}>{v}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
 
                  {/* 조건 요약 */}
                  <View style={s.condSummary}>
                    <Text style={s.condText}>
                      📋 {sellTime.slice(0, 2)}:{sellTime.slice(2, 4)} 현물가 - 행사가 {'>'} {gapThreshold}{'\n'}
                      AND 옵션현재가 ≥ {priceThreshold} 이면{'\n'}
                      {nextWeeklyKeys.find(k => k.key === selectedNextWeekly)?.label ?? ''}{'\n'}
                      가장 낮은 행사가 풋옵션{'\n'}
                      매도호가-매수호가 ≤ {market === 'KOSPI200' ? '0.2' : '2'} 확인 후 매수호가로 매도
                    </Text>
                  </View>
                </View>
              )}
            </View>
 
            {/* AI 매도 (EMA) */}
            <View style={[s.section, emaEnabled && s.sectionEma]}>
              <TouchableOpacity
                style={s.checkRow}
                onPress={() => setEmaEnabled(!emaEnabled)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, emaEnabled && s.checkboxEma]}>
                  {emaEnabled && <Text style={s.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>AI 매도 (EMA)</Text>
                  <Text style={s.sectionSub}>EMA 신호 감지 시 현재가 지정가 자동 매도</Text>
                </View>
              </TouchableOpacity>
 
              {emaEnabled && (
                <View style={s.emaBody}>
                  <View style={s.condSummary}>
                    <Text style={s.condText}>
                      📈 EMA9 {'<'} EMA26 + 하락 추세 감지{'\n'}
                      → {putCode} 현재가 지정가 매도{'\n'}
                      → 매도 성공 시 선물 자동매수 전환
                    </Text>
                  </View>
                </View>
              )}
            </View>
 
            {/* 장마감 자동처리 */}
            <View style={s.timeCard}>
              <Text style={s.timeTitle}>⏰ 장마감 자동처리</Text>
              {[
                ['15:10~', '다음 위클리 풋매도 조건 체크'],
                ['15:30~15:35', `손실 시 선물 ${hedgeQty}계약 매수 (+0.2p)`],
                ['15:45', '자동매매 종료'],
              ].map(([time, desc]) => (
                <View key={time} style={s.timeRow}>
                  <Text style={s.timeLabel}>{time}</Text>
                  <Text style={s.timeDesc}>{desc}</Text>
                </View>
              ))}
            </View>
 
            <View style={s.btnRow}>
              <TouchableOpacity style={s.skipBtn} onPress={onClose}>
                <Text style={s.skipText}>나중에</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.startBtn, (!futuresCode || loadingCode) && s.startBtnDisabled]}
                onPress={handleStart}
                disabled={!futuresCode || loadingCode}
              >
                {loadingCode
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.startText}>🤖 자동화 시작</Text>
                }
              </TouchableOpacity>
            </View>
 
            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}
 
const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SCREEN_H * 0.92,
    paddingHorizontal: 20, paddingTop: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  closeBtn: { fontSize: 18, color: '#aaa', padding: 4 },
  ordNoBox: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  ordNoText: { fontSize: 14, fontWeight: '700', color: '#16a34a', textAlign: 'center' },
  infoCard: { backgroundColor: '#f8f9ff', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e8edff' },
  infoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  putName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  putCode: { fontSize: 11, color: '#aaa' },
  monitoringBadge: { fontSize: 12, color: '#3182f6', fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  infoSub: { fontSize: 13, color: '#888' },
  infoVal: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f0f0f0' },
  sectionActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  sectionEma: { borderColor: '#8b5cf6', backgroundColor: '#faf5ff' }, // ✅ AI 매도 섹션 색상
  sectionHeader: { marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#aaa' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: '#10b981', backgroundColor: '#10b981' },
  checkboxEma: { borderColor: '#8b5cf6', backgroundColor: '#8b5cf6' }, // ✅ AI 매도 체크박스
  emaBody: { marginTop: 12 },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  autoSellBody: { marginTop: 16 },
  inputLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 8 },
  timeInput: { height: 44, backgroundColor: '#f5f6f8', borderRadius: 10, paddingHorizontal: 14, fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  weekBtnRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  weekBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: '#e0e0e0' },
  weekBtnActive: { borderColor: '#10b981', backgroundColor: '#f0fdf4' },
  weekBtnText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  weekBtnTextActive: { color: '#10b981' },
  condSummary: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  condText: { fontSize: 12, color: '#166534', lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 22, color: '#1a1a1a' },
  inputBox: { flex: 1, height: 48, backgroundColor: '#f5f6f8', borderRadius: 12, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8' },
  quickBtnActive: { backgroundColor: '#3182f6' },
  quickText: { fontSize: 13, fontWeight: '600', color: '#888' },
  quickTextActive: { color: '#fff' },
  timeCard: { backgroundColor: '#fffbeb', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#fde68a' },
  timeTitle: { fontSize: 13, fontWeight: '700', color: '#92400e', marginBottom: 10 },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  timeLabel: { fontSize: 12, fontWeight: '700', color: '#b45309', width: 100 },
  timeDesc: { fontSize: 12, color: '#78716c', flex: 1 },
  btnRow: { flexDirection: 'row', gap: 10 },
  skipBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#f5f6f8', alignItems: 'center' },
  skipText: { fontSize: 15, fontWeight: '700', color: '#888' },
  startBtn: { flex: 2, paddingVertical: 16, borderRadius: 14, backgroundColor: '#1a1a1a', alignItems: 'center' },
  startBtnDisabled: { backgroundColor: '#ccc' },
  startText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});