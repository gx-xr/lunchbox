import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="order/[code]"
          options={{
            headerShown: true,
            headerTitle: '주문',
            headerBackTitle: '뒤로',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#1a1a1a',
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </>
  );
}