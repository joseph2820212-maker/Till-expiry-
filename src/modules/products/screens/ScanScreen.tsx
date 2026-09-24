import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../../components/AppButton';
import { InputField } from '../../../components/InputField';
import { AppAlert } from '../../../components/AppAlert';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { Product } from '../../../domain/types';
import { findByBarcode } from '../storage/productStore';
import { normalizeBarcode, type BarcodeSymbology } from '../utils/barcode';
import { setPendingScan } from '../utils/scanBus';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Scan'>;

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'] as const;
const DUPLICATE_WINDOW_MS = 1500;

export function symbologyOf(type: string): BarcodeSymbology {
  const t = type.toLowerCase().replace('org.gs1.', '').replace('org.iso.', '').replace('-', '_');
  if (t.includes('ean13') || t === 'ean_13') return 'ean13';
  if (t.includes('ean8') || t === 'ean_8') return 'ean8';
  if (t.includes('upc_e') || t === 'upce') return 'upc_e';
  if (t.includes('upc_a') || t === 'upca') return 'upc_a';
  if (t.includes('code128') || t === 'code_128') return 'code128';
  if (t.includes('itf14') || t === 'itf_14') return 'itf14';
  return 'unknown';
}

function scanHaptic(): void {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch { /* no haptics */ }
}

/**
 * Camera scanning, four jobs: `find` opens a known product (or offers to add a new one with the code filled in);
 * `addDate` goes straight to adding a date for the scanned product (new or known); `attach` / `attachDate` hand one
 * code back to the product editor / the add-date screen. The camera prompt is never fired on arrival — an in-app card
 * explains why first. Torch and typed entry are always available; the raw code is kept exactly as scanned.
 */
