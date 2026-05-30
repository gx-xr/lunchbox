import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  // ════════ 코드단 ════════
  // 안드로이드 시스템 네비게이션 바(뒤로/홈/최근앱 버튼) 영역 높이 가져오기
  const insets = useSafeAreaInsets();

  // ════════ UI단 ════════
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#f0f0f0',
            borderTopWidth: 1,
            // ▼▼▼ 변경: 시스템 네비바 높이만큼 탭바 늘리기 ▼▼▼
            height: 60 + insets.bottom,
            paddingBottom: 8 + insets.bottom,
            // ▲▲▲ 변경 끝 ▲▲▲
          },
          tabBarActiveTintColor: '#10c000',
          tabBarInactiveTintColor: '#bbb',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: '홈',
            tabBarIcon: () => <Text style={{ fontSize: 20 }}>🏠</Text>,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            tabBarLabel: '주문내역',
            tabBarIcon: () => <Text style={{ fontSize: 20 }}>📋</Text>,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            tabBarLabel: '검색',
            tabBarIcon: () => <Text style={{ fontSize: 20 }}>🔍</Text>,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            tabBarLabel: '설정',
            tabBarIcon: () => <Text style={{ fontSize: 20 }}>⚙️</Text>,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}