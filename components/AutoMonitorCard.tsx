/**
 * components/AutoMonitorCard.tsx
 * ✅ getCurrentEntries()로 현재 계좌의 항목만 표시
 * ✅ emaEnabled 배지 추가
 * ✅ CallTradingEntry 콜매도 엔트리 추가
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useAutoTradingStore, AutoTradingEntry, CallTradingEntry } from '../store/autoTradingStore';
import { startAutoTrading, stopAutoTrading } from '../services/autoTrading';
import AutoSetupSheet from './AutoSetupSheet';
import CallAutoSetupSheet from './CallAutoSetupSheet';
 
function calcDaysLeft(): number {
  const now = new Date();
  const day = now.getDay();
  const targets = [1, 4];
  let minDays = 7;
  for (const target of targets) {
    let diff = target - day;
    if (diff < 0) diff += 7;
    if (diff < minDays) minDays = diff;
  }
  return minDays;
}
 
// ─── 풋매도 상태 배지 ─────────────────────────────────────────
function StatusBadge({ status }: { status: AutoTradingEntry['status'] }) {
  const config = {
    monitoring: { label: '● 모니터링 중', color: '#3182f6', bg: '#eff6ff' },
    closed:     { label: '✓ 청산완료',    color: '#16a34a', bg: '#f0fdf4' },
    closing:     { label: '✓ 청산접수완료',    color: '#16a34a', bg: '#f0fdf4' },
    hedged:     { label: '⚡ 헤지완료',   color: '#b45309', bg: '#fffbeb' },
  }[status];
  return (
    <View style={[bs.badge, { backgroundColor: config.bg }]}>
      <Text style={[bs.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}
 
// ─── 콜매도 상태 배지 ✅ ──────────────────────────────────────
function CallStatusBadge({ status }: { status: CallTradingEntry['status'] }) {
  const config = {
    monitoring: { label: '● 모니터링 중', color: '#f04452', bg: '#fff1f0' },
    closed:     { label: '✓ 청산완료',    color: '#16a34a', bg: '#f0fdf4' },
    closing:     { label: '✓ 청산접수완료',    color: '#16a34a', bg: '#f0fdf4' },
    hedged:     { label: '⚡ 매도완료',   color: '#b45309', bg: '#fffbeb' },
  }[status];
  return (
    <View style={[bs.badge, { backgroundColor: config.bg }]}>
      <Text style={[bs.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}
 
const bs = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  text: { fontSize: 11, fontWeight: '700' },
});
 
// ─── 풋매도 엔트리 행 ─────────────────────────────────────────
function EntryRow({ entry, onEdit, onDelete }: {
  entry: AutoTradingEntry;
  onEdit: (entry: AutoTradingEntry) => void;
  onDelete: (putCode: string) => void;
}) {
  const daysLeft = calcDaysLeft();
  const distToClose = Math.max(0, entry.currentPrice - entry.closingPrice);
 
  return (
    <View style={[es.row, es.putRow]}>
      <View style={es.top}>
        <View style={es.left}>
          <Text style={es.putName} numberOfLines={1}>{entry.putName || `${entry.market} 풋옵션`}</Text>
          <Text style={es.putCode}>{entry.putCode}</Text>
          <Text style={es.sub}>행사가 {entry.actprice.toLocaleString()}</Text>
        </View>
        <View style={es.right}>
          <StatusBadge status={entry.status} />
          {/* ✅ 풋매도 배지 */}
          <View style={es.putBadge}>
            <Text style={es.putBadgeText}>📉 풋매도</Text>
          </View>
          {entry.emaEnabled && (
            <View style={es.emaBadge}>
              <Text style={es.emaText}>🤖 AI 매도</Text>
            </View>
          )}
          {entry.status === 'monitoring' && (
            <Text style={es.dist}>청산까지 {distToClose.toFixed(2)}</Text>
          )}
        </View>
      </View>
 
      <View style={es.infoRow}>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>잔여일</Text>
          <Text style={[es.infoValue, { color: daysLeft === 0 ? '#ef4444' : daysLeft <= 1 ? '#f59e0b' : '#1a1a1a' }]}>
            {daysLeft === 0 ? '오늘 만기' : `${daysLeft}일`}
          </Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>청산 예약가</Text>
          <Text style={es.infoValue}>{entry.closingPrice.toFixed(2)}</Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>선물 매수</Text>
          <Text style={es.infoValue}>{entry.hedgeQty}계약</Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>등록</Text>
          <Text style={es.infoValue}>{entry.registeredAt}</Text>
        </View>
      </View>
 
      {entry.status === 'monitoring' && (
        <View style={es.priceRow}>
          <Text style={es.priceLabel}>현재가 <Text style={es.priceVal}>{entry.currentPrice.toFixed(2)}</Text></Text>
          <Text style={es.priceLabel}>청산가 <Text style={es.priceVal}>{entry.closingPrice.toFixed(2)}</Text></Text>
        </View>
      )}
 
      <View style={es.btnRow}>
        <TouchableOpacity style={es.editBtn} onPress={() => onEdit(entry)}>
          <Text style={es.editText}>✏️ 수정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={es.deleteBtn} onPress={() =>
          Alert.alert('자동화 삭제', `${entry.putCode} 자동화를 삭제하시겠습니까?`, [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => onDelete(entry.putCode) },
          ])
        }>
          <Text style={es.deleteText}>🗑 삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
 
