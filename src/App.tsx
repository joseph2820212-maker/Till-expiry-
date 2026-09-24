import React, { useCallback, useEffect, useReducer, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppAlertOverlay } from './components/AppAlertOverlay';
import { installGlobalErrorLogger } from './utils/errorLog';
import { AppNavigator } from './navigation/AppNavigator';
import { BillingProvider } from './modules/billing/BillingProvider';
import { colors } from './theme/colors';
import { initializeLanguage } from './i18n';
import { initCurrency } from './utils/currency';
import { recoverInterruptedRestore } from './modules/backup/backupFile';
import { loadSettings } from './modules/settings/settingsStore';
import { startReminderSync } from './modules/reminders/reminderService';

installGlobalErrorLogger();

const fontMap = {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
};

function FontFailureScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={fs.root}>
      <Text style={fs.title}>TillExpiry could not start</Text>
      <Text style={fs.body}>Required display fonts failed to load.</Text>
      <TouchableOpacity style={fs.btn} onPress={onRetry} activeOpacity={0.7}>
        <Text style={fs.btnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const rootStyle = { flex: 1 } as const;

const fs = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textDark, marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: colors.primaryBlue, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

function FontBootstrap({ onRetry }: { onRetry: () => void }) {
  const [fontsLoaded, fontError] = useFonts(fontMap);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    if (!fontsLoaded || fontError) return;
    let cancelled = false;
    (async () => {
      try { await recoverInterruptedRestore(); } catch { /* a broken journal must never block startup */ }
      await initializeLanguage();
      await initCurrency();
      try { await loadSettings(); } catch { /* defaults stay; settings screen can re-save */ }
      startReminderSync();
      if (!cancelled) setBootstrapped(true);
    })();
    return () => { cancelled = true; };
  }, [fontsLoaded, fontError]);

  if (fontError) {
    return <FontFailureScreen onRetry={onRetry} />;
  }

  if (!fontsLoaded || !bootstrapped) return null;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <BillingProvider>
            <ErrorBoundary>
              <AppNavigator />
            </ErrorBoundary>
            <AppAlertOverlay />
          </BillingProvider>
          <StatusBar style="dark" />
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  const [retryKey, retry] = useReducer((n: number) => n + 1, 0);
  const handleRetry = useCallback(() => { retry(); }, []);

  return <FontBootstrap key={retryKey} onRetry={handleRetry} />;
}
