import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AccountSummary } from '../types/trading';

interface Props {
  account: AccountSummary;
}

function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export default function AccountSummaryCard({ account }: Props) {
  const isProfit = account.evalProfit >= 0;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>내 계좌</Text>

      <View style={styles.row}>
        <View style={styles.item}>
          <Text style={styles.label}>예수금</Text>
          <Text style={styles.value}>{formatKRW(account.deposit)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.item}>
          <Text style={styles.label}>주문가능</Text>
          <Text style={styles.value}>{formatKRW(account.orderable)}</Text>
        </View>
      </View>

      <View style={styles.profitRow}>
        <Text style={styles.label}>평가손익</Text>
        <Text style={[styles.profitValue, isProfit ? styles.profit : styles.loss]}>
          {isProfit ? '+' : ''}{formatKRW(account.evalProfit)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 13,
    color: '#888',
    marginBottom: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  item: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 16,
  },
  label: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  profitRow: {
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profitValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  profit: {
    color: '#f04452',
  },
  loss: {
    color: '#1976d2',
  },
});