import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useNavigationState, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { WorkspaceHeader } from '../../../components/WorkspaceHeader';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppTextInput } from '../../../components/AppTextInput';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { FilterChip } from '../../../components/FilterChip';
import { EmptyState } from '../../../components/EmptyState';
import { AppButton } from '../../../components/AppButton';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { BatchCard } from '../../../components/status/BatchCard';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { DATE_KINDS, type Product, type Workspace } from '../../../domain/expiry/expiryTypes';
import type { StatusGroup } from '../../../domain/expiry/statusEngine';
import { rankBatches } from '../../../domain/expiry/expirySort';
import { listBatches } from '../../batches/batchStore';
import { listProducts } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { listItems } from '../../lists/listStore';
import { getGeneral } from '../../settings/settingsStore';
import { moneyText } from '../../batches/format';
import { EMPTY_FILTER, activeFilterCount, filterBatches, filterProducts, type ItemsFilter } from '../itemsFilter';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

type Mode = 'batches' | 'products';
const GROUPS: StatusGroup[] = ['past_hard', 'due_today', 'due_soon', 'needs_checking', 'quality_review', 'later'];
const KINDS = ['bought_in', 'opened', 'prepared', 'other'] as const;

async function loadItems(ws: Workspace) {
  const [batches, products, locations, categories, suppliers] = await Promise.all([
    listBatches(ws.id, { status: 'any' }), listProducts(ws.id, { includeHidden: true }), listLocations(ws.id, { includeHidden: true }),
    listItems(ws.id, 'category'), listItems(ws.id, 'supplier'),
  ]);
  const now = Date.now();
  const ranked = rankBatches(batches, now, getGeneral());
  const names = new Map<string, string>([...locations, ...categories, ...suppliers].map(x => [x.id, x.name]));
  const activeBatchCount = new Map<string, number>();
  for (const b of batches) if (b.status === 'active') activeBatchCount.set(b.productId, (activeBatchCount.get(b.productId) ?? 0) + 1);
  return {
    ranked, products, productById: new Map(products.map(p => [p.id, p])), activeBatchCount,
    locations: locations.filter(l => l.status === 'active'), categories, suppliers,
    name: (id?: string) => (id ? names.get(id) : undefined),
  };
}

