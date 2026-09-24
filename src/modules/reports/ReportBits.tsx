/**
 * Shared pieces of the two report screens: summary tiles, the row card (rendered from the SAME cells the CSV and PDF
 * use), and the export actions (PDF → ReportPreview, CSV → preview modal → share).
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabStackParamList } from '../../navigation/AppNavigator';
import type { MoneyValue } from '../../domain/expiry/expiryTypes';
import { AppButton } from '../../components/AppButton';
import { AppAlert } from '../../components/AppAlert';
import { CsvPreviewModal } from '../../components/pdf/CsvPreviewModal';
import { buildCsvPreviewHtml } from '../../utils/csvFile';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { moneyText } from '../batches/format';
import type { ExpiryReport, WasteReport, CurrencyTotals } from './reportRows';
import { reportCsvRows, shareReportCsv, writeReportCsv, type ReportKind } from './reportCsv';
import { buildReportHtml, writeReportPdf, type ReportMeta } from './reportPdf';
import { setPendingReport } from './reportHolder';
import { quantityText, type T } from './reportTable';

/** Largest number of rows drawn on screen; the PDF and CSV always hold every row. */
export const SCREEN_ROW_LIMIT = 200;

export const Metric: React.FC<{ label: string; value: string; tone?: 'danger' | 'attention'; testID?: string }> = ({ label, value, tone, testID }) => (
  <View style={[s.metric, tone === 'danger' && s.metricDanger, tone === 'attention' && s.metricAttention]} testID={testID}>
    <Text style={s.metricLabel}>{label}</Text>
    <Text style={s.metricValue}>{value}</Text>
  </View>
);

export function totalsLine(t: T, totals: CurrencyTotals, unknown: number): string {
  const known = Object.keys(totals).sort().map(c => moneyText({ minor: totals[c], currency: c } as MoneyValue));
  const parts = [known.length ? known.join(' · ') : t('reports.noKnownCost')];
  if (unknown > 0) parts.push(t('reports.unknownCostCount', { count: unknown }));
  return parts.join(' · ');
}

export function quantitiesLine(t: T, q: Record<string, number>): string {
  const parts = Object.keys(q).sort().map(u => quantityText(t, q[u], u || undefined));
  return parts.length ? parts.join(' · ') : t('reports.noQuantities');
}

export function costLine(t: T, cost: MoneyValue | null): string {
  return cost ? t('reports.costValue', { value: moneyText(cost) }) : t('reports.costUnknownLine');
}

export const RowCard: React.FC<{ title: string; lines: (string | undefined)[]; chip?: { text: string; fg: string; bg: string }; testID?: string }> = ({ title, lines, chip, testID }) => (
  <View style={s.card} testID={testID}>
    <Text style={s.cardTitle}>{title}</Text>
    {chip ? <Text style={[s.chip, { color: chip.fg, backgroundColor: chip.bg }]}>{chip.text}</Text> : null}
    {lines.filter(Boolean).map((l, i) => <Text key={i} style={i === 0 ? s.cardMain : s.cardMeta}>{l}</Text>)}
  </View>
);

/** PDF and CSV actions for a report. `meta` is computed at press time. */
export function useReportExport(kind: ReportKind, report: ExpiryReport | WasteReport | null, meta: () => ReportMeta & { day: string; title: string }) {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const pdf = async () => {
    if (!report || inFlight.current) return;
    inFlight.current = true;
    setBusy('pdf');
    try {
      const m = meta();
      const html = buildReportHtml(t, kind, report, m);
      const { uri, fileName } = await writeReportPdf(html, kind, m.day);
      setPendingReport({ report: kind, title: m.title, uri, fileName });
      nav.navigate('ReportPreview', { report: kind });
    } catch {
      AppAlert.error(t('fileCenter.pdfError'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const exportCsv = async () => {
    if (!report || inFlight.current) return;
    inFlight.current = true;
    setBusy('csv');
    try {
      const m = meta();
      const uri = await writeReportCsv(t, kind, report, m.day);
      const ok = await shareReportCsv(uri, m.title);
      if (!ok) AppAlert.error(t('pdf.shareUnavailable'));
      else setCsvOpen(false);
    } catch {
      AppAlert.error(t('reports.csvFailed'));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const csvHtml = csvOpen && report ? buildCsvPreviewHtml(reportCsvRows(t, kind, report), t('reports.emptyRows')) : null;

  const buttons = (
    <View style={s.actions}>
      <AppButton label={t('reports.pdfAction')} onPress={pdf} loading={busy === 'pdf'} disabled={!report || busy !== null} testID={`${kind}-pdf`} />
      <AppButton label={t('reports.csvAction')} variant="secondary" onPress={() => setCsvOpen(true)} disabled={!report || busy !== null} testID={`${kind}-csv`} />
    </View>
  );
  const modal = (
    <CsvPreviewModal visible={csvOpen} title={t('reports.csvPreviewTitle')} html={csvHtml} onClose={() => setCsvOpen(false)} onExport={exportCsv} exporting={busy === 'csv'} />
  );
  return { buttons, modal, pdf, exportCsv, openCsv: () => setCsvOpen(true) };
}

const s = StyleSheet.create({
  metric: { flexGrow: 1, flexBasis: '45%', minWidth: 140, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  metricDanger: { borderColor: colors.dangerRed, backgroundColor: colors.softRed },
  metricAttention: { borderColor: '#E8842D', backgroundColor: '#FBE2C8' },
  metricLabel: { ...typography.bodySm, color: colors.textMuted, fontWeight: '700' },
  metricValue: { ...typography.cardTitle, color: colors.textDark },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  cardTitle: { ...typography.cardTitle, color: colors.textDark },
  cardMain: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  cardMeta: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  chip: { ...typography.bodySm, fontWeight: '700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', alignSelf: 'flex-start' },
  actions: { gap: spacing.sm },
});

export const reportStyles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  sectionTitle: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  list: { gap: spacing.sm },
});
