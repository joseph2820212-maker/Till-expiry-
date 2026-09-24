import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { AppPdfPreviewScreen } from '../../../components/pdf/AppPdfPreviewScreen';
import { AppAlert } from '../../../components/AppAlert';
import { getPendingReport } from '../reportHolder';
import { sharePdfFile } from '../reportPdf';

/**
 * E30 Report preview: shows the PDF file the report screen just generated, and shares that same file. A cancelled
 * share is never reported as a success (no success message is shown at all).
 */
export const ReportPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'ReportPreview'>>();
  const pending = getPendingReport(params?.report ?? 'expiry');
  const inFlight = useRef(false);
  const [sharing, setSharing] = useState(false);

  const share = async () => {
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setSharing(true);
    try {
      const ok = await sharePdfFile(pending.uri, pending.title);
      if (!ok) AppAlert.error(t('pdf.shareUnavailable'));
    } catch {
      AppAlert.error(t('pdf.shareFailed'));
    } finally {
      inFlight.current = false;
      setSharing(false);
    }
  };

  return (
    <AppPdfPreviewScreen
      title={pending?.title ?? t('reports.title')}
      sourceUri={pending?.uri ?? null}
      onBack={() => nav.goBack()}
      error={pending ? null : t('reports.previewMissing')}
      actions={pending ? [{ key: 'share', icon: 'share-outline', onPress: share, busy: sharing, accessibilityLabel: t('common.share') }] : []}
    />
  );
};