/** E09 — search and filter everything in the active workspace: dated batches, or the product list. Virtualised. */
export const ItemsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const route = useRoute<RouteProp<TabStackParamList, 'Items'>>();
  const params = route.params;
  /** Root of the Items tab gets the workspace header; pushed from another tab it gets a back button. */
  const isRoot = useNavigationState(st => st.routes[0]?.key === route.key);
  const [mode, setMode] = useState<Mode>(params?.mode ?? 'batches');
  const [filter, setFilter] = useState<ItemsFilter>(EMPTY_FILTER);
  const [sheet, setSheet] = useState(false);
  const { data } = useWorkspaceData(loadItems);

  useEffect(() => {
    if (!params) return;
    if (params.mode) setMode(params.mode);
    setFilter(f => ({ ...f, text: params.text ?? f.text, group: params.query?.group && params.query.group !== 'attention' ? params.query.group : f.group, locationId: params.query?.locationId ?? f.locationId, kind: params.query?.kind ?? f.kind }));
  }, [params]);

  const batchRows = useMemo(() => {
    if (!data) return [];
    const pool = data.ranked.filter(r => (filter.archived ? r.batch.status !== 'active' : r.batch.status === 'active'));
    return filterBatches(pool, filter, data.productById, data.name, data.name);
  }, [data, filter]);
  const productRows = useMemo(() => (data ? filterProducts(data.products, filter, data.name, data.name) : []), [data, filter]);
  const set = (patch: Partial<ItemsFilter>) => setFilter(f => ({ ...f, ...patch }));
  const toggle = <K extends keyof ItemsFilter>(k: K, v: ItemsFilter[K]) => setFilter(f => ({ ...f, [k]: f[k] === v ? undefined : v }));
  const count = activeFilterCount(filter);
  const segLabels = { batches: t('items.batches'), products: t('items.products') };

  const header = (
    <View style={s.top}>
      <ToggleSegment options={[segLabels.batches, segLabels.products]} selected={segLabels[mode]} onSelect={l => setMode(l === segLabels.products ? 'products' : 'batches')} />
      <View style={s.searchRow}>
        <View style={s.box}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <AppTextInput style={s.input} value={filter.text} onChangeText={text => set({ text })} placeholder={t(mode === 'batches' ? 'items.searchBatches' : 'items.searchProducts')} placeholderTextColor={colors.textFaint} accessibilityLabel={t('common.search')} testID="items-search" />
        </View>
        <TouchableOpacity style={[s.filterBtn, count ? s.filterOn : null]} onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={t('items.filters', { count })} testID="items-filters">
          <Ionicons name="options-outline" size={20} color={count ? '#fff' : colors.primaryBlue} />
          {count ? <Text style={s.filterCount}>{count}</Text> : null}
        </TouchableOpacity>
      </View>
      {mode === 'products' ? <AppButton label={t('items.newProduct')} icon="add" variant="outline" onPress={() => nav.navigate('ProductEdit')} /> : null}
      <Text style={s.count}>{t('items.shown', { count: mode === 'batches' ? batchRows.length : productRows.length })}</Text>
    </View>
  );

  const empty = data ? <EmptyState icon="file-tray-outline" title={t('items.emptyTitle')} body={t(count || filter.text ? 'items.emptyFiltered' : mode === 'batches' ? 'items.emptyBatches' : 'items.emptyProducts')} /> : null;

  return (
    <View style={s.root}>
      {isRoot ? <WorkspaceHeader title={t('items.title')} onSearch={() => nav.navigate('GlobalSearch')} /> : <ScreenHeader title={t('items.title')} onBack={() => nav.goBack()} />}
      {mode === 'batches' ? (
        <FlatList
          key="batches"
          data={batchRows}
          keyExtractor={r => r.batch.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={s.list}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          testID="items-batches"
          renderItem={({ item: r }) => <BatchCard batch={r.batch} evaluation={r.evaluation} locationName={data?.name(r.batch.locationId)} onPress={() => nav.navigate('BatchDetail', { id: r.batch.id })} />}
        />
      ) : (
        <FlatList
          key="products"
          data={productRows}
          keyExtractor={p => p.id}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={s.list}
          initialNumToRender={15}
          windowSize={7}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          testID="items-products"
          renderItem={({ item: p }) => <ProductRow p={p} batches={data?.activeBatchCount.get(p.id) ?? 0} onPress={() => nav.navigate('ProductDetail', { id: p.id })} />}
        />
      )}

      <AppKeyboardBottomSheet visible={sheet} onClose={() => setSheet(false)} title={t('items.filterTitle')} footer={
        <View style={s.sheetFooter}>
          <AppButton label={t('items.clearFilters')} variant="outline" onPress={() => setFilter(f => ({ ...EMPTY_FILTER, text: f.text }))} style={s.flex} />
          <AppButton label={t('common.done')} onPress={() => setSheet(false)} style={s.flex} />
        </View>
      }>
        <View style={s.sheetBody}>
          {mode === 'batches' ? (
            <>
              <ChipGroup title={t('items.fStatus')} items={GROUPS.map(g => ({ id: g, label: t(`group.${g}`) }))} value={filter.group} onPick={v => toggle('group', v as StatusGroup)} />
              <ChipGroup title={t('items.fKind')} items={KINDS.map(k => ({ id: k, label: t(`batchKind.${k}`) }))} value={filter.kind} onPick={v => toggle('kind', v as ItemsFilter['kind'])} />
            </>
          ) : null}
          <ChipGroup title={t('items.fDateKind')} items={DATE_KINDS.map(k => ({ id: k, label: t(`dateKind.${k}`) }))} value={filter.dateKind} onPick={v => toggle('dateKind', v as ItemsFilter['dateKind'])} />
          <ChipGroup title={t('items.fLocation')} items={(data?.locations ?? []).map(l => ({ id: l.id, label: l.name }))} value={filter.locationId} onPick={v => toggle('locationId', v)} />
          <ChipGroup title={t('items.fCategory')} items={(data?.categories ?? []).map(l => ({ id: l.id, label: l.name }))} value={filter.categoryId} onPick={v => toggle('categoryId', v)} />
          <ChipGroup title={t('items.fSupplier')} items={(data?.suppliers ?? []).map(l => ({ id: l.id, label: l.name }))} value={filter.supplierId} onPick={v => toggle('supplierId', v)} />
          <ChipGroup title={t('items.fArchive')} items={[{ id: 'active', label: t('items.active') }, { id: 'archived', label: t(mode === 'batches' ? 'items.finished' : 'items.hidden') }]} value={filter.archived ? 'archived' : 'active'} onPick={v => set({ archived: v === 'archived' })} />
        </View>
      </AppKeyboardBottomSheet>
    </View>
  );
};

const ChipGroup: React.FC<{ title: string; items: { id: string; label: string }[]; value?: string; onPick: (id: string) => void }> = ({ title, items, value, onPick }) =>
  items.length ? (
    <View style={s.group}>
      <Text style={s.groupTitle}>{title}</Text>
      <View style={s.chips}>{items.map(i => <FilterChip key={i.id} label={i.label} active={value === i.id} onPress={() => onPick(i.id)} />)}</View>
    </View>
  ) : null;

const ProductRow: React.FC<{ p: Product; batches: number; onPress: () => void }> = ({ p, batches, onPress }) => {
  const { t } = useTranslation();
  const meta = [p.sku, p.barcodes[0]?.code, t('items.activeBatches', { count: batches }), p.sellingPrice ? moneyText(p.sellingPrice) : null].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity style={s.pRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={p.name} testID={`product-${p.id}`}>
      <Ionicons name={p.isPrepared ? 'restaurant-outline' : 'cube-outline'} size={20} color={colors.primaryBlue} />
      <View style={s.flex}>
        <Text style={s.pName} numberOfLines={2}>{p.name}</Text>
        <Text style={s.pMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  top: { gap: spacing.sm, marginBottom: spacing.xs },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  box: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, minHeight: 44, ...typography.body, color: colors.textDark },
  filterBtn: { width: 48, height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 2 },
  filterOn: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  filterCount: { ...typography.micro, color: '#fff', fontWeight: '800' },
  count: { ...typography.bodySm, color: colors.textMuted },
  sheetFooter: { flexDirection: 'row', gap: 8 },
  sheetBody: { gap: spacing.md },
  group: { gap: 6 },
  groupTitle: { ...typography.sectionLabel, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flex: 1 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 60, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  pName: { ...typography.cardTitle, color: colors.textDark },
  pMeta: { ...typography.bodySm, color: colors.textMuted },
});
