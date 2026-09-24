import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import type { BatchKind } from '../../../domain/expiry/expiryTypes';
import type { StatusGroup } from '../../../domain/expiry/statusEngine';
import { addDays, localTimeOf, todayIn } from '../../../domain/expiry/datePrecision';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { FilterChip } from '../../../components/FilterChip';
import { DropdownField } from '../../../components/DropdownField';
import { EmptyState } from '../../../components/EmptyState';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { listBatches } from '../../batches/batchStore';
import { listProducts } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { listItems } from '../../lists/listStore';
import { useGeneralSettings } from '../../settings/settingsStore';
import { statusColors } from '../../batches/format';
import { localDateShort } from '../../../utils/locale';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { expiryRowsFrom, type ExpiryFilter } from '../reportRows';
import { expiryCells } from '../reportTable';
import { Metric, RowCard, SCREEN_ROW_LIMIT, costLine, quantitiesLine, reportStyles as rs, totalsLine, useReportExport } from '../ReportBits';

type Range = 'today' | '7d' | '30d' | 'all';
const RANGES: Range[] = ['today', '7d', '30d', 'all'];
const RANGE_DAYS: Record<Range, number | null> = { today: 0, '7d': 7, '30d': 30, all: null };
const GROUPS: StatusGroup[] = ['past_hard', 'due_today', 'due_soon', 'needs_checking', 'quality_review', 'later'];
const KINDS: BatchKind[] = ['bought_in', 'opened', 'prepared', 'other'];

function toggle<V>(list: V[], v: V): V[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v];
}

/**
 * E28 Expiry report. Filters (date range, status, kind, location, category, product) run on one set of normalized rows;
 * the list below, the PDF and the CSV are all drawn from those rows.
 */
