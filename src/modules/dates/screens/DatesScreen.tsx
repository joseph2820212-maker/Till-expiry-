import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { AppTextInput } from '../../../components/AppTextInput';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { DateBatch } from '../../../domain/types';
import { BAND_ORDER, bandFor, byDateThenSafety, currentReduction, type Band } from '../../../domain/expiry';
import { foldText } from '../../products/storage/productStore';
import { useShelfData } from '../hooks/useShelfData';
import { BatchRow } from '../components/BatchRow';
import { shareOpenDatesCsv } from '../../reports/exports';
import { useExpirySettings } from '../../settings/settingsStore';

export type DatesFilter = 'all' | 'attention' | Band | 'reduced';
const FILTERS: DatesFilter[] = ['all', 'attention', 'expired', 'today', 'soon', 'later', 'reduced'];

/** Every open date, grouped Expired → Today → Soon → Later, with filters, search and CSV export. */
export const DatesScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'Dates'>>();
  const settings = useExpirySettings();
  const { batches, products, byId, today, alertDaysOf, error } = useShelfData('open');
  const [filter, setFilter] = useState<DatesFilter>(params?.filter ?? 'all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (params?.filter) setFilter(params.filter); }, [params?.filter]);

  const sections = useMemo(() => {
    if (!batches) return [];
    const q = foldText(query.trim());
    const match = (b: DateBatch) => {
      if (!q) return true;
      const p = byId.get(b.productId);
      return [p?.name ?? b.productName, p?.sku, b.location, p?.shelfLocation, ...(p?.barcodes ?? []).map(x => x.raw)].some(v => v && foldText(v).includes(q));
    };
    const keep = (b: DateBatch, band: Band) => filter === 'all' || filter === band || (filter === 'attention' && band !== 'later') || (filter === 'reduced' && !!currentReduction(b));
    const groups = new Map<Band, DateBatch[]>();
    for (const b of batches) {
      const band = bandFor(b.date, today, alertDaysOf(b));
      if (!keep(b, band) || !match(b)) continue;
      groups.set(band, [...(groups.get(band) ?? []), b]);
    }
    return BAND_ORDER.filter(b => groups.get(b)?.length).map(b => ({ key: b, title: t(`band.${b}`), data: (groups.get(b) as DateBatch[]).sort(byDateThenSafety) }));
  }, [batches, filter, query, byId, today, alertDaysOf, t]);
  const total = batches?.length ?? 0;

  const exportCsv = async () => {
    if (!batches || exporting) return;
    setExporting(true);
    try { if (!(await shareOpenDatesCsv(batches, products, settings.alertDays))) AppAlert.error(t('export.shareUnavailable')); }
    catch { AppAlert.error(t('export.failed')); }
    finally { setExporting(false); }
  };

  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.dates')} subtitle={batches ? t('dates.count', { count: total }) : t('dates.subtitle')} />
      <View style={s.tools}>
        <View style={s.actions}>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('AddDate', {})} accessibilityRole="button" testID="dates-add">
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('dates.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('Scan', { mode: 'addDate' })} accessibilityRole="button" testID="dates-scan">
            <Ionicons name="barcode-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('dates.scan')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={exportCsv} disabled={!total || exporting} accessibilityRole="button" testID="dates-export">
            <Ionicons name="share-outline" size={20} color={total ? colors.primaryBlue : colors.textFaint} /><Text style={[s.actionText, !total && s.disabled]}>{t('dates.export')}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <AppTextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder={t('dates.searchPlaceholder')} placeholderTextColor={colors.textFaint} returnKeyType="search" accessibilityLabel={t('dates.searchPlaceholder')} />
        </View>
        <View style={s.chips}>
          {FILTERS.map(f => <FilterChip key={f} label={t(`dates.filter.${f}`)} active={filter === f} onPress={() => setFilter(f)} />)}
        </View>
      </View>
      {error ? (
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('dates.loadErrorTitle')} body={t('dates.loadErrorBody')} /></View>
      ) : batches && total === 0 ? (
        <View style={s.content}><EmptyState icon="calendar-outline" title={t('dates.emptyTitle')} body={t('dates.emptyBody')} testID="dates-empty" /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={b => b.id}
          renderSectionHeader={({ section }) => <Text style={s.sectionHead}>{`${section.title} · ${section.data.length}`}</Text>}
          renderItem={({ item }) => (
            <View style={s.item}>
              <BatchRow batch={item} product={byId.get(item.productId)} today={today} alertDays={alertDaysOf(item)} onPress={() => nav.navigate('DateDetail', { id: item.id })} testID={`date-${item.id}`} />
            </View>
          )}
          contentContainerStyle={s.list}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={batches ? <EmptyState icon="search-outline" title={t('dates.noMatchTitle')} body={t('dates.noMatchBody')} /> : null}
          initialNumToRender={20}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tools: { paddingHorizontal: spacing.screenPadding, paddingTop: spacing.sm, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, minHeight: 44, paddingHorizontal: 6 },
  actionText: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700' },
  disabled: { color: colors.textFaint },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, ...typography.body, color: colors.textDark, height: 46 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  content: { padding: spacing.screenPadding },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  sectionHead: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  item: { marginBottom: 8 },
});
