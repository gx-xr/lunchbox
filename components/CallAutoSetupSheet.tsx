/**
 * components/CallAutoSetupSheet.tsx
 * ✅ 콜매도 자동화 설정 시트
 * ✅ 청산 예약가 + 선물 자동매도 (offerho1 - 0.2p)
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Modal, Animated, Dimensions,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useAutoTradingStore, CallTradingEntry } from '../store/autoTradingStore';
import { useAuthStore } from '../store/authStore';
import { startAutoTrading } from '../services/autoTrading';
import { fetchNearFutureCode, fetchNearKqdaqFutureCode } from '../services/market';
 
const { height: SCREEN_H } = Dimensions.get('window');
 
interface Props {
  visible: boolean;
  onClose: () => void;
  callCode: string;
  callName: string;
  actprice: number;
  currentPrice: number;
  market: 'KOSPI200' | 'KOSDAQ150';
  ordNo?: string;
}
 
export default function CallAutoSetupSheet({
  visible, onClose, callCode, callName, actprice, currentPrice, market, ordNo,
}: Props) {
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
 
  const [closingPrice, setClosingPrice] = useState('0.20');
  const [hedgeQty, setHedgeQty] = useState('1');
  const [futuresCode, setFuturesCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
 
  const addCallEntry = useAutoTradingStore((s) => s.addCallEntry);
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
  }, [visible, token, market]);
 
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);
 
  function adjustClosingPrice(delta: number) {
    const cur = parseFloat(closingPrice) || 0.20;
    const next = Math.max(0.01, parseFloat((cur + delta * 0.01).toFixed(2)));
    setClosingPrice(String(next));
  }
 
  function adjustHedgeQty(delta: number) {
    const next = Math.max(1, (parseInt(hedgeQty) || 1) + delta);
    setHedgeQty(String(next));
  }
 
  async function handleStart() {
    if (!futuresCode) return;
 
    const entry: CallTradingEntry = {
      callCode,
      callName,
      actprice,
      market,
      closingPrice: parseFloat(closingPrice) || 0.20,
      hedgeQty: parseInt(hedgeQty) || 1,
      futuresCode,
      status: 'monitoring',
      currentPrice,
      registeredAt: new Date().toLocaleTimeString('ko-KR'),
      acntNo,
      averageBasis: 0,         // 베이시스는 15:00 이후 자동 계산
      basisCalculatedAt: '',
    };
    addCallEntry(entry);
 
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
              <Text style={s.title}>🤖 콜매도 자동화 설정</Text>
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
                  <Text style={s.callName}>{callName}</Text>
                  <Text style={s.callCode}>{callCode}</Text>
                </View>
                <Text style={s.monitoringBadge}>● 모니터링 예정</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoSub}>행사가</Text>
                <Text style={s.infoVal}>{actprice.toLocaleString()}</Text>
              </View>
              <View style={s.infoRow}>
                <Text style={s.infoSub}>현재 옵션가</Text>
                <Text style={[s.infoVal, { color: '#f04452' }]}>{currentPrice.toFixed(2)}</Text>
              </View>
            </View>
 
            {/* 청산 예약가 */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>💰 청산 예약가</Text>
                <Text style={s.sectionSub}>옵션가가 이 가격 이하면 자동 청산 (매수)</Text>
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
                {['0.05', '0.10', '0.20', '0.30'].map((v) => (
                  <TouchableOpacity
                    key={v} style={[s.quickBtn, closingPrice === v && s.quickBtnActive]}
                    onPress={() => setClosingPrice(v)}
                  >
                    <Text style={[s.quickText, closingPrice === v && s.quickTextActive]}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
 
            {/* 선물 자동 매도 */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>🪙 선물 자동 매도</Text>
                <Text style={s.sectionSub}>행사가 {'<'} 추정현물가 시 실행 (15:30)</Text>
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
                  style={s.inputBox} value={`${hedgeQty} 계약`}
                  onChangeText={(v) => setHedgeQty(v.replace(/[^0-9]/g, ''))}
                  keyboardType="numeric" textAlign="center"
                />
                <TouchableOpacity style={s.adjBtn} onPress={() => adjustHedgeQty(1)}>
                  <Text style={s.adjText}>＋</Text>
                </TouchableOpacity>
              </View>
 
              {/* 로직 요약 */}
              <View style={s.condSummary}>
                <Text style={s.condText}>
                  📊 15:00~15:19 분봉 10개로 평균 베이시스 계산{'\n'}
                  추정현물가 = 선물 예상체결가 - 평균베이시스{'\n'}
                  {'\n'}
                  ✅ 행사가 {actprice} {'<'} 추정현물가 → 선물매도{'\n'}
                  매도가: offerho1 - 0.2p
                </Text>
              </View>
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
  ordNoBox: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  ordNoText: { fontSize: 14, fontWeight: '700', color: '#1d4ed8', textAlign: 'center' },
  infoCard: { backgroundColor: '#f0f7ff', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  infoTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  callName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 3 },
  callCode: { fontSize: 11, color: '#aaa' },
  monitoringBadge: { fontSize: 12, color: '#f04452', fontWeight: '600' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  infoSub: { fontSize: 13, color: '#888' },
  infoVal: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f0f0f0' },
  sectionHeader: { marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#aaa' },
  condSummary: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  condText: { fontSize: 12, color: '#1e40af', lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adjBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f6f8', alignItems: 'center', justifyContent: 'center' },
  adjText: { fontSize: 22, color: '#1a1a1a' },
  inputBox: { flex: 1, height: 48, backgroundColor: '#f5f6f8', borderRadius: 12, fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  quickBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8' },
  quickBtnActive: { backgroundColor: '#3182f6' },
  quickText: { fontSize: 13, fontWeight: '600', color: '#888' },
  quickTextActive: { color: '#fff' },
  btnRow: { flexDirection: 'row', gap: 10 },
  skipBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#f5f6f8', alignItems: 'center' },
  skipText: { fontSize: 15, fontWeight: '700', color: '#888' },
  startBtn: { flex: 2, paddingVertical: 16, borderRadius: 14, backgroundColor: '#3182f6', alignItems: 'center' },
  startBtnDisabled: { backgroundColor: '#ccc' },
  startText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});