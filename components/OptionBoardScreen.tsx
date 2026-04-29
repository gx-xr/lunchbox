import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OptionBoardItem } from '../services/options';
 
type WeekTab = 'ALL' | 'MON' | 'THU';
 
interface WeekKey {
  key: string;
  label: string;
}
 
interface Props {
  market: 'KOSPI200' | 'KOSDAQ150';
  futurePrice: number;
  spotPrice?: number;
  futureLabel: string;
  spotLabel?: string;
  jandatecnt: number;
  board: OptionBoardItem[];
  weekKeys: WeekKey[];
  selectedWeekKey: string;
  loading: boolean;
  refreshing: boolean;
  weekTab: WeekTab;
  onWeekTabChange: (tab: WeekTab) => void;
  onWeekKeyChange: (key: string) => void;
  onRefresh: () => void;
}
 
// ─── 액션 바텀시트 ───────────────────────────────────────────
function ActionSheet({
  visible, item, clickedSide, market, selectedWeekKey, onClose, onSelect,
}: {
  visible: boolean;
  item: OptionBoardItem | null;
  clickedSide: 'CALL' | 'PUT' | null;
  market: 'KOSPI200' | 'KOSDAQ150';
  selectedWeekKey: string;
  onClose: () => void;
  onSelect: (params: {
    putCode: string; actprice: number; putPrice: number;
    optionType: 'PUT' | 'CALL'; side: 'BUY' | 'SELL';
  }) => void;
}) {
  if (!item) return null;
 
  const allActions = [
    { label: '콜 매수', sublabel: item.callPrice > 0 ? item.callPrice.toFixed(2) : '-', code: item.callCode, price: item.callPrice, optionType: 'CALL' as const, side: 'BUY' as const, color: '#f04452', bg: '#fff1f0', disabled: !item.callCode || item.callPrice <= 0 },
    { label: '콜 매도', sublabel: item.callPrice > 0 ? item.callPrice.toFixed(2) : '-', code: item.callCode, price: item.callPrice, optionType: 'CALL' as const, side: 'SELL' as const, color: '#3182f6', bg: '#eff6ff', disabled: !item.callCode || item.callPrice <= 0 },
    { label: '풋 매수', sublabel: item.putPrice > 0 ? item.putPrice.toFixed(2) : '-', code: item.putCode, price: item.putPrice, optionType: 'PUT' as const, side: 'BUY' as const, color: '#f04452', bg: '#fff1f0', disabled: !item.putCode || item.putPrice <= 0 },
    { label: '풋 매도', sublabel: item.putPrice > 0 ? item.putPrice.toFixed(2) : '-', code: item.putCode, price: item.putPrice, optionType: 'PUT' as const, side: 'SELL' as const, color: '#3182f6', bg: '#eff6ff', disabled: !item.putCode || item.putPrice <= 0 },
  ];
  const actions = clickedSide ? allActions.filter(a => a.optionType === clickedSide) : allActions;
 
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={as.overlay} activeOpacity={1} onPress={onClose} />
      <View style={as.sheet}>
        <View style={as.handle} />
        <View style={as.titleRow}>
          <Text style={as.title}>행사가 {item.actprice.toLocaleString()}</Text>
          <TouchableOpacity onPress={onClose}><Text style={as.closeBtn}>✕</Text></TouchableOpacity>
        </View>
        <View style={as.priceRow}>
          {(!clickedSide || clickedSide === 'CALL') && (
            <View style={as.priceItem}>
              <Text style={as.priceLabel}>콜</Text>
              <Text style={[as.priceValue, { color: '#f04452' }]}>{item.callPrice > 0 ? item.callPrice.toFixed(2) : '-'}</Text>
            </View>
          )}
          {!clickedSide && <View style={as.priceDivider} />}
          {(!clickedSide || clickedSide === 'PUT') && (
            <View style={as.priceItem}>
              <Text style={as.priceLabel}>풋</Text>
              <Text style={[as.priceValue, { color: '#3182f6' }]}>{item.putPrice > 0 ? item.putPrice.toFixed(2) : '-'}</Text>
            </View>
          )}
        </View>
        <View style={as.actionGrid}>
          {actions.map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[as.actionBtn, { backgroundColor: action.bg }, action.disabled && as.actionDisabled]}
              onPress={() => { if (!action.disabled) onSelect({ putCode: action.code!, actprice: item.actprice, putPrice: action.price, optionType: action.optionType, side: action.side }); }}
              activeOpacity={action.disabled ? 1 : 0.7}
            >
              <Text style={[as.actionLabel, { color: action.disabled ? '#ccc' : action.color }]}>{action.label}</Text>
              <Text style={[as.actionSublabel, { color: action.disabled ? '#ccc' : action.color }]}>{action.sublabel}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 24 }} />
      </View>
    </Modal>
  );
}
 
