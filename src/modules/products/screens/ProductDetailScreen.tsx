import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { AppAlert } from '../../../components/AppAlert';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { checkLimit } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { DATE_TYPES, type DateBatch, type DateType, type Product } from '../../../domain/types';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import { ALERT_DAYS_MAX, SHELF_LIFE_MAX, alertDaysFor } from '../../../domain/expiry';
import { todayLocal } from '../../../domain/dates';
import { normalizeArabicNumerals } from '../../../utils/locale';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { countProductsForLimit, getProduct, PRODUCT_LIMITS, ProductValidationError, saveProduct, setArchived, type ProductDraft } from '../storage/productStore';
import { batchesForProduct } from '../../dates/storage/batchStore';
import { takePendingScan } from '../utils/scanBus';
import { isValidEan13, type BarcodeSymbology } from '../utils/barcode';
import { useExpirySettings } from '../../settings/settingsStore';
import { BatchRow } from '../../dates/components/BatchRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ProductDetail'>;

const intOrUndef = (s: string) => (s.trim() ? Number(normalizeArabicNumerals(s.trim())) : undefined);

/** A digit-only code of retail length whose check digit fails is almost always a typing mistake. */
export function barcodeLooksWrong(code: string): boolean {
  const c = code.trim();
  if (!/^\d+$/.test(c)) return false;
  if (c.length === 13) return !isValidEan13(c);
  if (c.length === 12) return !isValidEan13(`0${c}`);
  if (c.length === 8) return !isValidEan13(`00000${c}`);
  return false;
}

