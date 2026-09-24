import React from 'react';
import { Modal } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppPdfPreviewScreen } from './AppPdfPreviewScreen';

/**
 * CsvPreviewModal — shows CSV rows as a table (the Export Centre's CSV review
 * look) in the shared preview chrome, with a single "Export" action that shares
 * the file. Lets the per-module CSV buttons preview the data before exporting,
 * instead of jumping straight to the share sheet.
 */
type Props = {
  visible: boolean;
  title: string;
  html: string | null;
  onClose: () => void;
  onExport: () => void;
  exporting?: boolean;
};

export const CsvPreviewModal: React.FC<Props> = ({ visible, title, html, onClose, onExport, exporting }) => {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* RN <Modal> is a separate native root; a SafeAreaProvider with no initial
          metrics renders NOTHING until it measures its frame, and inside a Modal
          that measurement is unreliable — leaving the WebView blank ("CSV loads
          and does nothing"). Seed it with initialWindowMetrics so the content
          renders immediately, exactly like the working FileViewerModal. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <AppPdfPreviewScreen
          title={title}
          html={html}
          onBack={onClose}
          actions={[
            { key: 'export', icon: 'share-outline', onPress: onExport, disabled: exporting, busy: exporting, accessibilityLabel: t('common.share') },
          ]}
        />
      </SafeAreaProvider>
    </Modal>
  );
};
