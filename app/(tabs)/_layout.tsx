import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#f0f0f0',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#3182f6',
        tabBarInactiveTintColor: '#bbb',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarLabel: '홈', tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarLabel: '설정', tabBarIcon: () => null }}
      />
    </Tabs>
  );
}