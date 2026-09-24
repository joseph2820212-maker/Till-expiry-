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
import { colors } from './theme/colors';
import { initializeLanguage } from './i18n';
import { runStartupRecovery, type RecoveryBlockReason } from './modules/backup/startupRecovery';
import { RecoveryRequiredScreen } from './modules/backup/RecoveryRequiredScreen';
import { bootstrapData } from './app/bootstrap';

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
  const [recoveryBlocked, setRecoveryBlocked] = useState<RecoveryBlockReason | null>(null);

  useEffect(() => {
    if (!fontsLoaded || fontError) return;
    let cancelled = false;
    (async () => {
      await initializeLanguage(); // device-only language key; needed so the recovery screen is translated
      // An interrupted restore that cannot be resolved blocks the app: business data from a partially replaced
      // dataset is never loaded or shown. Retry remounts this component and runs the recovery again.
      const recovery = await runStartupRecovery();
      if (recovery.status === 'recoveryRequired') {
        if (!cancelled) setRecoveryBlocked(recovery.reason);
        return;
      }
      await bootstrapData();
      if (!cancelled) setBootstrapped(true);
    })();
    return () => { cancelled = true; };
  }, [fontsLoaded, fontError]);

  if (fontError) {
    return <FontFailureScreen onRetry={onRetry} />;
  }

  if (recoveryBlocked) return <RecoveryRequiredScreen reason={recoveryBlocked} onRetry={onRetry} />;

  if (!fontsLoaded || !bootstrapped) return null;

  return (
    <GestureHandlerRootView style={rootStyle}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ErrorBoundary>
            <AppNavigator />
          </ErrorBoundary>
          <AppAlertOverlay />
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