export default function OptionBoardScreen({
  market, futurePrice, spotPrice, futureLabel, spotLabel,
  jandatecnt, board, weekKeys, selectedWeekKey,
  loading, refreshing, weekTab,
  onWeekTabChange, onWeekKeyChange, onRefresh,
}: Props) {
  const router = useRouter();
  const flatListRef = useRef<FlatList>(null);
  const [selectedItem, setSelectedItem] = useState<OptionBoardItem | null>(null);
  const [clickedSide, setClickedSide] = useState<'CALL' | 'PUT' | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
 
  const atmActprice = board.length > 0 && futurePrice > 0
    ? board.reduce((prev, cur) =>
        Math.abs(cur.actprice - futurePrice) < Math.abs(prev.actprice - futurePrice) ? cur : prev
      ).actprice
    : null;
 
  // ─── ATM 스크롤 ─────────────────────────────────────────────
  useEffect(() => {
    if (!atmActprice || board.length === 0 || loading) return;
    const atmIndex = board.findIndex(item => item.actprice === atmActprice);
    if (atmIndex < 0) return;
    const scrollIndex = Math.max(0, atmIndex - 2);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: scrollIndex, animated: true });
    }, 400);
  }, [atmActprice, board.length, loading]);
 
  const filteredWeekKeys = weekKeys.filter(wk => {
    if (weekTab === 'ALL') return true;
    return wk.key.endsWith(weekTab);
  });
 
  const handleActionSelect = (params: {
    putCode: string; actprice: number; putPrice: number;
    optionType: 'PUT' | 'CALL'; side: 'BUY' | 'SELL';
  }) => {
    setSheetVisible(false);
    router.push({
      pathname: '/order/put-order',
      params: {
        putCode: params.putCode,
        actprice: String(params.actprice),
        putPrice: String(params.putPrice),
        weekKey: selectedWeekKey,
        market,
        optionType: params.optionType,
        side: params.side,
      },
    });
  };
 
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      {/* 전체/월/목 탭 */}
      <View style={s.tabRow}>
        {(['ALL', 'MON', 'THU'] as WeekTab[]).map(tab => (
          <TouchableOpacity key={tab} style={[s.tabBtn, weekTab === tab && s.tabActive]} onPress={() => onWeekTabChange(tab)}>
            <Text style={[s.tabText, weekTab === tab && s.tabTextActive]}>
              {tab === 'ALL' ? '전체' : tab === 'MON' ? '월요일' : '목요일'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
 
      {/* 주차 버튼 */}
      <View style={s.weekRow}>
        {filteredWeekKeys.map(wk => (
          <TouchableOpacity
            key={wk.key}
            style={[s.weekBtn, selectedWeekKey === wk.key && s.weekBtnActive]}
            onPress={() => onWeekKeyChange(wk.key)}
          >
            <Text style={[s.weekBtnText, selectedWeekKey === wk.key && s.weekBtnTextActive]}>{wk.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
 
      {/* 지수 + 잔존일 */}
      <View style={s.summaryRow}>
        <View style={s.summaryLeft}>
          {spotPrice != null && spotPrice > 0 && (
            <View style={s.priceItem}>
              <Text style={s.priceLabel}>{spotLabel ?? '현물'}</Text>
              <Text style={s.priceValue}>{spotPrice.toLocaleString()}</Text>
            </View>
          )}
          {futurePrice > 0 && (
            <View style={s.priceItem}>
              <Text style={s.priceLabel}>{futureLabel}</Text>
              <Text style={s.priceValue}>{futurePrice.toLocaleString()}</Text>
            </View>
          )}
        </View>
        {jandatecnt > 0 && (
          <Text style={s.jandateText}>잔존 <Text style={s.jandateValue}>{jandatecnt}일</Text></Text>
        )}
      </View>
 
      {/* 테이블 헤더 */}
      <View style={s.tableHeader}>
        <Text style={[s.th, { flex: 1.2, color: '#888' }]}>대비</Text>
        <Text style={[s.th, { flex: 1.2, color: '#f04452' }]}>콜</Text>
        <Text style={[s.th, { flex: 1.5, textAlign: 'center' }]}>행사가</Text>
        <Text style={[s.th, { flex: 1.2, color: '#3182f6', textAlign: 'right' }]}>풋</Text>
        <Text style={[s.th, { flex: 1.2, color: '#888', textAlign: 'right' }]}>대비</Text>
      </View>
 
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#3182f6" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={board}
          keyExtractor={item => String(item.actprice)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: Math.max(0, index), animated: true });
            }, 500);
          }}
          renderItem={({ item }) => {
            const isATM = item.actprice === atmActprice;
 
            // ★ 콜/풋 가격 색상: 대비(change) 기준으로 결정 (월물과 동일 로직)
            const callColor = item.callChange > 0 ? '#f04452' : item.callChange < 0 ? '#3182f6' : '#1a1a1a';
            const putColor = item.putChange > 0 ? '#f04452' : item.putChange < 0 ? '#3182f6' : '#1a1a1a';
            const callChangeColor = item.callChange > 0 ? '#f04452' : item.callChange < 0 ? '#3182f6' : '#cccccc';
            const putChangeColor = item.putChange > 0 ? '#f04452' : item.putChange < 0 ? '#3182f6' : '#cccccc';
 
            return (
              <View style={[s.row, isATM && s.atmRow]}>
                {/* 콜 대비 */}
                <Text style={[s.cell, { flex: 1.2, color: callChangeColor, fontSize: 12 }]}>
                  {item.callChange !== 0 ? (item.callChange > 0 ? '▲' : '▼') : ''}
                  {item.callChange !== 0 ? Math.abs(item.callChange).toFixed(2) : '-'}
                </Text>
                {/* 콜 가격 */}
                <TouchableOpacity style={{ flex: 1.2 }} onPress={() => { setSelectedItem(item); setClickedSide('CALL'); setSheetVisible(true); }} activeOpacity={0.6}>
                  <Text style={[s.cell, { color: callColor, fontWeight: '700' }]}>
                    {item.callPrice > 0 ? item.callPrice.toFixed(2) : '-'}
                  </Text>
                </TouchableOpacity>
                {/* 행사가 */}
                <TouchableOpacity style={[s.actpriceCell, isATM && s.atmCell]} onPress={() => { setSelectedItem(item); setClickedSide(null); setSheetVisible(true); }} activeOpacity={0.7}>
                  <Text style={[s.actpriceText, isATM && s.atmText]}>{item.actprice.toLocaleString()}</Text>
                  {isATM && <Text style={s.atmBadge}>ATM</Text>}
                </TouchableOpacity>
                {/* 풋 가격 */}
                <TouchableOpacity style={{ flex: 1.2 }} onPress={() => { setSelectedItem(item); setClickedSide('PUT'); setSheetVisible(true); }} activeOpacity={0.6}>
                  <Text style={[s.cell, { color: putColor, fontWeight: '700', textAlign: 'right' }]}>
                    {item.putPrice > 0 ? item.putPrice.toFixed(2) : '-'}
                  </Text>
                </TouchableOpacity>
                {/* 풋 대비 */}
                <Text style={[s.cell, { flex: 1.2, color: putChangeColor, textAlign: 'right', fontSize: 12 }]}>
                  {item.putChange !== 0 ? (item.putChange > 0 ? '▲' : '▼') : ''}
                  {item.putChange !== 0 ? Math.abs(item.putChange).toFixed(2) : '-'}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>데이터가 없습니다</Text></View>}
        />
      )}
 
      <ActionSheet
        visible={sheetVisible}
        item={selectedItem}
        clickedSide={clickedSide}
        market={market}
        selectedWeekKey={selectedWeekKey}
        onClose={() => setSheetVisible(false)}
        onSelect={handleActionSelect}
      />
    </SafeAreaView>
  );
}
 
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f6f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f5f6f8' },
  tabActive: { backgroundColor: '#1a1a1a' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  tabTextActive: { color: '#fff' },
  weekRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexWrap: 'wrap' },
  weekBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1.5, borderColor: '#e0e0e0', backgroundColor: '#fff' },
  weekBtnActive: { borderColor: '#3182f6', backgroundColor: '#eff6ff' },
  weekBtnText: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  weekBtnTextActive: { color: '#3182f6' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  summaryLeft: { flexDirection: 'row', gap: 16 },
  priceItem: { alignItems: 'flex-start' },
  priceLabel: { fontSize: 10, color: '#aaa', fontWeight: '600' },
  priceValue: { fontSize: 14, fontWeight: '800', color: '#1a1a1a' },
  jandateText: { fontSize: 12, color: '#888' },
  jandateValue: { fontWeight: '700', color: '#1a1a1a' },
  tableHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  th: { fontSize: 11, fontWeight: '700', color: '#888', flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  atmRow: { backgroundColor: '#f0fdf4' },
  cell: { fontSize: 14, flex: 1 },
  actpriceCell: { flex: 1.5, alignItems: 'center', backgroundColor: '#f5f6f8', borderRadius: 8, paddingVertical: 5, marginHorizontal: 2 },
  atmCell: { backgroundColor: '#bbf7d0' },
  actpriceText: { fontSize: 13, fontWeight: '700', color: '#1a1a1a' },
  atmText: { color: '#15803d' },
  atmBadge: { fontSize: 9, fontWeight: '800', color: '#15803d', marginTop: 1 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#bbb', fontSize: 14 },
});
 
const as = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: -4 }, elevation: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a' },
  closeBtn: { fontSize: 18, color: '#aaa', padding: 4 },
  priceRow: { flexDirection: 'row', backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 20, gap: 8 },
  priceItem: { flex: 1, alignItems: 'center' },
  priceDivider: { width: 1, backgroundColor: '#e0e0e0' },
  priceLabel: { fontSize: 11, color: '#888', fontWeight: '600', marginBottom: 4 },
  priceValue: { fontSize: 20, fontWeight: '800' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { width: '47.5%', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  actionDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  actionSublabel: { fontSize: 13, fontWeight: '600' },
});