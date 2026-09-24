import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { AppTextInput } from '../../../components/AppTextInput';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { DateBatch, Product } from '../../../domain/types';
import { bandFor } from '../../../domain/expiry';
import { localDateShort } from '../../../utils/locale';
import { searchProducts } from '../storage/productStore';
import { useShelfData } from '../../dates/hooks/useShelfData';
import { BandPill, daysLeftText } from '../../dates/components/BatchRow';

type Filter = 'all' | 'withDates' | 'noDates' | 'archived';

/** Products tab: the product list with each product's next date, search, filters and add / scan / import. */
export const ProductsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { batches, products, today, alertDaysOf, error } = useShelfData('open');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const loaded = batches !== null;

  const nextDate = useMemo(() => {
    const m = new Map<string, { batch: DateBatch; count: number }>();
    for (const b of batches ?? []) {
      const cur = m.get(b.productId);
      if (!cur) m.set(b.productId, { batch: b, count: 1 });
      else m.set(b.productId, { batch: b.date < cur.batch.date ? b : cur.batch, count: cur.count + 1 });
    }
    return m;
  }, [batches]);

  const shown = useMemo(() => {
    let list = products.filter(p => (filter === 'archived' ? p.status === 'archived' : p.status !== 'archived'));
    if (filter === 'withDates') list = list.filter(p => nextDate.has(p.id));
    if (filter === 'noDates') list = list.filter(p => !nextDate.has(p.id));
    return searchProducts(list, query).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, filter, query, nextDate]);
  const activeCount = products.filter(p => p.status !== 'archived').length;

  const renderItem = ({ item }: { item: Product }) => {
    const next = nextDate.get(item.id);
    return (
      <TouchableOpacity style={s.row} onPress={() => nav.navigate('ProductDetail', { id: item.id })} activeOpacity={0.7} accessibilityRole="button" testID={`product-${item.id}`}>
        <View style={s.rowText}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{[item.shelfLocation, item.sku, item.barcodes?.[0]?.raw].filter(Boolean).join(' · ') || t('products.noDetails')}</Text>
          <View style={s.badges}>
            {next ? <BandPill band={bandFor(next.batch.date, today, alertDaysOf(next.batch))} text={`${localDateShort(next.batch.date)} · ${daysLeftText(t, next.batch, today)}`} /> : <Text style={s.badge}>{t('products.noOpenDates')}</Text>}
            {next && next.count > 1 ? <Text style={s.badge}>{t('products.moreDates', { count: next.count - 1 })}</Text> : null}
            {item.status === 'archived' ? <Text style={s.badge}>{t('products.badgeArchived')}</Text> : null}
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => nav.navigate('AddDate', { productId: item.id })} accessibilityRole="button" accessibilityLabel={t('products.addDateFor', { name: item.name })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="calendar-outline" size={20} color={colors.primaryBlue} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.root}>
      <TabRootHeader title={t('nav.products')} subtitle={loaded ? t('products.count', { count: activeCount }) : t('products.subtitle')} />
      <View style={s.tools}>
        <View style={s.actions}>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('ProductDetail', {})} accessibilityRole="button" testID="products-add">
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.add')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('Scan', { mode: 'find' })} accessibilityRole="button" testID="products-scan">
            <Ionicons name="barcode-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.scan')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.action} onPress={() => nav.navigate('Import')} accessibilityRole="button" testID="products-import">
            <Ionicons name="document-attach-outline" size={20} color={colors.primaryBlue} /><Text style={s.actionText}>{t('products.import')}</Text>
          </TouchableOpacity>
        </View>
        <View style={s.search}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <AppTextInput style={s.searchInput} value={query} onChangeText={setQuery} placeholder={t('products.searchPlaceholder')} placeholderTextColor={colors.textFaint} returnKeyType="search" accessibilityLabel={t('products.searchPlaceholder')} />
        </View>
        <View style={s.chips}>
          {(['all', 'withDates', 'noDates', 'archived'] as Filter[]).map(f => <FilterChip key={f} label={t(`products.filter.${f}`)} active={filter === f} onPress={() => setFilter(f)} />)}
        </View>
      </View>
      {error ? (
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('products.loadErrorTitle')} body={t('products.loadErrorBody')} /></View>
      ) : loaded && products.length === 0 ? (
        <View style={s.content}><EmptyState icon="pricetags-outline" title={t('products.emptyTitle')} body={t('products.emptyBody')} testID="products-empty" /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListEmptyComponent={loaded ? <EmptyState icon="search-outline" title={t('products.noMatchTitle')} body={t('products.noMatchBody')} /> : null}
          initialNumToRender={20}
          windowSize={10}
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
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, ...typography.body, color: colors.textDark, height: 46 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  content: { padding: spacing.screenPadding },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12 },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  badge: { ...typography.bodySm, fontSize: 11, color: colors.textMuted, backgroundColor: colors.inputMuted, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  addBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardWhite },
});