// ─── 콜매도 엔트리 행 ✅ ──────────────────────────────────────
function CallEntryRow({ entry, onEdit, onDelete }: {
  entry: CallTradingEntry;
  onEdit: (entry: CallTradingEntry) => void;
  onDelete: (callCode: string) => void;
}) {
  const daysLeft = calcDaysLeft();
  const distToClose = Math.max(0, entry.currentPrice - entry.closingPrice);
 
  return (
    <View style={[es.row, ces.callRow]}>
      <View style={es.top}>
        <View style={es.left}>
          <Text style={es.putName} numberOfLines={1}>{entry.callName || `${entry.market} 콜옵션`}</Text>
          <Text style={es.putCode}>{entry.callCode}</Text>
          <Text style={es.sub}>행사가 {entry.actprice.toLocaleString()}</Text>
        </View>
        <View style={es.right}>
          <CallStatusBadge status={entry.status} />
          {/* 콜매도 배지 */}
          <View style={ces.callBadge}>
            <Text style={ces.callBadgeText}>📈 콜매도</Text>
          </View>
          {entry.status === 'monitoring' && (
            <Text style={es.dist}>청산까지 {distToClose.toFixed(2)}</Text>
          )}
        </View>
      </View>
 
      <View style={es.infoRow}>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>잔여일</Text>
          <Text style={[es.infoValue, { color: daysLeft === 0 ? '#ef4444' : daysLeft <= 1 ? '#f59e0b' : '#1a1a1a' }]}>
            {daysLeft === 0 ? '오늘 만기' : `${daysLeft}일`}
          </Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>청산 예약가</Text>
          <Text style={es.infoValue}>{entry.closingPrice.toFixed(2)}</Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>선물 매도</Text>
          <Text style={es.infoValue}>{entry.hedgeQty}계약</Text>
        </View>
        <View style={es.infoItem}>
          <Text style={es.infoLabel}>등록</Text>
          <Text style={es.infoValue}>{entry.registeredAt}</Text>
        </View>
      </View>
 
      {/* 베이시스 정보 */}
      {entry.averageBasis !== 0 && (
        <View style={ces.basisRow}>
          <Text style={ces.basisText}>
            평균베이시스 {entry.averageBasis.toFixed(2)} ({entry.basisCalculatedAt} 계산)
          </Text>
        </View>
      )}
 
      {entry.status === 'monitoring' && (
        <View style={es.priceRow}>
          <Text style={es.priceLabel}>현재가 <Text style={es.priceVal}>{entry.currentPrice.toFixed(2)}</Text></Text>
          <Text style={es.priceLabel}>청산가 <Text style={es.priceVal}>{entry.closingPrice.toFixed(2)}</Text></Text>
        </View>
      )}
 
      <View style={es.btnRow}>
        <TouchableOpacity style={es.editBtn} onPress={() => onEdit(entry)}>
          <Text style={es.editText}>✏️ 수정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={es.deleteBtn} onPress={() =>
          Alert.alert('자동화 삭제', `${entry.callCode} 자동화를 삭제하시겠습니까?`, [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => onDelete(entry.callCode) },
          ])
        }>
          <Text style={es.deleteText}>🗑 삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
 
const ces = StyleSheet.create({
  callRow: { borderLeftWidth: 3, borderLeftColor: '#f04452', paddingLeft: 8 }, // ✅ 빨간 라인
  callBadge: { backgroundColor: '#fff1f0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  callBadgeText: { fontSize: 11, fontWeight: '700', color: '#f04452' },
  basisRow: { backgroundColor: '#f0f7ff', borderRadius: 8, padding: 8, marginTop: 6 },
  basisText: { fontSize: 11, color: '#3182f6' },
});
 
const es = StyleSheet.create({
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  left: { flex: 1, marginRight: 8 },
  putName: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  putCode: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  sub: { fontSize: 11, color: '#888' },
  right: { alignItems: 'flex-end', gap: 4 },
  dist: { fontSize: 11, color: '#888', marginTop: 2 },
  emaBadge: { backgroundColor: '#faf5ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  emaText: { fontSize: 11, fontWeight: '700', color: '#8b5cf6' },
  putBadge: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  putBadgeText: { fontSize: 11, fontWeight: '700', color: '#3182f6' },
  putRow: { borderLeftWidth: 3, borderLeftColor: '#3182f6', paddingLeft: 8 }, // ✅ 파란 라인
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  infoItem: { minWidth: '40%' },
  infoLabel: { fontSize: 10, color: '#aaa', marginBottom: 2 },
  infoValue: { fontSize: 12, fontWeight: '600', color: '#1a1a1a' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  priceLabel: { fontSize: 11, color: '#aaa' },
  priceVal: { fontSize: 11, fontWeight: '700', color: '#1a1a1a' },
  editBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f6f8', alignItems: 'center' },
  editText: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  deleteBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#fff1f0', alignItems: 'center' },
  deleteText: { fontSize: 13, fontWeight: '600', color: '#e53e3e' },
});
 
export default function AutoMonitorCard() {
  const isRunning = useAutoTradingStore((s) => s.isRunning);
  const removeEntry = useAutoTradingStore((s) => s.removeEntry);
  const removeCallEntry = useAutoTradingStore((s) => s.removeCallEntry); // ✅
  const getCurrentEntries = useAutoTradingStore((s) => s.getCurrentEntries);
  const getCurrentCallEntries = useAutoTradingStore((s) => s.getCurrentCallEntries); // ✅
 
  const entries = getCurrentEntries();
  const callEntries = getCurrentCallEntries(); // ✅
 
  const [editSheet, setEditSheet] = useState<{ visible: boolean; entry: AutoTradingEntry | null }>({
    visible: false, entry: null,
  });
  const [editCallSheet, setEditCallSheet] = useState<{ visible: boolean; entry: CallTradingEntry | null }>({ // ✅
    visible: false, entry: null,
  });
 
  if (entries.length === 0 && callEntries.length === 0) return null;
 
  const activeCount = entries.filter((e) => e.status === 'monitoring').length;
  const callActiveCount = callEntries.filter((e) => e.status === 'monitoring').length; // ✅
  const emaCount = entries.filter((e) => e.emaEnabled).length;
  const totalActive = activeCount + callActiveCount;
 
  return (
    <>
      <View style={s.card}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.title}>🤖 자동화</Text>
            {isRunning && totalActive > 0 ? (
              <View style={s.runningDot}>
                <Text style={s.runningText}>
                  실행 중 {totalActive}개{emaCount > 0 ? ` · AI ${emaCount}개` : ''}
                </Text>
              </View>
            ) : (
              <View style={s.stoppedDot}><Text style={s.stoppedText}>중지됨</Text></View>
            )}
          </View>
          {isRunning ? (
            <TouchableOpacity style={s.stopBtn} onPress={() =>
              Alert.alert('자동화 중지', '자동화를 중지하시겠습니까?\n(등록된 항목은 유지됩니다)', [
                { text: '취소', style: 'cancel' },
                { text: '중지', style: 'destructive', onPress: () => stopAutoTrading() },
              ])
            }>
              <Text style={s.stopText}>중지</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.startBtn} onPress={() =>
              Alert.alert('자동화 시작', '자동화를 다시 시작하시겠습니까?', [
                { text: '취소', style: 'cancel' },
                { text: '시작', onPress: () => startAutoTrading() },
              ])
            }>
              <Text style={s.startText}>▶ 다시시작</Text>
            </TouchableOpacity>
          )}
        </View>
 
        {/* 풋매도 섹션 */}
        {entries.length > 0 && (
          <>
            <View style={s.sectionLabel}>
              <Text style={s.sectionLabelText}>📉 풋매도 자동화</Text>
            </View>
            {entries.map((entry) => (
              <EntryRow
                key={entry.putCode}
                entry={entry}
                onEdit={(e) => setEditSheet({ visible: true, entry: e })}
                onDelete={removeEntry}
              />
            ))}
          </>
        )}
 
        {/* 콜매도 섹션 ✅ */}
        {callEntries.length > 0 && (
          <>
            <View style={[s.sectionLabel, { marginTop: entries.length > 0 ? 12 : 0 }]}>
              <Text style={[s.sectionLabelText, { color: '#3182f6' }]}>📈 콜매도 자동화</Text>
            </View>
            {callEntries.map((entry) => (
              <CallEntryRow
                key={entry.callCode}
                entry={entry}
                onEdit={(e) => setEditCallSheet({ visible: true, entry: e })}
                onDelete={removeCallEntry}
              />
            ))}
          </>
        )}
      </View>
 
      {/* 풋매도 수정 시트 */}
      {editSheet.entry && (
        <AutoSetupSheet
          visible={editSheet.visible}
          onClose={() => setEditSheet({ visible: false, entry: null })}
          putCode={editSheet.entry.putCode}
          putName={editSheet.entry.putName}
          actprice={editSheet.entry.actprice}
          currentPrice={editSheet.entry.currentPrice}
          market={editSheet.entry.market}
        />
      )}
 
      {/* 콜매도 수정 시트 ✅ */}
      {editCallSheet.entry && (
        <CallAutoSetupSheet
          visible={editCallSheet.visible}
          onClose={() => setEditCallSheet({ visible: false, entry: null })}
          callCode={editCallSheet.entry.callCode}
          callName={editCallSheet.entry.callName}
          actprice={editCallSheet.entry.actprice}
          currentPrice={editCallSheet.entry.currentPrice}
          market={editCallSheet.entry.market}
        />
      )}
    </>
  );
}
 
const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 }, elevation: 3, borderWidth: 1, borderColor: '#e8edff',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  runningDot: { backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  runningText: { fontSize: 11, fontWeight: '700', color: '#3182f6' },
  stoppedDot: { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  stoppedText: { fontSize: 11, color: '#aaa' },
  stopBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#fff1f0' },
  stopText: { fontSize: 13, fontWeight: '700', color: '#e53e3e' },
  startBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eff6ff' },
  startText: { fontSize: 13, fontWeight: '700', color: '#3182f6' },
  sectionLabel: { paddingVertical: 6, marginBottom: 4 },
  sectionLabelText: { fontSize: 12, fontWeight: '700', color: '#888' },
});