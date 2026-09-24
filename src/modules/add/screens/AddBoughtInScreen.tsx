/**
 * E16 Add — bought in, and E19 Add — other dated item (same form, kind 'other'). §12.1 / §12.4.
 *
 * Product (existing or new inline) → kind of date → date with the right precision → optional quantity, lot, place,
 * cost / price → reminder preview → save. A scanned standard barcode identifies the product only: the date is always
 * asked here. GS1 data, when present, only PREFILLS the date / lot; the user must confirm it against the pack.
 * "No date" is allowed and the item is shown as needing checking — never as okay.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Batch, DateKind, Product, TrackingUnit } from '../../../domain/expiry/expiryTypes';
import { TRACKING_UNITS } from '../../../domain/expiry/expiryTypes';
import { moneyFromMinor } from '../../../domain/money';
import { priceToInput } from '../../../domain/typedPrice';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { DeadlineInput } from '../../../components/forms/DeadlineInput';
import { newId } from '../../../storage/entityStore';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listProducts } from '../../products/productStore';
import { moneyFieldText } from '../../products/utils/moneyFields';
import { listLocations } from '../../locations/locationStore';
import { createDatedBatch } from '../../batches/batchStore';
import { deadlineLine, formatDeadlineValue } from '../../batches/format';
import { useReminderSettings } from '../../settings/settingsStore';
import { findByBarcodeIn } from '../../products/productStore';
import type { BarcodeSymbology } from '../../products/utils/barcode';
import { parseGs1, gtinLookupCodes, type Gs1Result } from '../gs1';
import {
  BOUGHT_IN_KINDS, OTHER_KINDS, buildDatedPlan, createSaveGuard, datedPreview, gs1Suggestion, type DatedForm, type FormErrors,
} from '../addForms';
import { LocationField, ProductPickerSheet, ReminderPreview, errorMessage, s, useScanResult } from '../components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;
type Params = { productId?: string; barcode?: string; symbology?: string; gs1?: string } | undefined;

const emptyForm = (kind: DatedForm['kind']): DatedForm => ({ kind, newName: '', quantityText: '', lot: '', costText: '', priceText: '', notes: '' });



const DatedAddScreen: React.FC<{ kind: DatedForm['kind'] }> = ({ kind }) => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteProp<TabStackParamList, 'AddBoughtIn'>>();
  const params = route.params as Params;
  const { data, workspace: ws } = useWorkspaceData(async w => ({ products: await listProducts(w.id), locations: await listLocations(w.id) }));
  const reminders = useReminderSettings();
  const [form, setForm] = useState<DatedForm>(() => emptyForm(kind));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Batch | null>(null);
  const [picker, setPicker] = useState(false);
  const [gs1, setGs1] = useState<Gs1Result | null>(null);
  const [dlKey, setDlKey] = useState(0);
  const guard = useRef(createSaveGuard(() => newId('req'))).current;
  const applied = useRef<string | null>(null);

  const tz = ws?.timeZone ?? 'UTC';
  const currency = ws?.currency ?? '';
  const products = data?.products ?? [];
  const product = useMemo(() => products.find(p => p.id === form.productId) ?? null, [products, form.productId]);
  const kinds = kind === 'other' ? OTHER_KINDS : BOUGHT_IN_KINDS;

  const patch = useCallback((p: Partial<DatedForm>) => { setForm(f => ({ ...f, ...p })); setErrors({}); setFormError(null); }, []);

  /** Choosing a product brings its defaults (date kind, place, unit, cost / price) unless the user already chose. */
  const selectProduct = useCallback((p: Product, keepDate = false) => {
    setForm(f => ({
      ...f,
      productId: p.id,
      newName: '',
      newBarcode: undefined,
      newSymbology: undefined,
      dateKind: keepDate && f.dateKind ? f.dateKind : (f.dateKind ?? (p.defaultDateKind && kinds.includes(p.defaultDateKind) ? p.defaultDateKind : undefined)),
      locationId: f.locationId ?? p.defaultLocationId,
      unit: p.trackingUnit,
      customUnit: p.customUnitLabel,
      costText: moneyFieldText(p.costPerTrackingUnit, currency),
      priceText: moneyFieldText(p.sellingPrice, currency),
    }));
    setErrors({});
  }, [kinds]);

  // Route params (from the scanner or a product screen), applied once per distinct set once products are loaded.
  useEffect(() => {
    if (!data) return;
    const key = JSON.stringify(params ?? {});
    if (applied.current === key) return;
    applied.current = key;
    if (!params) return;
    let target: Product | null = params.productId ? data.products.find(p => p.id === params.productId) ?? null : null;
    let parsed: Gs1Result | null = null;
    if (params.gs1) {
      parsed = parseGs1(params.gs1, { allowBare: true });
      setGs1(parsed);
      if (!target && parsed?.gtin) for (const c of gtinLookupCodes(parsed.gtin)) { target = findByBarcodeIn(data.products, c); if (target) break; }
    } else {
      setGs1(null);
    }
    if (!target && params.barcode) target = findByBarcodeIn(data.products, params.barcode, (params.symbology as BarcodeSymbology) ?? 'unknown');
    const sug = gs1Suggestion(parsed, ws?.mode);
    setForm(f => ({
      ...emptyForm(f.kind),
      newBarcode: !target ? (params.barcode ?? (parsed?.gtin ? gtinLookupCodes(parsed.gtin)[0] : undefined)) : undefined,
      newSymbology: !target ? params.symbology : undefined,
      dateKind: sug.dateKind && kinds.includes(sug.dateKind) ? sug.dateKind : undefined,
      deadline: sug.dateKind && kinds.includes(sug.dateKind) ? sug.deadline : undefined,
      lot: sug.lot ?? '',
      gs1Prefilled: !!sug.deadline && !!sug.dateKind && kinds.includes(sug.dateKind),
      gs1Confirmed: false,
    }));
    if (target) selectProduct(target, true);
    setSaved(null);
    setDlKey(k => k + 1);
  }, [data, params, ws?.mode, kinds, selectProduct]);

  // Barcode scanned for a NEW product inline.
  useScanResult('product', useCallback((code: string, symbology: string) => {
    const hit = findByBarcodeIn(products, code, symbology as BarcodeSymbology);
    if (hit) selectProduct(hit, true);
    else patch({ newBarcode: code, newSymbology: symbology });
  }, [products, selectProduct, patch]));

  const reset = () => {
    setForm(f => ({ ...emptyForm(kind), locationId: f.locationId }));
    setGs1(null); setSaved(null); setErrors({}); setFormError(null); setDlKey(k => k + 1);
  };

  const save = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      await guard.run(async requestId => {
        const plan = buildDatedPlan(form, { workspaceId: ws.id, currency, product, requestId });
        if (!plan.ok) { setErrors(plan.errors); return; }
        try {
          // One transaction: the product's cost / price change and the new batch are saved together or not at all.
          const b = await createDatedBatch(plan.input.input);
          setSaved(b);
        } catch (e) {
          setFormError(errorMessage(t, e));
          throw e;
        }
      });
    } catch { /* shown above */ } finally {
      setSaving(false);
    }
  };

  const title = t(kind === 'other' ? 'add.other.title' : 'add.boughtIn.title');
  const errText = (code?: string) => (code ? t(`add.errors.${code}`) : undefined);
  const preview = datedPreview(form.dateKind, form.deadline);

  if (saved) {
    return (
      <View style={s.root}>
        <ScreenHeader title={title} onBack={() => nav.goBack()} />
        <AppKeyboardScrollView contentContainerStyle={s.content}>
          <View style={s.success} testID="add-saved">
            <Text style={s.title}>{t('add.saved.title', { name: saved.productName })}</Text>
            <Text style={s.strong}>{deadlineLine(t, saved.effective, saved.timeZone)}</Text>
            {saved.effective.dateKind === 'none' ? <Text style={s.meta}>{t('add.noDateNeedsChecking')}</Text> : null}
          </View>
          <AppButton label={t('add.saved.addAnother')} onPress={reset} testID="add-another" />
          <AppButton label={t('add.saved.view')} onPress={() => nav.navigate('BatchDetail', { id: saved.id })} variant="secondary" testID="add-view" />
        </AppKeyboardScrollView>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScreenHeader title={title} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {/* 1. Product */}
        <Section title={t('add.product.section')} testID="section-product">
          {product ? (
            <View style={s.selected}>
              <Text style={s.title}>{product.name}</Text>
              {product.barcodes[0] ? <Text style={s.meta}>{product.barcodes.map(b => b.code).join(', ')}</Text> : null}
              <AppButton label={t('add.product.change')} onPress={() => setPicker(true)} variant="outline" />
            </View>
          ) : (
            <View style={s.gap}>
              <AppButton label={t('add.product.choose')} onPress={() => setPicker(true)} variant="secondary" testID="choose-product" />
              <Hint text={t('add.product.orNew')} />
              <Field label={t('add.product.newName')} value={form.newName} onChangeText={v => patch({ newName: v })} placeholder={t('add.product.newNamePh')} maxLength={120} testID="new-product-name" />
              <Field label={t('add.product.barcode')} value={form.newBarcode ?? ''} onChangeText={v => patch({ newBarcode: v, newSymbology: undefined })} placeholder="5000157024671" maxLength={48} ltr testID="new-product-barcode" />
              <AppButton label={t('add.product.scanBarcode')} onPress={() => nav.navigate('BarcodeScanner', { purpose: 'attach' })} variant="outline" />
            </View>
          )}
          <ErrorText text={errText(errors.product)} />
        </Section>

        {/* GS1 data read from the code: shown, never trusted blindly. */}
        {gs1 ? (
          <Section title={t('gs1.section')} testID="section-gs1">
            {gs1.gtin ? <Text style={s.meta}>{t('gs1.gtin', { gtin: gs1.gtin })}</Text> : null}
            {gs1.lot ? <Text style={s.meta}>{t('gs1.lot', { lot: gs1.lot })}</Text> : null}
            {gs1.expiry ? <Text style={s.meta}>{t('gs1.expiry', { date: formatDeadlineValue(gs1.expiry, tz) })}</Text> : null}
            {gs1.bestBefore ? <Text style={s.meta}>{t('gs1.bestBefore', { date: formatDeadlineValue(gs1.bestBefore, tz) })}</Text> : null}
            {!gs1.expiry && !gs1.bestBefore ? <Text style={s.meta}>{t('gs1.noDate')}</Text> : null}
            {gs1.issues.length ? <Text style={s.error}>{t('gs1.partial')}</Text> : null}
            <Hint text={t('gs1.checkPack')} />
            {form.gs1Prefilled ? <CheckboxRow label={t('gs1.confirm')} checked={!!form.gs1Confirmed} onToggle={() => patch({ gs1Confirmed: !form.gs1Confirmed })} /> : null}
            <ErrorText text={errText(errors.gs1)} />
          </Section>
        ) : null}

        {/* 2. Kind of date + date */}
        <Section title={t('add.dateKind.section')} hint={t('add.dateKind.hint')} testID="section-date">
          <ChoiceChips options={kinds.map(k => ({ value: k, label: t(`dateKind.${k}`) }))} value={form.dateKind} onChange={(k: DateKind) => patch({ dateKind: k, gs1Confirmed: false })} />
          <ErrorText text={errText(errors.dateKind)} />
          {form.dateKind ? (
            <DeadlineInput key={dlKey} kind={form.dateKind} value={form.deadline} onChange={d => setForm(f => ({ ...f, deadline: d }))} tz={tz} error={errText(errors.deadline)} />
          ) : null}
          {form.dateKind === 'none' ? <Hint text={t('add.noDateNeedsChecking')} /> : null}
        </Section>

        {/* 3. Quantity (optional) */}
        <Section title={t('add.quantity.section')} hint={t('add.quantity.hint')}>
          <Field label={t('add.quantity.label')} value={form.quantityText} onChangeText={v => patch({ quantityText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.quantity)} ltr testID="quantity" />
          <ChoiceChips label={t('add.unit')} options={TRACKING_UNITS.map(u => ({ value: u, label: t(`unit.${u}`) }))} value={form.unit ?? 'each'} onChange={(u: TrackingUnit) => patch({ unit: u })} />
          {form.unit === 'custom' ? <Field label={t('add.customUnit')} value={form.customUnit ?? ''} onChangeText={v => patch({ customUnit: v })} maxLength={20} error={errText(errors.unit)} /> : null}
        </Section>

        {/* 4. Lot and place */}
        <Section title={t('add.lotPlace.section')}>
          <Field label={t('add.lot')} value={form.lot} onChangeText={v => patch({ lot: v })} placeholder={t('common.optional')} maxLength={40} ltr testID="lot" />
          <LocationField locations={data?.locations ?? []} value={form.locationId} onChange={id => patch({ locationId: id })} />
        </Section>

        {/* 5. Cost / price: only when the business has a currency; exact money, unknown stays unknown. */}
        <Section title={t('add.money.section')} hint={currency ? t('add.money.hint') : t('add.money.noCurrency')}>
          {currency ? (
            <>
              <Field label={t('add.money.cost', { currency })} value={form.costText} onChangeText={v => patch({ costText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.cost)} ltr testID="cost" />
              <Field label={t('add.money.price', { currency })} value={form.priceText} onChangeText={v => patch({ priceText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.price)} ltr testID="price" />
            </>
          ) : null}
        </Section>

        <Section title={t('add.notes')}>
          <Field label={t('add.notes')} value={form.notes} onChangeText={v => patch({ notes: v })} placeholder={t('common.optional')} maxLength={300} multiline />
        </Section>

        {/* 6. Reminder preview */}
        <Section title={t('add.reminder.section')}>
          <Text style={s.strong}>{deadlineLine(t, preview, tz)}</Text>
          <ReminderPreview info={preview} tz={tz} settings={reminders} />
        </Section>

        <ErrorText text={formError} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws} testID="add-save" />
      </AppKeyboardScrollView>
      <ProductPickerSheet
        visible={picker}
        onClose={() => setPicker(false)}
        products={products}
        onPick={p => { setPicker(false); selectProduct(p); }}
        onCreate={name => { setPicker(false); setForm(f => ({ ...f, productId: undefined, newName: name })); }}
      />
    </View>
  );
};

export const AddBoughtInScreen: React.FC = () => <DatedAddScreen kind="bought_in" />;
export const AddOtherDatedScreen: React.FC = () => <DatedAddScreen kind="other" />;
