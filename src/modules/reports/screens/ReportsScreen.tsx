import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { LabelRow } from '../../../components/LabelRow';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { DateBatch } from '../../../domain/types';
import { addDays } from '../../../domain/dates';
import { moneyFromMinor } from '../../../domain/money';
import { displayMoney } from '../../../utils/displayMoney';
import { useShelfData } from '../../dates/hooks/useShelfData';
import { BatchRow } from '../../dates/components/BatchRow';
import { useTier } from '../../billing/useTier';
import { canUseFeature } from '../../billing/limits';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { buildReport, periodStart, PERIODS, type KindTotals, type ReportPeriod } from '../report';
import { shareHistoryCsv } from '../exports';

const HISTORY_ROWS = 30;

/** Values per currency, e.g. "£12.40 · €3.10"; never adds two currencies together. */
function valueText(v: Record<string, number>): string {
  const parts = Object.entries(v).filter(([, minor]) => minor > 0).map(([c, minor]) => displayMoney(moneyFromMinor(minor, c)));
  return parts.length ? parts.join(' · ') : '—';
}

/** History & waste: what was sold, reduced, thrown away, returned or donated, and the dates that left the shelf. */
export const ReportsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tier = useTier();
  const pro = canUseFeature(tier, 'wasteReport');
  const { batches, products, byId, today, alertDaysOf, error } = useShelfData();
  const [period, setPeriod] = useState<ReportPeriod>('30d');
  const [limit, setLimit] = useState(false);

  const report = useMemo(() => (batches ? buildReport(batches, products, periodStart(period, today, addDays), today) : null), [batches, products, period, today]);
  const closed = useMemo(() => (batches ?? []).filter(b => b.status === 'closed').sort((a, b) => ((b.closedAt ?? b.updatedAt) < (a.closedAt ?? a.updatedAt) ? -1 : 1)).slice(0, HISTORY_ROWS), [batches]);

  const exportCsv = async () => {
    if (!canUseFeature(tier, 'historyExport')) { setLimit(true); return; }
    if (!batches) return;
    try { if (!(await shareHistoryCsv(batches, products))) AppAlert.error(t('export.shareUnavailable')); }
    catch { AppAlert.error(t('export.failed')); }
  };

  const totalsBlock = (k: 'wasted' | 'sold' | 'reduced' | 'returned' | 'donated', tt: KindTotals) => (
    <View key={k} style={s.kind}>
      <Text style={s.kindTitle}>{t(`reports.kind.${k}`)}</Text>
      <LabelRow label={t('reports.events')} value={String(tt.events)} />
      {k !== 'reduced' ? <LabelRow label={t('reports.units')} value={String(tt.units)} /> : null}
      {k !== 'reduced' ? <LabelRow label={t('reports.value')} value={valueText(tt.value)} strong={k === 'wasted'} tone={k === 'wasted' ? 'danger' : 'default'} /> : null}
    </View>
  );

  const header = (
    <View style={s.head}>
      <View style={s.chips}>{PERIODS.map(p => <FilterChip key={p} label={t(`reports.period.${p}`)} active={period === p} onPress={() => setPeriod(p)} />)}</View>
      {pro && report ? (
        <View style={s.card}>
          {totalsBlock('wasted', report.totals.wasted)}
          <View style={s.reasons}>
            {(Object.keys(report.wasteReasons) as (keyof typeof report.wasteReasons)[]).map(r => <Text key={r} style={s.reason}>{`${t(`wasteReason.${r}`)}: ${report.wasteReasons[r]}`}</Text>)}
          </View>
          {totalsBlock('reduced', report.totals.reduced)}
          <LabelRow label={t('reports.reducedThenSold')} value={String(report.reducedThenSold)} tone="success" />
          {totalsBlock('sold', report.totals.sold)}
          {totalsBlock('returned', report.totals.returned)}
          {totalsBlock('donated', report.totals.donated)}
          <Text style={s.hint}>{t('reports.valueNote')}</Text>
          {report.topWasted.length ? (
            <>
              <Text style={s.kindTitle}>{t('reports.topWasted')}</Text>
              {report.topWasted.map(w => <LabelRow key={w.productId} label={w.name} value={`${t('reports.unitsShort', { count: w.units })}${Object.keys(w.value).length ? ` · ${valueText(w.value)}` : ''}`} />)}
            </>
          ) : null}
        </View>
      ) : !pro ? (
        <View style={s.card}>
          <Text style={s.kindTitle}>{t('reports.proTitle')}</Text>
          <Text style={s.hint}>{t('reports.proBody')}</Text>
          <AppButton label={t('reports.unlock')} onPress={() => setLimit(true)} variant="outline" />
        </View>
      ) : null}
      <AppButton label={t('reports.exportHistory')} onPress={exportCsv} variant="secondary" />
      {closed.length ? <Text style={s.section}>{t('reports.recent')}</Text> : null}
    </View>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={t('reports.title')} subtitle={t('reports.subtitle')} onBack={() => nav.goBack()} />
      {error ? (
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('dates.loadErrorTitle')} body={t('dates.loadErrorBody')} /></View>
      ) : (
        <FlatList
          data={closed}
          keyExtractor={(b: DateBatch) => b.id}
          renderItem={({ item }) => <View style={s.item}><BatchRow batch={item} product={byId.get(item.productId)} today={today} alertDays={alertDaysOf(item)} onPress={() => nav.navigate('DateDetail', { id: item.id })} /></View>}
          ListHeaderComponent={header}
          ListEmptyComponent={batches ? <EmptyState icon="time-outline" title={t('reports.emptyTitle')} body={t('reports.emptyBody')} /> : null}
          contentContainerStyle={s.list}
        />
      )}
      <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  head: { gap: spacing.sm, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  kind: { gap: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.rule2 },
  kindTitle: { ...typography.cardTitle, color: colors.textDark, marginTop: 4 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  reason: { ...typography.bodySm, color: colors.textMuted },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  item: { marginBottom: 8 },
});
