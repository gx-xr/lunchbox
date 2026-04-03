import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Symbol } from '../types/trading';

interface Props {
  symbols: Symbol[];
  onSelect: (symbol: Symbol) => void;
}

function ChangeText({ change, rate }: { change: number; rate: number }) {
  const isUp = change >= 0;
  const color = isUp ? '#f04452' : '#1976d2';
  const sign = isUp ? '+' : '';
  return (
    <Text style={[styles.change, { color }]}>
      {sign}{change} ({sign}{rate.toFixed(2)}%)
    </Text>
  );
}

function SymbolItem({ item, onSelect }: { item: Symbol; onSelect: (s: Symbol) => void }) {
  return (
    <TouchableOpacity style={styles.item} onPress={() => onSelect(item)} activeOpacity={0.7}>
      <View style={styles.left}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.code}>{item.code} · {item.market}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.price}>{item.price.toLocaleString('ko-KR')}</Text>
        <ChangeText change={item.change} rate={item.changeRate} />
      </View>
    </TouchableOpacity>
  );
}

export default function SymbolList({ symbols, onSelect }: Props) {
  if (symbols.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={symbols}
        keyExtractor={(s) => s.code}
        renderItem={({ item }) => <SymbolItem item={item} onSelect={onSelect} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  separator: {
    height: 1,
    backgroundColor: '#f5f5f5',
    marginHorizontal: 16,
  },
  left: {
    flex: 1,
  },
  right: {
    alignItems: 'flex-end',
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  code: {
    fontSize: 12,
    color: '#aaa',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 2,
  },
  change: {
    fontSize: 12,
    fontWeight: '600',
  },
});