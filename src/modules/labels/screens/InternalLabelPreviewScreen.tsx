import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import type { Batch } from '../../../domain/expiry/expiryTypes';
import { AppPdfPreviewScreen, type PdfPreviewAction } from '../../../components/pdf/AppPdfPreviewScreen';
import { AppAlert } from '../../../components/AppAlert';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { getBatch, markLabelPrinted } from '../../batches/batchStore';
import { listLocations } from '../../locations/locationStore';
import { printHtmlToPdfFile } from '../../../utils/pdfFile';
import { PAGE_SIZES } from '../../../utils/pdfPageSizes';
import { sharePdfFile } from '../../reports/reportPdf';
import { buildLabelsHtml, isLabelBatch, labelData } from '../labelHtml';
import { typography } from '../../../theme/typography';

type Nav = NativeStackNavigationProp<TabStackParamList>;

/**
 * E31 Internal label preview. The label sheet is printed once to a real PDF file; the preview shows that file and the
 * Print / Share actions use that same file. A "label printed" event is recorded only after the print dialog
 * completes — sharing is not printing, so it records nothing.
 */
export const InternalLabelPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'InternalLabelPreview'>>();
  const batchIds = useMemo(() => params?.batchIds ?? [], [params]);
  const { data, error } = useWorkspaceData(async w => {
    const [batches, locations] = await Promise.all([
      Promise.all(batchIds.map(id => getBatch(w.id, id))),
      listLocations(w.id, { includeHidden: true }),
    ]);
    const found = batches.filter((b): b is Batch => !!b);
    return { workspaceId: w.id, labels: found.filter(isLabelBatch), skipped: batchIds.length - found.filter(isLabelBatch).length, locations };
  });

  const html = useMemo(() => {
    if (!data || !data.labels.length) return null;
    const names = new Map(data.locations.map(l => [l.id, l.name]));
    return buildLabelsHtml(data.labels.map(b => labelData(t, b, b.locationId ? names.get(b.locationId) : undefined)));
  }, [data, t]);

  const [file, setFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState(false);
  useEffect(() => {
    let live = true;
    setFile(null);
    setFileError(false);
    if (!html) return () => { live = false; };
    printHtmlToPdfFile(html, 'TillExpiry_InternalLabel.pdf', PAGE_SIZES.a4, { temporary: true })
      .then(uri => { if (live) setFile(uri); })
      .catch(() => { if (live) setFileError(true); });
    return () => { live = false; };
  }, [html]);

  const inFlight = useRef(false);
  const [busy, setBusy] = useState<'print' | 'share' | null>(null);

  const print = async () => {
    if (!file || !data || inFlight.current) return;
    inFlight.current = true;
    setBusy('print');
    try {
      await Print.printAsync({ uri: file });
    } catch {
      // Cancelled or failed: nothing was printed, so nothing is recorded.
      inFlight.current = false;
      setBusy(null);
      return;
    }
    // EXP-REV-08: on Android printAsync resolves as soon as the print window is shown, even if the user then cancels,
    // so returning from it proves nothing. "Label printed" is recorded only when the user confirms it printed.
    inFlight.current = false;
    setBusy(null);
    AppAlert.alert(t('label.confirmTitle'), t('label.confirmBody'), [
      { text: t('label.confirmNo'), style: 'cancel' },
      { text: t('label.confirmYes'), onPress: () => { void markPrinted(); } },
    ]);
  };

  const markPrinted = async () => {
    if (!data || inFlight.current) return;
    inFlight.current = true;
    try {
      for (const b of data.labels) await markLabelPrinted(data.workspaceId, b.id);
    } catch {
      AppAlert.error(t('errors.saveFailed'));
    } finally {
      inFlight.current = false;
    }
  };

  const share = async () => {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setBusy('share');
    try {
      const ok = await sharePdfFile(file, t('label.title'));
      if (!ok) AppAlert.error(t('pdf.shareUnavailable'));
    } catch {
      AppAlert.error(t('pdf.shareFailed'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const nothing = !!data && data.labels.length === 0;
  const actions: PdfPreviewAction[] = [
    { key: 'print', icon: 'print-outline', onPress: print, disabled: !file, busy: busy === 'print', accessibilityLabel: t('label.print') },
    { key: 'share', icon: 'share-outline', onPress: share, disabled: !file, busy: busy === 'share', accessibilityLabel: t('common.share') },
  ];

  const banner = (
    <View style={s.banner} testID="label-banner">
      <Text style={s.bannerText}>{t('label.notPpds')}</Text>
      {data && data.skipped > 0 ? <Text style={s.bannerText}>{t('label.skipped', { count: data.skipped })}</Text> : null}
    </View>
  );

  return (
    <AppPdfPreviewScreen
      title={t('label.title')}
      sourceUri={file}
      onBack={() => nav.goBack()}
      actions={nothing ? [] : actions}
      banner={banner}
      error={error ? t('errors.loadFailed') : nothing ? t('label.nothingToPrint') : fileError ? t('fileCenter.pdfError') : null}
      errorTitle={nothing ? t('label.title') : undefined}
    />
  );
};

const s = StyleSheet.create({
  banner: { backgroundColor: '#FBE2C8', paddingHorizontal: 16, paddingVertical: 10, gap: 4 },
  bannerText: { ...typography.bodySm, color: '#7A3D08', fontWeight: '700' },
});
