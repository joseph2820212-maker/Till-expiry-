/**
 * E34 DataExport — CSV export of the active workspace's products or batches. The preview shows the same rows that are
 * written to the file and shared (§18.3). A closed share sheet is never reported as a successful export.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { CsvPreviewModal } from '../../../components/pdf/CsvPreviewModal';
import { Section, ErrorText, Hint } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { buildCsvPreviewHtml, shareCsvFile } from '../../../utils/csvFile';
import { exportRows, loadExportData, writeExportFile, type Cell, type ExportKind } from '../dataExport';

type Nav = NativeStackNavigationProp<TabStackParamList>;

interface Preview { kind: ExportKind; rows: Cell[][]; html: string }

export const DataExportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { data, error, workspace } = useWorkspaceData(w => loadExportData(w));
  const [includeArchived, setIncludeArchived] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sharing, setSharing] = useState(false);
  const inFlight = useRef(false);

  const counts = useMemo(() => {
    if (!data) return null;
    const opts = { includeArchived };
    return { products: exportRows('products', data, opts).length - 1, batches: exportRows('batches', data, opts).length - 1 };
  }, [data, includeArchived]);

  const open = (kind: ExportKind) => {
    if (!data) return;
    const rows = exportRows(kind, data, { includeArchived });
    setPreview({ kind, rows, html: buildCsvPreviewHtml(rows, t('export.empty')) });
  };

  const share = async () => {
    if (!preview || !workspace || inFlight.current) return;
    inFlight.current = true;
    setSharing(true);
    try {
      const uri = await writeExportFile(preview.kind, workspace, preview.rows);
      const shared = await shareCsvFile(uri, t(`export.title.${preview.kind}`));
      if (!shared) AppAlert.error(t('export.shareUnavailable'));
    } catch {
      AppAlert.error(t('export.failed'));
    } finally {
      inFlight.current = false;
      setSharing(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('export.screenTitle')} subtitle={workspace?.name} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content}>
        <Text style={s.text}>{t('export.intro')}</Text>
        {error ? <ErrorText text={t('errors.loadFailed')} /> : null}
        <CheckboxRow label={t('export.includeArchived')} checked={includeArchived} onToggle={() => setIncludeArchived(v => !v)} />
        <Section title={t('export.title.products')}>
          <Hint text={t('export.productsHint')} />
          <Text style={s.meta}>{counts ? t('export.rows', { count: counts.products }) : t('common.loading')}</Text>
          <AppButton label={t('export.preview')} onPress={() => open('products')} disabled={!data} testID="export-products" />
        </Section>
        <Section title={t('export.title.batches')}>
          <Hint text={t('export.batchesHint')} />
          <Text style={s.meta}>{counts ? t('export.rows', { count: counts.batches }) : t('common.loading')}</Text>
          <AppButton label={t('export.preview')} onPress={() => open('batches')} disabled={!data} testID="export-batches" />
        </Section>
        <Hint text={t('export.formulaHint')} />
      </AppKeyboardScrollView>
      <CsvPreviewModal
        visible={!!preview}
        title={preview ? t(`export.title.${preview.kind}`) : ''}
        html={preview?.html ?? null}
        onClose={() => setPreview(null)}
        onExport={share}
        exporting={sharing}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  text: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  meta: { ...typography.bodySm, color: colors.textDark, fontWeight: '700' },
});
