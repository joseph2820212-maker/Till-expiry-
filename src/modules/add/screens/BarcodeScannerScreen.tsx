/**
 * E15 — full-screen barcode scanner (the tab bar is hidden here only, §5). Adapted from the v1 ScanScreen
 * (git f6f4de8 src/modules/products/screens/ScanScreen.tsx, itself from TillCalc).
 *
 * Purposes: `add` → the bought-in form (known product or a new one with the code filled in; the date is ALWAYS asked,
 * a GS1 date is only prefilled), `find` → the product, `attach` → hand the code back to the asking form (scanBus),
 * `open` → the opened-item form. The camera permission prompt is never fired on arrival: an in-app card explains
 * first. Typing the code is always possible. The same code read twice in a row is ignored.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import type { Product } from '../../../domain/expiry/expiryTypes';
import { getActiveWorkspace } from '../../workspaces/workspaceStore';
import { listProducts } from '../../products/productStore';
import { setPendingScan } from '../../products/utils/scanBus';
import { createScanDebounce, findProductFor, readScannedCode, scanOutcome } from '../scanRouting';

type Nav = NativeStackNavigationProp<TabStackParamList>;
type Route = RouteProp<TabStackParamList, 'BarcodeScanner'>;

const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14', 'datamatrix'] as const;

function scanHaptic(): void {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch { /* no haptics */ }
}


export const BarcodeScannerScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const purpose = params?.purpose ?? 'add';
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [last, setLast] = useState<{ product: Product | null; code: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const accept = useRef(createScanDebounce()).current;
  const busy = useRef(false);

  const handleCode = useCallback(async (raw: string, type: string) => {
    const text = String(raw ?? '').trim();
    if (!text || busy.current || !accept(text)) return;
    busy.current = true;
    try {
      scanHaptic();
      const read = readScannedCode(text, type);
      if (purpose === 'attach') {
        const out = scanOutcome('attach', read, null);
        if (out.type === 'attach') { setPendingScan('product', out.code, out.symbology); nav.goBack(); }
        else AppAlert.alert(t('scan.noProductCodeTitle'), t('scan.noProductCodeBody'));
        return;
      }
      setPaused(true);
      const ws = getActiveWorkspace();
      const products = ws ? await listProducts(ws.id).catch(() => [] as Product[]) : [];
      const product = findProductFor(read, products);
      setLast({ product, code: read.code ?? read.raw });
      const out = scanOutcome(purpose, read, product);
      switch (out.type) {
        case 'navigate':
          if (out.route === 'AddBoughtIn') nav.navigate('AddBoughtIn', out.params);
          else if (out.route === 'AddOpened') nav.navigate('AddOpened', out.params);
          else nav.navigate('ProductDetail', out.params);
          return;
        case 'notFound':
          AppAlert.alert(t('scan.notFoundTitle'), t('scan.notFoundBody', { code: out.code }), [
            { text: t('common.cancel'), style: 'cancel', onPress: () => setPaused(false) },
            ...(purpose === 'find' ? [{ text: t('scan.searchItems'), onPress: () => nav.navigate('Items', { text: out.code } as TabStackParamList['Items']) }] : []),
            { text: t('scan.addNew'), onPress: () => nav.navigate('ProductEdit', { barcode: out.code, symbology: out.symbology }) },
          ]);
          return;
        default:
          AppAlert.alert(t('scan.noProductCodeTitle'), t('scan.noProductCodeBody'), [{ text: t('common.ok'), onPress: () => setPaused(false) }]);
      }
    } finally {
      busy.current = false;
    }
  }, [purpose, nav, t, accept]);

  useEffect(() => { if (focused) setPaused(false); }, [focused]);

  const onScanned = useCallback((r: BarcodeScanningResult) => {
    if (paused || manualOpen) return;
    handleCode(r.data, String(r.type));
  }, [paused, manualOpen, handleCode]);

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setManualOpen(false); setManualCode('');
    handleCode(code, 'manual');
  };
  const askPermission = async () => { setAsking(true); try { await requestPermission(); } finally { setAsking(false); } };

  const camAvailable = !!permission?.granted && Platform.OS !== 'web';
  const canAsk = !!permission && !permission.granted && permission.canAskAgain;
  const deniedForGood = !!permission && !permission.granted && !permission.canAskAgain;

  return (
    <View style={s.root}>
      <ScreenHeader title={t(`scan.purpose.${purpose}`)} onBack={() => nav.goBack()} rightActions={camAvailable ? [{ icon: torch ? '☀' : '☼', label: t('scan.torch'), onPress: () => setTorch(x => !x) }] : undefined} />
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
                <AppButton label={t('scan.openSettings')} onPress={() => Linking.openSettings().catch(() => {})} variant="outline" textStyle={{ color: colors.textLight }} style={{ borderColor: colors.textLight }} />
              </>
            ) : Platform.OS === 'web' ? (
              <Text style={s.noCameraText}>{t('scan.noCamera')}</Text>
            ) : (
              <Text style={s.noCameraText}>{t('scan.permissionAsk')}</Text>
            )}
          </View>
        )}
        {camAvailable ? <View pointerEvents="none" style={s.frame} /> : null}
        <Text style={s.hintOverlay}>{t(`scan.hint.${purpose}`)}</Text>
      </View>
      <View style={[s.panel, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        {last ? (
          <View style={s.lastCard}>
            <Text style={s.lastLabel}>{t('scan.lastScanned')}</Text>
            <Text style={s.lastCode}>{last.code}</Text>
            {last.product ? <Text style={s.lastName} numberOfLines={2}>{last.product.name}</Text> : <Text style={s.lastMissing}>{t('scan.notInProducts')}</Text>}
          </View>
        ) : <Text style={s.panelHint}>{t('scan.readyHint')}</Text>}
        {purpose === 'add' ? <Text style={s.panelHint}>{t('scan.dateStillAsked')}</Text> : null}
        <AppButton label={t('scan.typeCode')} onPress={() => setManualOpen(true)} variant="secondary" testID="scan-type-code" />
      </View>
      <AppKeyboardBottomSheet visible={manualOpen} onClose={() => setManualOpen(false)} title={t('scan.typeCode')} footer={(
        <View style={{ gap: spacing.sm }}>
          <AppButton label={t('common.continue')} onPress={submitManual} disabled={!manualCode.trim()} />
          <AppButton label={t('common.cancel')} onPress={() => setManualOpen(false)} variant="secondary" />
        </View>
      )}>
        <InputField label={t('scan.codeLabel')} value={manualCode} onChangeText={setManualCode} keyboardType="default" placeholder="5000157024671" hint={t('scan.codeHint')} />
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
  panel: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.screenPadding, gap: spacing.sm },
  panelHint: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', paddingVertical: 4, lineHeight: 17 },
  lastCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 2 },
  lastLabel: { ...typography.sectionLabel, color: colors.textMuted },
  lastCode: { ...typography.bodySm, color: colors.textFaint },
  lastName: { ...typography.cardTitle, color: colors.textDark, marginTop: 4 },
  lastMissing: { ...typography.body, color: colors.textMuted, marginTop: 4 },
});