export const ExpiryReportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const settings = useGeneralSettings();
  const { data, error, workspace } = useWorkspaceData(async w => {
    const [batches, products, locations, categories] = await Promise.all([
      listBatches(w.id), listProducts(w.id, { includeHidden: true }), listLocations(w.id, { includeHidden: true }), listItems(w.id, 'category'),
    ]);
    return { workspace: w, batches, products, locations, categories, now: Date.now() };
  });

  const [range, setRange] = useState<Range>('7d');
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [kinds, setKinds] = useState<BatchKind[]>([]);
  const [locationId, setLocationId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');

  const today = data ? todayIn(data.workspace.timeZone, data.now) : '';
  const filter: ExpiryFilter = useMemo(() => {
    const days = RANGE_DAYS[range];
    return {
      to: days == null || !today ? undefined : addDays(today, days),
      groups: groups.length ? groups : undefined, kinds: kinds.length ? kinds : undefined,
      locationId: locationId || undefined, categoryId: categoryId || undefined, productId: productId || undefined,
    };
  }, [range, today, groups, kinds, locationId, categoryId, productId]);

  const report = useMemo(
    () => (data ? expiryRowsFrom(data.workspace.id, data.batches, data.products, data.locations, filter, data.now, settings) : null),
    [data, filter, settings],
  );

  const periodText = filter.to ? t('reports.period.upTo', { date: localDateShort(filter.to) }) : t('reports.period.allDates');
  const exporter = useReportExport('expiry', report, () => ({
    workspaceName: workspace?.name ?? '', periodText,
    generatedText: t('reports.generated', { time: `${localDateShort(today)}, ${localTimeOf(data?.now ?? Date.now(), data?.workspace.timeZone ?? 'UTC')}` }),
    day: today, title: t('reports.expiryTitle'),
  }));

  const activeLocations = data?.locations.filter(l => l.status === 'active') ?? [];
  const activeCategories = data?.categories.filter(c => c.status === 'active') ?? [];
  const productOptions = ['', ...(data?.products.filter(p => p.status === 'active').map(p => p.id) ?? [])];
  const productName = (id: string) => (id ? data?.products.find(p => p.id === id)?.name ?? '' : t('reports.allProducts'));
  const s = report?.summary;
  const shown = report?.rows.slice(0, SCREEN_ROW_LIMIT) ?? [];

  return (
    <View style={st.root}>
      <ScreenHeader title={t('reports.expiryTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={st.content}>
        <Text style={rs.sectionTitle}>{t('reports.filter.range')}</Text>
        <View style={rs.chips}>
          {RANGES.map(r => <FilterChip key={r} label={t(`reports.range.${r}`)} active={range === r} onPress={() => setRange(r)} />)}
        </View>
        <Text style={rs.hint}>{t('reports.rangeHint')}</Text>

        <Text style={rs.sectionTitle}>{t('reports.filter.status')}</Text>
        <View style={rs.chips}>
          {GROUPS.map(g => <FilterChip key={g} label={t(`reports.group.${g}`)} active={groups.includes(g)} onPress={() => setGroups(x => toggle(x, g))} />)}
        </View>

        <Text style={rs.sectionTitle}>{t('reports.filter.kind')}</Text>
        <View style={rs.chips}>
          {KINDS.map(k => <FilterChip key={k} label={t(`batchKind.${k}`)} active={kinds.includes(k)} onPress={() => setKinds(x => toggle(x, k))} />)}
        </View>

        {activeLocations.length ? (
          <>
            <Text style={rs.sectionTitle}>{t('reports.filter.location')}</Text>
            <View style={rs.chips}>
              <FilterChip label={t('reports.allLocations')} active={!locationId} onPress={() => setLocationId('')} />
              {activeLocations.map(l => <FilterChip key={l.id} label={l.name} active={locationId === l.id} onPress={() => setLocationId(l.id)} />)}
            </View>
          </>
        ) : null}

        {activeCategories.length ? (
          <>
            <Text style={rs.sectionTitle}>{t('reports.filter.category')}</Text>
            <View style={rs.chips}>
              <FilterChip label={t('reports.allCategories')} active={!categoryId} onPress={() => setCategoryId('')} />
              {activeCategories.map(c => <FilterChip key={c.id} label={c.name} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
            </View>
          </>
        ) : null}

        {productOptions.length > 1 ? (
          <DropdownField label={t('reports.filter.product')} value={productId} options={productOptions} onSelect={setProductId} getLabel={productName} />
        ) : null}

        {error ? <EmptyState icon="alert-circle-outline" title={t('errors.loadFailed')} body={t('reports.loadFailedBody')} /> : null}

        {s ? (
          <>
            <Text style={rs.sectionTitle}>{t('reports.summary')}</Text>
            <View style={rs.metrics}>
              <Metric label={t('reports.metric.rows')} value={String(s.rows)} testID="metric-rows" />
              <Metric label={t('reports.metric.pastHard')} value={String(s.pastHard)} tone={s.pastHard ? 'danger' : undefined} testID="metric-pastHard" />
              <Metric label={t('reports.metric.dueSoon')} value={String(s.dueToday + s.dueSoon)} tone={s.dueToday + s.dueSoon ? 'attention' : undefined} />
              <Metric label={t('reports.metric.qualityReview')} value={String(s.qualityReview)} />
              <Metric label={t('reports.metric.needsChecking')} value={String(s.needsChecking)} />
              <Metric label={t('reports.metric.quantities')} value={quantitiesLine(t, s.quantities)} />
            </View>
            <Metric label={t('reports.metric.costAtRisk')} value={totalsLine(t, s.costTotals, s.unknownCost)} testID="metric-cost" />
            <Text style={rs.hint}>{t('reports.expiryNote')}</Text>

            {exporter.buttons}

            <Text style={rs.sectionTitle}>{t('reports.rowCount', { count: s.rows })}</Text>
            {report && report.rows.length === 0 ? <EmptyState icon="calendar-outline" title={t('reports.emptyRows')} body={t('reports.emptyExpiryBody')} testID="expiry-empty" /> : null}
            <View style={rs.list}>
              {shown.map(r => {
                const c = expiryCells(t, r);
                const col = statusColors(r.status);
                return (
                  <RowCard
                    key={r.batchId} testID={`expiry-row-${r.batchId}`} title={c[0]}
                    chip={{ text: c[5], fg: col.fg, bg: col.bg }}
                    lines={[c[3], [c[2], c[1] && t('reports.lotShort', { lot: c[1] }), c[6], c[7]].filter(Boolean).join(' · '), costLine(t, r.cost)]}
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
