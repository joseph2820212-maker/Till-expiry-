import React, { useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { BatchCard } from '../../../components/status/BatchCard';
import { Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { rankBatches } from '../../../domain/expiry/expirySort';
import { getProduct, setProductHidden } from '../productStore';
import { listBatches } from '../../batches/batchStore';
import { listLocations } from '../../locations/locationStore';
import { listItems } from '../../lists/listStore';
import { getRule } from '../../rules/ruleStore';
import { getGeneral } from '../../settings/settingsStore';
import { moneyText } from '../../batches/format';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/** E10 — a product and its active dated batches, most urgent first. Dates always belong to batches, never products. */
export const ProductDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'ProductDetail'>>();
  const inFlight = useRef(false);
  const { data, reload } = useWorkspaceData(async ws => {
    const product = await getProduct(ws.id, params.id);
    if (!product) return { product: null } as const;
    const [batches, locations, lists, rule] = await Promise.all([
      listBatches(ws.id), listLocations(ws.id, { includeHidden: true }),
      Promise.all([listItems(ws.id, 'category', { includeHidden: true }), listItems(ws.id, 'supplier', { includeHidden: true })]),
      product.defaultRuleId ? getRule(ws.id, product.defaultRuleId) : Promise.resolve(null),
    ]);
    const names = new Map<string, string>([...locations, ...lists[0], ...lists[1]].map(x => [x.id, x.name]));
    return { product, rule, ranked: rankBatches(batches.filter(b => b.productId === product.id), Date.now(), getGeneral()), name: (id?: string) => (id ? names.get(id) : undefined) } as const;
  });

  if (data && !data.product) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t('product.title')} onBack={() => nav.goBack()} />
        <View style={s.content}><EmptyState icon="help-circle-outline" title={t('product.notFound')} body={t('product.notFoundBody')} /></View>
      </View>
    );
  }
  const p = data?.product;

  const setHidden = async (hidden: boolean) => {
    if (!p || inFlight.current) return;
    inFlight.current = true;
    try { await setProductHidden(p.workspaceId, p.id, hidden); reload(); }
    catch { AppAlert.error(t('errors.saveFailed')); }
    finally { inFlight.current = false; }
  };

  const facts: [string, string | undefined][] = p ? [
    [t('product.sku'), p.sku],
    [t('product.barcodes'), p.barcodes.map(b => b.code).join(', ') || undefined],
    [t('product.category'), data?.name(p.categoryId)],
    [t('product.supplier'), data?.name(p.supplierId)],
    [t('product.unit'), p.trackingUnit === 'custom' ? p.customUnitLabel : t(`unit.${p.trackingUnit}`)],
    [t('product.defaultPlace'), data?.name(p.defaultLocationId)],
    [t('product.defaultDateKind'), p.defaultDateKind ? t(`dateKind.${p.defaultDateKind}`) : undefined],
    [t('product.defaultRule'), data?.rule?.name],
    [t('product.cost'), p.costPerTrackingUnit ? moneyText(p.costPerTrackingUnit) : t('product.notRecorded')],
    [t('product.price'), p.sellingPrice ? moneyText(p.sellingPrice) : t('product.notRecorded')],
    [t('product.notes'), p.notes],
  ] : [];

  return (
    <View style={s.root}>
      <ScreenHeader title={p?.name ?? t('product.title')} subtitle={p?.status === 'hidden' ? t('product.hiddenTag') : undefined} onBack={() => nav.goBack()} rightIcon="create-outline" rightLabel={t('common.edit')} onRightPress={() => p && nav.navigate('ProductEdit', { id: p.id })} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {p ? (
          <>
            <View style={s.actions}>
              <AppButton label={t(p.isPrepared ? 'product.addPrepared' : 'product.addBatch')} icon="add" onPress={() => nav.navigate(p.isPrepared ? 'AddPrepared' : 'AddBoughtIn', { productId: p.id })} style={s.flex} testID="product-add-batch" />
              {!p.isPrepared ? <AppButton label={t('product.openSome')} variant="outline" onPress={() => nav.navigate('AddOpened', { productId: p.id })} style={s.flex} /> : null}
            </View>
            <Text style={s.section}>{t('product.batches', { count: data?.ranked.length ?? 0 })}</Text>
            {data?.ranked.length ? data.ranked.map(r => (
              <BatchCard key={r.batch.id} batch={r.batch} evaluation={r.evaluation} locationName={data.name(r.batch.locationId)} onPress={() => nav.navigate('BatchDetail', { id: r.batch.id })} />
            )) : <EmptyState icon="calendar-outline" title={t('product.noBatchesTitle')} body={t('product.noBatchesBody')} />}
            <Section title={t('product.details')}>
              {facts.filter(([, v]) => v).map(([label, value]) => (
                <View key={label} style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>
              ))}
            </Section>
            {p.status === 'active'
              ? <AppButton label={t('product.hide')} variant="dangerLink" onPress={() => AppAlert.alert(t('product.hideTitle'), t('product.hideBody'), [{ text: t('common.cancel'), style: 'cancel' }, { text: t('product.hide'), style: 'destructive', onPress: () => { void setHidden(true); } }])} />
              : <AppButton label={t('product.unhide')} variant="outline" onPress={() => { void setHidden(false); }} />}
          </>
        ) : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  actions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  section: { ...typography.cardTitle, color: colors.textDark, marginTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.rule2 },
  rowLabel: { ...typography.bodySm, color: colors.textMuted, maxWidth: '45%' },
  rowValue: { ...typography.body, color: colors.textDark, flex: 1, textAlign: 'right' },
});
