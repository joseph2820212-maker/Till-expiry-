import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { WASTE_REASONS } from '../../../domain/expiry/expiryTypes';
import { addDays, localTimeOf, todayIn } from '../../../domain/expiry/datePrecision';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { FilterChip } from '../../../components/FilterChip';
import { EmptyState } from '../../../components/EmptyState';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { listBatches, listEvents } from '../../batches/batchStore';
import { listProducts } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { localDateShort } from '../../../utils/locale';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { wasteRowsFrom, type WasteFilter } from '../reportRows';
import { wasteCells } from '../reportTable';
import { Metric, RowCard, SCREEN_ROW_LIMIT, costLine, quantitiesLine, reportStyles as rs, totalsLine, useReportExport } from '../ReportBits';

type Period = '7d' | '30d' | '90d' | 'all';
const PERIODS: Period[] = ['7d', '30d', '90d', 'all'];
const PERIOD_DAYS: Record<Period, number | null> = { '7d': 7, '30d': 30, '90d': 90, all: null };

/**
 * E29 Waste report: only events explicitly recorded as wasted (nothing is counted as waste just because a date passed).
 * Cost is shown only where known; unknown cost is shown as unknown and counted, never added as 0.
 */
export const WasteReportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { data, error, workspace } = useWorkspaceData(async w => {
    const [events, batches, products, locations] = await Promise.all([
      listEvents(w.id), listBatches(w.id, { status: 'any' }), listProducts(w.id, { includeHidden: true }), listLocations(w.id, { includeHidden: true }),
    ]);
    return { workspace: w, events, batches, products, locations, now: Date.now() };
  });
  const [period, setPeriod] = useState<Period>('30d');

  const today = data ? todayIn(data.workspace.timeZone, data.now) : '';
  const filter: WasteFilter = useMemo(() => {
    const days = PERIOD_DAYS[period];
    return days == null || !today ? {} : { from: addDays(today, -(days - 1)), to: today };
  }, [period, today]);

  const report = useMemo(
    () => (data ? wasteRowsFrom(data.workspace.id, data.events, data.batches, data.products, data.locations, filter, data.workspace.timeZone, data.now) : null),
    [data, filter],
  );

  const periodText = filter.from && filter.to
    ? t('reports.period.between', { from: localDateShort(filter.from), to: localDateShort(filter.to) })
    : t('reports.period.allTime');
  const exporter = useReportExport('waste', report, () => ({
    workspaceName: workspace?.name ?? '', periodText,
    generatedText: t('reports.generated', { time: `${localDateShort(today)}, ${localTimeOf(data?.now ?? Date.now(), data?.workspace.timeZone ?? 'UTC')}` }),
    day: today, title: t('reports.wasteTitle'),
  }));

  const s = report?.summary;
  const shown = report?.rows.slice(0, SCREEN_ROW_LIMIT) ?? [];

  return (
    <View style={st.root}>
      <ScreenHeader title={t('reports.wasteTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={st.content}>
        <Text style={rs.sectionTitle}>{t('reports.filter.period')}</Text>
        <View style={rs.chips}>
          {PERIODS.map(p => <FilterChip key={p} label={t(`reports.periodChip.${p}`)} active={period === p} onPress={() => setPeriod(p)} />)}
        </View>
        <Text style={rs.hint}>{t('reports.wasteNote')}</Text>

        {error ? <EmptyState icon="alert-circle-outline" title={t('errors.loadFailed')} body={t('reports.loadFailedBody')} /> : null}

        {s ? (
          <>
            <Text style={rs.sectionTitle}>{t('reports.summary')}</Text>
            <View style={rs.metrics}>
              <Metric label={t('reports.metric.wasteEvents')} value={String(s.events)} testID="metric-events" />
              <Metric label={t('reports.metric.quantities')} value={quantitiesLine(t, s.quantities)} />
            </View>
            <Metric label={t('reports.metric.knownCost')} value={totalsLine(t, s.costTotals, s.unknownCost)} testID="metric-cost" />
            <Text style={rs.sectionTitle}>{t('reports.byReason')}</Text>
            <View style={rs.metrics}>
              {WASTE_REASONS.map(r => <Metric key={r} label={t(`wasteReason.${r}`)} value={String(s.reasons[r])} />)}
            </View>

            {exporter.buttons}

            <Text style={rs.sectionTitle}>{t('reports.rowCount', { count: s.events })}</Text>
            {report && report.rows.length === 0 ? <EmptyState icon="trash-outline" title={t('reports.emptyRows')} body={t('reports.emptyWasteBody')} testID="waste-empty" /> : null}
            <View style={rs.list}>
              {shown.map(r => {
                const c = wasteCells(t, r);
                return (
                  <RowCard
                    key={r.eventId} testID={`waste-row-${r.eventId}`} title={c[1]}
                    lines={[`${c[3]} · ${c[4]}`, [c[0], c[2] && t('reports.lotShort', { lot: c[2] }), c[5]].filter(Boolean).join(' · '), costLine(t, r.cost)]}
                  />
                );
              })}
            </View>
            {report && report.rows.length > shown.length ? <Text style={rs.hint}>{t('reports.moreRows', { shown: shown.length, count: report.rows.length })}</Text> : null}
          </>
        ) : null}
      </AppKeyboardScrollView>
      {exporter.modal}
    </View>
  );
};

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
});