/** Add / edit a product: name, barcode, where it lives, its usual date kind and shelf life, and its dates. */
export const ProductDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const id = params?.id;
  const tier = useTier();
  const settings = useExpirySettings();
  const [loaded, setLoaded] = useState<Product | null>(null);
  const [dates, setDates] = useState<DateBatch[]>([]);
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState(params?.barcode ?? '');
  const [symbology, setSymbology] = useState<BarcodeSymbology>((params?.symbology as BarcodeSymbology) ?? 'unknown');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [shelf, setShelf] = useState('');
  const [dateType, setDateType] = useState<DateType | undefined>(undefined);
  const [shelfLife, setShelfLife] = useState('');
  const [alertDays, setAlertDays] = useState('');
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const today = todayLocal();

  const currency = loaded?.price?.currency ?? (isCurrencySet() ? getCurrencyCode() : '');

  useEffect(() => {
    if (!id) return;
    getProduct(id).then(p => {
      if (!p) return;
      setLoaded(p); setName(p.name); setBarcode(p.barcodes?.[0]?.raw ?? ''); setSku(p.sku ?? ''); setCategory(p.category ?? ''); setShelf(p.shelfLocation ?? '');
      setDateType(p.defaultDateType); setShelfLife(p.shelfLifeDays != null ? String(p.shelfLifeDays) : ''); setAlertDays(p.alertDays != null ? String(p.alertDays) : ''); setPriceText(priceToInput(p.price));
    }).catch(() => undefined);
  }, [id]);

  useFocusEffect(useCallback(() => {
    const scan = takePendingScan('product');
    if (scan) { setBarcode(scan.code); setSymbology(scan.symbology as BarcodeSymbology); }
    if (id) batchesForProduct(id).then(setDates).catch(() => undefined);
  }, [id]));

  const buildDraft = (): ProductDraft | null => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t('productEdit.errors.nameRequired');
    const life = intOrUndef(shelfLife);
    if (life !== undefined && !(Number.isInteger(life) && life >= 1 && life <= SHELF_LIFE_MAX)) e.shelfLife = t('productEdit.errors.shelfLife', { max: SHELF_LIFE_MAX });
    const alert = intOrUndef(alertDays);
    if (alert !== undefined && !(Number.isInteger(alert) && alert >= 0 && alert <= ALERT_DAYS_MAX)) e.alertDays = t('productEdit.errors.alertDays', { max: ALERT_DAYS_MAX });
    let price: ProductDraft['price'];
    if (priceText.trim()) {
      if (!currency) e.price = t('productEdit.errors.noCurrency');
      else {
        const parsed = parseTypedPrice(priceText, currency);
        if (!parsed.ok) e.price = t(`dateDetail.priceError.${parsed.error}`);
        else price = parsed.money;
      }
    }
    if (barcodeLooksWrong(barcode)) e.barcode = t('productEdit.errors.barcode');
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      name, sku, category, shelfLocation: shelf, defaultDateType: dateType, shelfLifeDays: life, alertDays: alert, price,
      // The first barcode is edited here; any others (e.g. from an import) are kept as they are.
      barcodes: [...(barcode.trim() ? [{ raw: barcode.trim(), symbology }] : []), ...(loaded?.barcodes ?? []).slice(1).map(b => ({ raw: b.raw }))],
    };
  };

  const save = async () => {
    const draft = buildDraft();
    if (!draft || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (!id && !checkLimit(tier, 'products', await countProductsForLimit()).allowed) { setLimitOpen(true); return; }
      const p = await saveProduct(draft, id);
      AppAlert.success(t('productEdit.saved'));
      if (id) nav.goBack();
      else nav.replace('ProductDetail', { id: p.id });
    } catch (err) {
      if (err instanceof ProductValidationError) AppAlert.error(t(`productEdit.errors.store.${err.code}`));
      else AppAlert.error(t('productEdit.errors.saveFailed'));
    } finally { setBusy(false); inFlight.current = false; }
  };

  const toggleArchive = async () => {
    if (!loaded) return;
    try { await setArchived(loaded.id, loaded.status !== 'archived'); nav.goBack(); }
    catch { AppAlert.error(t('productEdit.errors.saveFailed')); }
  };

  const input = (value: string, onChange: (v: string) => void, opts: { placeholder?: string; keyboard?: 'default' | 'decimal-pad' | 'number-pad'; maxLength?: number; testID?: string } = {}) => (
    <AppTextInput style={s.input} value={value} onChangeText={onChange} placeholder={opts.placeholder} placeholderTextColor={colors.textFaint} keyboardType={opts.keyboard ?? 'default'} maxLength={opts.maxLength} testID={opts.testID} />
  );
  const open = dates.filter(d => d.status === 'open');
  const history = dates.filter(d => d.status === 'closed').slice(0, 10);

  return (
    <View style={s.root}>
      <ScreenHeader title={id ? t('productEdit.editTitle') : t('productEdit.addTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {loaded ? (
          <>
            <AppButton label={t('productEdit.addDate')} onPress={() => nav.navigate('AddDate', { productId: loaded.id })} />
            {open.length ? <Text style={s.section}>{t('productEdit.openDates', { count: open.length })}</Text> : null}
            {open.map(b => <BatchRow key={b.id} batch={b} product={loaded} today={today} alertDays={alertDaysFor(loaded, settings.alertDays)} onPress={() => nav.navigate('DateDetail', { id: b.id })} />)}
          </>
        ) : null}

        <Text style={s.section}>{t('productEdit.details')}</Text>
        <View style={s.field}>
          <Text style={s.label}>{t('productEdit.productName')}</Text>
          {input(name, setName, { placeholder: t('productEdit.productNamePh'), maxLength: PRODUCT_LIMITS.name, testID: 'pe-name' })}
          {errors.name ? <Text style={s.err}>{errors.name}</Text> : null}
        </View>

        <View style={s.field}>
          <Text style={s.label}>{t('productEdit.barcode')}</Text>
          <View style={s.inline}>
            <View style={{ flex: 1 }}>{input(barcode, v => { setBarcode(v); setSymbology('unknown'); }, { keyboard: 'number-pad', placeholder: t('productEdit.barcodePh'), testID: 'pe-barcode' })}</View>
            <TouchableOpacity style={s.scanBtn} onPress={() => nav.navigate('Scan', { mode: 'attach' })} accessibilityRole="button" accessibilityLabel={t('productEdit.scanBarcode')}>
              <Ionicons name="barcode-outline" size={22} color={colors.primaryBlue} />
            </TouchableOpacity>
          </View>
          {errors.barcode ? <Text style={s.err}>{errors.barcode}</Text> : null}
        </View>

        <View style={s.field}>
          <Text style={s.label}>{t('productEdit.shelf')}</Text>
          {input(shelf, setShelf, { placeholder: t('productEdit.shelfPh'), maxLength: PRODUCT_LIMITS.shelfLocation })}
          <Text style={[s.label, s.gapTop]}>{t('productEdit.category')}</Text>
          {input(category, setCategory, { placeholder: t('productEdit.categoryPh'), maxLength: PRODUCT_LIMITS.category })}
          <Text style={[s.label, s.gapTop]}>{t('productEdit.sku')}</Text>
          {input(sku, setSku, { maxLength: PRODUCT_LIMITS.sku })}
        </View>

        <View style={s.field}>
          <Text style={s.label}>{t('productEdit.usualDateType')}</Text>
          <View style={s.chips}>
            {DATE_TYPES.map(k => <FilterChip key={k} label={t(`dateType.${k}`)} active={(dateType ?? settings.defaultDateType) === k} onPress={() => setDateType(k)} />)}
          </View>
          <Text style={[s.label, s.gapTop]}>{t('productEdit.shelfLife')}</Text>
          {input(shelfLife, setShelfLife, { keyboard: 'number-pad', placeholder: t('productEdit.shelfLifePh'), maxLength: 4 })}
          {errors.shelfLife ? <Text style={s.err}>{errors.shelfLife}</Text> : <Text style={s.hint}>{t('productEdit.shelfLifeHint')}</Text>}
          <Text style={[s.label, s.gapTop]}>{t('productEdit.alertDays')}</Text>
          {input(alertDays, setAlertDays, { keyboard: 'number-pad', placeholder: t('productEdit.alertDaysPh', { days: settings.alertDays }), maxLength: 2 })}
          {errors.alertDays ? <Text style={s.err}>{errors.alertDays}</Text> : <Text style={s.hint}>{t('productEdit.alertDaysHint')}</Text>}
        </View>

        <View style={s.field}>
          <View style={s.fieldHead}><Text style={s.label}>{t('productEdit.price')}</Text><Text style={s.meta}>{currency || '—'}</Text></View>
          {input(priceText, setPriceText, { placeholder: t('productEdit.pricePh'), keyboard: 'decimal-pad', testID: 'pe-price' })}
          {errors.price ? <Text style={s.err}>{errors.price}</Text> : <Text style={s.hint}>{t('productEdit.priceHint')}</Text>}
          {!currency && priceText.trim() ? (
            <TouchableOpacity onPress={() => nav.navigate('SettingsCurrency')} accessibilityRole="button"><Text style={s.link}>{t('productEdit.chooseCurrency')}</Text></TouchableOpacity>
          ) : null}
        </View>

        <AppButton label={t('common.save')} onPress={save} loading={busy} disabled={busy} style={{ marginTop: spacing.sm }} />

        {loaded ? (
          <>
            {history.length ? <Text style={s.section}>{t('productEdit.pastDates')}</Text> : null}
            {history.map(b => <BatchRow key={b.id} batch={b} product={loaded} today={today} alertDays={alertDaysFor(loaded, settings.alertDays)} onPress={() => nav.navigate('DateDetail', { id: b.id })} />)}
            <SettingsSection title={t('productEdit.moreActions')}>
              <SettingsRow iconNode={<Ionicons name="archive-outline" size={18} color={colors.primaryBlue} />} label={loaded.status === 'archived' ? t('productEdit.restore') : t('productEdit.archive')} subtitle={t('productEdit.archiveHint')} onPress={toggleArchive} isLast />
            </SettingsSection>
          </>
        ) : null}
      </AppKeyboardScrollView>
      <FreeLimitSheet reason={limitOpen ? 'products' : null} onClose={() => setLimitOpen(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  field: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  meta: { ...typography.bodySm, color: colors.textFaint },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  hint: { ...typography.bodySm, color: colors.textMuted },
  err: { ...typography.bodySm, color: colors.dangerRed },
  link: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700', marginTop: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cardWhite },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
});