export const ScanScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const mode = params?.mode ?? 'find';
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [last, setLast] = useState<{ product: Product | null; code: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const lastSeen = useRef<{ code: string; at: number } | null>(null);

  const handleCode = useCallback(async (raw: string, symbology: BarcodeSymbology) => {
    const code = raw.trim();
    const norm = normalizeBarcode(code, symbology);
    if (!norm) return;
    const now = Date.now();
    if (lastSeen.current && lastSeen.current.code === norm && now - lastSeen.current.at < DUPLICATE_WINDOW_MS) return;
    lastSeen.current = { code: norm, at: now };
    scanHaptic();
    if (mode === 'attach' || mode === 'attachDate') {
      setPendingScan(mode === 'attach' ? 'product' : 'date', code, symbology);
      nav.goBack();
      return;
    }
    setPaused(true);
    const product = await findByBarcode(code, symbology).catch(() => null);
    setLast({ product, code });
    if (mode === 'addDate') {
      // Known product: straight to its new date. Unknown: the same screen asks for a name, with the code filled in.
      nav.navigate('AddDate', product ? { productId: product.id } : { barcode: code, symbology });
      return;
    }
    if (product) nav.navigate('ProductDetail', { id: product.id });
    else AppAlert.alert(t('scan.notFoundTitle'), t('scan.notFoundBody', { code }), [
      { text: t('common.cancel'), style: 'cancel', onPress: () => setPaused(false) },
      { text: t('scan.addNew'), onPress: () => nav.navigate('ProductDetail', { barcode: code, symbology }) },
    ]);
  }, [mode, nav, t]);

  useEffect(() => { if (focused) setPaused(false); }, [focused]);

  const onScanned = useCallback((r: BarcodeScanningResult) => {
    if (paused || manualOpen) return;
    handleCode(r.data, symbologyOf(r.type));
  }, [paused, manualOpen, handleCode]);

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualOpen(false); setManualCode('');
    handleCode(code, 'unknown');
  };
  const askPermission = async () => { setAsking(true); try { await requestPermission(); } finally { setAsking(false); } };

  const camAvailable = !!permission?.granted && Platform.OS !== 'web';
  const canAsk = !!permission && !permission.granted && permission.canAskAgain;
  const deniedForGood = !!permission && !permission.granted && !permission.canAskAgain;

  return (
    <View style={s.root}>
      <ScreenHeader title={t(`scan.title.${mode}`)} onBack={() => nav.goBack()} rightActions={[{ icon: torch ? '☀' : '☼', label: t('scan.torch'), onPress: () => setTorch(x => !x) }]} />
      <View style={s.cameraWrap}>
        {camAvailable ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }} onBarcodeScanned={focused && !paused ? onScanned : undefined} testID="scan-camera" />
        ) : (
          <View style={s.noCamera} testID={canAsk ? 'scan-explain' : deniedForGood ? 'scan-denied' : 'scan-no-camera'}>
            <Ionicons name="camera-outline" size={36} color={colors.textLight} />
            {canAsk ? (
              <>
                <Text style={s.explainTitle}>{t('scan.explainTitle')}</Text>
                <Text style={s.noCameraText}>{t('scan.explainBody')}</Text>
                <AppButton label={t('scan.explainContinue')} onPress={askPermission} loading={asking} disabled={asking} variant="outline" textStyle={{ color: colors.textLight }} style={{ borderColor: colors.textLight }} />
              </>
            ) : deniedForGood ? (
              <>
                <Text style={s.noCameraText}>{t('scan.permissionDenied')}</Text>
                <AppButton label={t('settings.openSettings')} onPress={() => Linking.openSettings().catch(() => {})} variant="outline" textStyle={{ color: colors.textLight }} style={{ borderColor: colors.textLight }} />
              </>
            ) : (
              <Text style={s.noCameraText}>{t('scan.permissionAsk')}</Text>
            )}
          </View>
        )}
        <View pointerEvents="none" style={s.frame} />
        <Text style={s.hintOverlay}>{t(`scan.hint.${mode}`)}</Text>
      </View>
      <View style={s.panel}>
        {last ? (
          <View style={s.lastCard}>
            <Text style={s.lastLabel}>{t('scan.lastScanned')}</Text>
            <Text style={s.lastCode}>{last.code}</Text>
            {last.product ? (
              <View style={s.lastRow}>
                <Text style={s.lastName} numberOfLines={2}>{last.product.name}</Text>
              </View>
            ) : <Text style={s.lastMissing}>{t('scan.notInCatalogue')}</Text>}
          </View>
        ) : <Text style={s.panelHint}>{t('scan.readyHint')}</Text>}
        <AppButton label={t('scan.typeCode')} onPress={() => setManualOpen(true)} variant="secondary" />
      </View>
      <AppKeyboardBottomSheet visible={manualOpen} onClose={() => setManualOpen(false)} title={t('scan.typeCode')} footer={(
        <View style={{ gap: spacing.sm }}>
          <AppButton label={t('common.continue')} onPress={submitManual} disabled={!manualCode.trim()} />
          <AppButton label={t('common.cancel')} onPress={() => setManualOpen(false)} variant="secondary" />
        </View>
      )}>
        <InputField label={t('productEdit.barcode')} value={manualCode} onChangeText={setManualCode} keyboardType="default" placeholder="5000157024671" />
      </AppKeyboardBottomSheet>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryBlue },
  cameraWrap: { flex: 1, backgroundColor: '#000', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  frame: { width: '72%', aspectRatio: 1.6, borderWidth: 2, borderColor: colors.warningOrange, borderRadius: 14 },
  hintOverlay: { position: 'absolute', bottom: 14, left: 16, right: 16, ...typography.bodySm, color: colors.textLight, textAlign: 'center', lineHeight: 17 },
  noCamera: { alignItems: 'center', gap: 12, padding: 24 },
  noCameraText: { ...typography.body, color: colors.textLight, textAlign: 'center', lineHeight: 20 },
  explainTitle: { ...typography.sectionTitle, color: colors.textLight, textAlign: 'center' },
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screenPadding, paddingBottom: 28, gap: spacing.sm },
  panelHint: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
  lastCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 2 },
  lastLabel: { ...typography.sectionLabel, color: colors.textMuted },
  lastCode: { ...typography.bodySm, color: colors.textFaint },
  lastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4 },
  lastName: { ...typography.cardTitle, color: colors.textDark, flex: 1 },
  lastMissing: { ...typography.body, color: colors.dangerRed, marginTop: 4 },
});
