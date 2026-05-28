import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, TextInput } from 'react-native';

// ✅ 폰트 스케일링 최대 1.2배 제한 (시스템 폰트 크기 때문에 UI 깨짐 방지)
(Text as any).defaultProps = { ...(Text as any).defaultProps, maxFontSizeMultiplier: 1.2 };
(TextInput as any).defaultProps = { ...(TextInput as any).defaultProps, maxFontSizeMultiplier: 1.2 };

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        
        <Stack.Screen
          name="order/kosdaq-options"
          options={{
            headerShown: true,
            headerTitle: '코스닥150 위클리 옵션',
            headerBackTitle: '뒤로',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#1a1a1a',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="order/kospi-options"
          options={{
            headerShown: true,
            headerTitle: '코스피200 위클리 옵션',
            headerBackTitle: '뒤로',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#1a1a1a',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="order/put-order"
          options={{
            headerShown: true,
            headerTitle: '풋옵션 매도',
            headerBackTitle: '뒤로',
            headerStyle: { backgroundColor: '#fff' },
            headerTintColor: '#1a1a1a',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="order/futures"
          options={{
            headerShown: true,
            headerTitle: '선물 매매',
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