import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { FilterChip } from '../../../components/FilterChip';
import { DatePickerField } from '../../../components/DatePickerField';
import { AppAlert } from '../../../components/AppAlert';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { checkLimit } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { DATE_TYPES, type DateType, type Product } from '../../../domain/types';
import { addDays, daysBetween, endOfMonth, todayLocal } from '../../../domain/dates';
import { normalizeArabicNumerals } from '../../../utils/locale';
import { countProductsForLimit, findByBarcode, getProduct, listProducts, ProductValidationError, searchProducts, PRODUCT_LIMITS } from '../../products/storage/productStore';
import { addDate, BATCH_LIMITS, BatchValidationError, editBatch, getBatch } from '../storage/batchStore';
import { takePendingScan } from '../../products/utils/scanBus';
import type { BarcodeSymbology } from '../../products/utils/barcode';
import { useExpirySettings } from '../../settings/settingsStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'AddDate'>;
/** The calendar may go years ahead (tins, frozen food); nothing after this is a real pack date. */
const FAR_FUTURE = '2199-12-31';

/**
 * Add a date (or correct one): pick the product — search, scan or type a new name — then the date, its kind,
 * and optionally how many, where, and a note. A new product is created in the same save as its first date.
 */
export const AddDateScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const tier = useTier();
  const settings = useExpirySettings();
  const editId = params?.batchId;
  const [product, setProduct] = useState<Product | null>(null);
  const [all, setAll] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [barcode, setBarcode] = useState(params?.barcode ?? '');
  const [symbology, setSymbology] = useState<BarcodeSymbology>((params?.symbology as BarcodeSymbology) ?? 'unknown');
  const [date, setDate] = useState('');
  const [dateType, setDateType] = useState<DateType>(settings.defaultDateType);
  const [qty, setQty] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const inFlight = useRef(false);
  const today = todayLocal();

  const choose = useCallback((p: Product | null) => {
    setProduct(p);
    if (p) { setDateType(p.defaultDateType ?? settings.defaultDateType); setQuery(''); setNewName(''); }
  }, [settings.defaultDateType]);

  useEffect(() => {
    listProducts().then(setAll).catch(() => undefined);
    if (editId) {
      getBatch(editId).then(async b => {
        if (!b) return;
        setDate(b.date); setDateType(b.dateType); setQty(b.quantity != null ? String(b.quantity) : ''); setLocation(b.location ?? ''); setNote(b.note ?? '');
        setProduct(await getProduct(b.productId));
      }).catch(() => undefined);
    } else if (params?.productId) {
      getProduct(params.productId).then(p => choose(p)).catch(() => undefined);
    } else if (params?.barcode) {
      findByBarcode(params.barcode, (params.symbology as BarcodeSymbology) ?? 'unknown').then(p => { if (p) choose(p); }).catch(() => undefined);
    }
  }, [editId, params?.productId, params?.barcode, params?.symbology, choose]);

  useFocusEffect(useCallback(() => {
    const scan = takePendingScan('date');
    if (!scan) return;
    findByBarcode(scan.code, scan.symbology as BarcodeSymbology).then(p => {
      if (p) choose(p);
      else { choose(null); setBarcode(scan.code); setSymbology(scan.symbology as BarcodeSymbology); }
    }).catch(() => undefined);
  }, [choose]));

  const matches = useMemo(() => (query.trim() ? searchProducts(all, query).slice(0, 6) : []), [all, query]);
  const quick = useMemo(() => {
    const list: { label: string; value: string }[] = [];
    if (product?.shelfLifeDays) list.push({ label: t('addDate.quickShelfLife', { count: product.shelfLifeDays }), value: addDays(today, product.shelfLifeDays) });
    list.push({ label: t('addDate.quickTomorrow'), value: addDays(today, 1) });
    list.push({ label: t('addDate.quickDays', { count: 3 }), value: addDays(today, 3) });
    list.push({ label: t('addDate.quickWeek'), value: addDays(today, 7) });
    list.push({ label: t('addDate.quickEndOfMonth'), value: endOfMonth(today) });
    return list;
  }, [product?.shelfLifeDays, today, t]);

  const reset = () => { choose(null); setBarcode(''); setSymbology('unknown'); setDate(''); setQty(''); setNote(''); setErrors({}); };

  const save = async (another: boolean) => {
    if (inFlight.current) return;
    const e: Record<string, string> = {};
    const name = newName.trim();
    if (!product && !name) e.product = t('addDate.errors.productRequired');
    if (!date) e.date = t('addDate.errors.dateRequired');
    const qn = qty.trim() ? Number(normalizeArabicNumerals(qty.trim())) : undefined;
    if (qty.trim() && !(Number.isInteger(qn) && (qn as number) >= 1 && (qn as number) <= BATCH_LIMITS.quantity)) e.qty = t('addDate.errors.quantity', { max: BATCH_LIMITS.quantity });
    setErrors(e);
    if (Object.keys(e).length) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const draft = { date, dateType, quantity: qn, location, note };
      if (editId) {
        await editBatch(editId, draft);
        AppAlert.success(t('addDate.updated'));
        nav.goBack();
        return;
      }
      if (!product && !checkLimit(tier, 'products', await countProductsForLimit()).allowed) { setLimitOpen(true); return; }
      const r = await addDate(product ? { productId: product.id, ...draft } : { newProduct: { name, barcodes: barcode.trim() ? [{ raw: barcode.trim(), symbology }] : [], defaultDateType: dateType }, ...draft });
      const when = daysBetween(today, date);
      AppAlert.success(r.merged ? t('addDate.merged') : when < 0 ? t('addDate.savedExpired') : t('addDate.saved'));
      if (another) { reset(); listProducts().then(setAll).catch(() => undefined); }
      else nav.goBack();
    } catch (err) {
      if (err instanceof ProductValidationError) AppAlert.error(t(`productEdit.errors.store.${err.code}`));
      else if (err instanceof BatchValidationError) AppAlert.error(t(`addDate.errors.store.${err.code}`));
      else AppAlert.error(t('addDate.errors.saveFailed'));
    } finally { setBusy(false); inFlight.current = false; }
  };

  const field = (value: string, onChange: (v: string) => void, opts: { placeholder?: string; keyboard?: 'default' | 'number-pad'; maxLength?: number; testID?: string } = {}) => (
    <AppTextInput style={s.input} value={value} onChangeText={onChange} placeholder={opts.placeholder} placeholderTextColor={colors.textFaint} keyboardType={opts.keyboard ?? 'default'} maxLength={opts.maxLength} testID={opts.testID} />
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={editId ? t('addDate.editTitle') : t('addDate.title')} subtitle={t('addDate.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>{t('addDate.product')}</Text>
          {product ? (
            <View style={s.chosen}>
              <View style={s.chosenText}>
                <Text style={s.chosenName} numberOfLines={2}>{product.name}</Text>
                {product.barcodes?.[0] ? <Text style={s.meta}>{product.barcodes[0].raw}</Text> : null}
              </View>
              {!editId ? <TouchableOpacity onPress={() => choose(null)} accessibilityRole="button" style={s.change}><Text style={s.changeText}>{t('addDate.change')}</Text></TouchableOpacity> : null}
            </View>
          ) : (
            <>
              <View style={s.inline}>
                <View style={s.flex}>{field(query, setQuery, { placeholder: t('addDate.searchPh'), testID: 'ad-search' })}</View>
                <TouchableOpacity style={s.scanBtn} onPress={() => nav.navigate('Scan', { mode: 'attachDate' })} accessibilityRole="button" accessibilityLabel={t('addDate.scan')}>
                  <Ionicons name="barcode-outline" size={22} color={colors.primaryBlue} />
                </TouchableOpacity>
              </View>
              {matches.map(p => (
                <TouchableOpacity key={p.id} style={s.match} onPress={() => choose(p)} accessibilityRole="button">
                  <Text style={s.matchName} numberOfLines={1}>{p.name}</Text>
                  {p.barcodes?.[0] ? <Text style={s.meta}>{p.barcodes[0].raw}</Text> : null}
                </TouchableOpacity>
              ))}
              {query.trim() && !matches.length ? <Text style={s.hint}>{t('addDate.noMatch')}</Text> : null}
              <Text style={[s.label, s.gapTop]}>{t('addDate.orNew')}</Text>
              {field(newName, setNewName, { placeholder: t('addDate.newNamePh'), maxLength: PRODUCT_LIMITS.name, testID: 'ad-new-name' })}
              {barcode ? <Text style={s.hint}>{t('addDate.newBarcode', { code: barcode })}</Text> : null}
            </>
          )}
          {errors.product ? <Text style={s.err}>{errors.product}</Text> : null}
        </View>

        <View style={s.card}>
          <DatePickerField label={t('addDate.date')} value={date} onChange={setDate} maxDate={FAR_FUTURE} placeholder={t('addDate.datePh')} />
          <View style={s.chips}>
            {quick.map(q => <FilterChip key={q.label} label={q.label} active={date === q.value} onPress={() => setDate(q.value)} />)}
          </View>
          {date && daysBetween(today, date) < 0 ? <Text style={s.warn}>{t('addDate.pastWarning')}</Text> : null}
          {errors.date ? <Text style={s.err}>{errors.date}</Text> : null}
          <Text style={[s.label, s.gapTop]}>{t('addDate.dateType')}</Text>
          <View style={s.chips}>
            {DATE_TYPES.map(k => <FilterChip key={k} label={t(`dateType.${k}`)} active={dateType === k} onPress={() => setDateType(k)} />)}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>{t('addDate.quantity')}</Text>
          {field(qty, setQty, { placeholder: t('addDate.quantityPh'), keyboard: 'number-pad', maxLength: 5, testID: 'ad-qty' })}
          {errors.qty ? <Text style={s.err}>{errors.qty}</Text> : <Text style={s.hint}>{t('addDate.quantityHint')}</Text>}
          <Text style={[s.label, s.gapTop]}>{t('addDate.location')}</Text>
          {field(location, setLocation, { placeholder: product?.shelfLocation || t('addDate.locationPh'), maxLength: BATCH_LIMITS.location })}
          <Text style={[s.label, s.gapTop]}>{t('addDate.note')}</Text>
          {field(note, setNote, { placeholder: t('addDate.notePh'), maxLength: BATCH_LIMITS.note })}
        </View>

        <AppButton label={t('common.save')} onPress={() => save(false)} loading={busy} disabled={busy} />
        {!editId ? <AppButton label={t('addDate.saveAnother')} onPress={() => save(true)} variant="secondary" disabled={busy} /> : null}
      </AppKeyboardScrollView>
      <FreeLimitSheet reason={limitOpen ? 'products' : null} onClose={() => setLimitOpen(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  scanBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardWhite },
  match: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.rule2 },
  matchName: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chosenText: { flex: 1, gap: 2 },
  chosenName: { ...typography.cardTitle, color: colors.textDark },
  change: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.softBlue },
  changeText: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700' },
  meta: { ...typography.bodySm, color: colors.textFaint },
  hint: { ...typography.bodySm, color: colors.textMuted },
  warn: { ...typography.bodySm, color: '#9A4E0F' },
  err: { ...typography.bodySm, color: colors.dangerRed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
});
