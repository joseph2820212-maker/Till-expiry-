/**
 * E11 Product edit / new product. A product holds what stays the same (name, barcodes, SKU, category, supplier, unit,
 * usual place, usual kind of date, usual rule, prepared flag, optional exact cost / price, notes); every dated
 * quantity is a separate batch. Products are hidden, never deleted, so history stays readable.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BarcodeRole, DateKind, TrackingUnit } from '../../../domain/expiry/expiryTypes';
import { DATE_KINDS, TRACKING_UNITS } from '../../../domain/expiry/expiryTypes';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { DropdownField } from '../../../components/DropdownField';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { getProduct, saveProduct, setProductHidden } from '../productStore';
import { listLocations } from '../../locations/locationStore';
import { listRules } from '../../rules/ruleStore';
import { addListItem, listItems } from '../../lists/listStore';
import { addBarcode, emptyProductForm, formToDraft, productToForm, type ProductForm } from '../utils/productForm';
import { LocationField, errorMessage, useScanResult } from '../../add/components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;
const NONE = '__none';
const ROLES: BarcodeRole[] = ['single', 'pack', 'case'];

export const ProductEditScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'ProductEdit'>>();
  const id = params?.id;
  const { data, workspace: ws } = useWorkspaceData(async w => ({
    product: id ? await getProduct(w.id, id) : null,
    locations: await listLocations(w.id),
    rules: await listRules(w.id),
    categories: await listItems(w.id, 'category'),
    suppliers: await listItems(w.id, 'supplier'),
  }));
  const currency = ws?.currency ?? '';
  const [form, setForm] = useState<ProductForm>(emptyProductForm);
  const [newCat, setNewCat] = useState<string | undefined>();
  const [newSup, setNewSup] = useState<string | undefined>();
  const [codeText, setCodeText] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    if (data.product) setForm(productToForm(data.product));
    else if (params?.barcode) setForm(f => ({ ...f, barcodes: addBarcode(f.barcodes, params.barcode as string, params.symbology) }));
  }, [data, params]);

  const patch = useCallback((p: Partial<ProductForm>) => { setForm(f => ({ ...f, ...p })); setErrors({}); setFormError(null); }, []);

  useScanResult('product', useCallback((code: string, symbology: string) => {
    setForm(f => ({ ...f, barcodes: addBarcode(f.barcodes, code, symbology) }));
  }, []));

  const cats = data?.categories ?? [];
  const sups = data?.suppliers ?? [];
  const rules = data?.rules ?? [];
  const catName = useMemo(() => new Map(cats.map(c => [c.id, c.name])), [cats]);
  const supName = useMemo(() => new Map(sups.map(c => [c.id, c.name])), [sups]);
  const ruleName = useMemo(() => new Map(rules.map(r => [r.id, `${r.name} · ${t(`rules.appliesTo.${r.appliesTo}`)}`])), [rules, t]);
  const hidden = data?.product?.status === 'hidden';

  const save = async () => {
    if (!ws || inFlight.current) return;
    const built = formToDraft(form, currency);
    if (!built.ok) { setErrors(built.errors); return; }
    inFlight.current = true;
    setSaving(true);
    try {
      const draft = { ...built.draft };
      if (newCat) draft.categoryId = (await addListItem(ws.id, 'category', newCat)).id;
      if (newSup) draft.supplierId = (await addListItem(ws.id, 'supplier', newSup)).id;
      const p = await saveProduct(ws.id, draft, id);
      if (id) nav.goBack();
      else nav.replace('ProductDetail', { id: p.id });
    } catch (e) {
      setFormError(errorMessage(t, e));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const toggleHidden = () => {
    if (!ws || !id) return;
    const run = async () => {
      try { await setProductHidden(ws.id, id, !hidden); nav.goBack(); } catch (e) { AppAlert.error(errorMessage(t, e)); }
    };
    if (hidden) { run(); return; }
    AppAlert.alert(t('productEdit.hideTitle'), t('productEdit.hideBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('productEdit.hide'), style: 'destructive', onPress: run },
    ]);
  };

  const errText = (code?: string) => (code ? t(`productEdit.errors.${code}`) : undefined);
  const listValue = (idv: string | undefined, typed: string | undefined) => typed ?? idv ?? NONE;

  return (
    <View style={s.root}>
      <ScreenHeader title={id ? t('productEdit.editTitle') : t('productEdit.newTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {hidden ? <Hint text={t('productEdit.hiddenNote')} /> : null}
        <Section title={t('productEdit.details')}>
          <Field label={t('productEdit.name')} value={form.name} onChangeText={v => patch({ name: v })} placeholder={t('productEdit.namePh')} maxLength={120} error={errText(errors.name)} testID="product-name" />
          <Field label={t('productEdit.sku')} value={form.sku} onChangeText={v => patch({ sku: v })} placeholder={t('common.optional')} maxLength={40} ltr />
          <CheckboxRow label={t('productEdit.isPrepared')} checked={form.isPrepared} onToggle={() => patch({ isPrepared: !form.isPrepared })} />
          <Hint text={t('productEdit.isPreparedHint')} />
        </Section>

        <Section title={t('productEdit.barcodes')} hint={t('productEdit.barcodesHint')}>
          {form.barcodes.map((b, i) => (
            <View key={`${b.code}-${i}`} style={s.codeRow}>
              <View style={s.codeText}>
                <Text style={s.code}>{b.code}</Text>
                <ChoiceChips options={ROLES.map(r => ({ value: r, label: t(`productEdit.role.${r}`) }))} value={b.role} onChange={(r: BarcodeRole) => patch({ barcodes: form.barcodes.map((x, j) => (j === i ? { ...x, role: r } : x)) })} />
              </View>
              <TouchableOpacity onPress={() => patch({ barcodes: form.barcodes.filter((_, j) => j !== i) })} style={s.remove} accessibilityRole="button" accessibilityLabel={t('productEdit.removeCode', { code: b.code })}>
                <Text style={s.removeText}>{t('common.remove')}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Field label={t('productEdit.addCode')} value={codeText} onChangeText={setCodeText} placeholder="5000157024671" maxLength={48} ltr testID="code-input" />
          <AppButton label={t('productEdit.addCodeButton')} onPress={() => { patch({ barcodes: addBarcode(form.barcodes, codeText) }); setCodeText(''); }} variant="outline" disabled={!codeText.trim()} />
          <AppButton label={t('productEdit.scanCode')} onPress={() => nav.navigate('BarcodeScanner', { purpose: 'attach' })} variant="secondary" />
        </Section>

        <Section title={t('productEdit.grouping')}>
          <DropdownField label={t('productEdit.category')} value={listValue(form.categoryId, newCat)} options={[NONE, ...cats.map(c => c.id)]} getLabel={v => (v === NONE ? t('common.none') : catName.get(v) ?? v)} allowOther otherTitle={t('productEdit.newCategory')}
            onSelect={v => { if (v === NONE) { setNewCat(undefined); patch({ categoryId: undefined }); } else if (catName.has(v)) { setNewCat(undefined); patch({ categoryId: v }); } else { setNewCat(v.trim() || undefined); patch({ categoryId: undefined }); } }} />
          <DropdownField label={t('productEdit.supplier')} value={listValue(form.supplierId, newSup)} options={[NONE, ...sups.map(c => c.id)]} getLabel={v => (v === NONE ? t('common.none') : supName.get(v) ?? v)} allowOther otherTitle={t('productEdit.newSupplier')}
            onSelect={v => { if (v === NONE) { setNewSup(undefined); patch({ supplierId: undefined }); } else if (supName.has(v)) { setNewSup(undefined); patch({ supplierId: v }); } else { setNewSup(v.trim() || undefined); patch({ supplierId: undefined }); } }} />
        </Section>

        <Section title={t('productEdit.defaults')} hint={t('productEdit.defaultsHint')}>
          <ChoiceChips label={t('productEdit.unit')} options={TRACKING_UNITS.map(u => ({ value: u, label: t(`unit.${u}`) }))} value={form.unit} onChange={(u: TrackingUnit) => patch({ unit: u })} />
          {form.unit === 'custom' ? <Field label={t('productEdit.customUnit')} value={form.customUnit} onChangeText={v => patch({ customUnit: v })} maxLength={20} error={errText(errors.unit)} /> : null}
          <LocationField label={t('productEdit.defaultLocation')} locations={data?.locations ?? []} value={form.defaultLocationId} onChange={v => patch({ defaultLocationId: v })} />
          <ChoiceChips label={t('productEdit.defaultDateKind')} options={[{ value: NONE, label: t('common.notSet') }, ...DATE_KINDS.map(k => ({ value: k as string, label: t(`dateKind.${k}`) }))]} value={form.defaultDateKind ?? NONE} onChange={(k: string) => patch({ defaultDateKind: k === NONE ? undefined : (k as DateKind) })} />
          <DropdownField label={t('productEdit.defaultRule')} value={form.defaultRuleId && ruleName.has(form.defaultRuleId) ? form.defaultRuleId : NONE} options={[NONE, ...rules.map(r => r.id)]} getLabel={v => (v === NONE ? t('common.none') : ruleName.get(v) ?? v)} onSelect={v => patch({ defaultRuleId: v === NONE ? undefined : v })} />
        </Section>

        <Section title={t('productEdit.money')} hint={currency ? t('productEdit.moneyHint') : t('productEdit.noCurrency')}>
          {currency ? (
            <>
              <Field label={t('productEdit.cost', { currency })} value={form.costText} onChangeText={v => patch({ costText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.cost)} ltr />
              <Field label={t('productEdit.price', { currency })} value={form.priceText} onChangeText={v => patch({ priceText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.price)} ltr />
            </>
          ) : null}
        </Section>

        <Section title={t('productEdit.notes')}>
          <Field label={t('productEdit.notes')} value={form.notes} onChangeText={v => patch({ notes: v })} placeholder={t('common.optional')} maxLength={300} multiline />
        </Section>

        <ErrorText text={formError} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws || (!!id && !data)} testID="product-save" />
        {id && data?.product ? <AppButton label={hidden ? t('productEdit.unhide') : t('productEdit.hide')} onPress={toggleHidden} variant={hidden ? 'outline' : 'dangerLink'} /> : null}
        {id && data?.product ? <Hint text={t('productEdit.hideHint')} /> : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  codeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  codeText: { flex: 1, minWidth: 0, gap: 4 },
  code: { ...typography.body, fontWeight: '700', color: colors.textDark, writingDirection: 'ltr' },
  remove: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  removeText: { ...typography.bodySm, fontWeight: '700', color: colors.dangerRed },
});
