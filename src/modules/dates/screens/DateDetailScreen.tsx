import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../../components/AppButton';
import { AppTextInput } from '../../../components/AppTextInput';
import { FilterChip } from '../../../components/FilterChip';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { LabelRow } from '../../../components/LabelRow';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { BatchEventKind, DateBatch, Product, WasteReason } from '../../../domain/types';
import { alertDaysFor, bandFor, currentReduction, percentOff, reducedBy, remainingQuantity } from '../../../domain/expiry';
import { todayLocal } from '../../../domain/dates';
import { parseTypedPrice, priceToInput } from '../../../domain/typedPrice';
import { localDate, localDateShort, normalizeArabicNumerals } from '../../../utils/locale';
import { displayMoney } from '../../../utils/displayMoney';
import { getCurrencyCode, isCurrencySet } from '../../../utils/currency';
import { getProduct } from '../../products/storage/productStore';
import { BatchValidationError, deleteBatch, getBatch, recordEvent, undoLastEvent } from '../storage/batchStore';
import { BandPill, daysLeftText } from '../components/BatchRow';
import { useExpirySettings } from '../../settings/settingsStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RemovalKind = Extract<BatchEventKind, 'sold' | 'wasted' | 'returned' | 'donated'>;
const REMOVALS: RemovalKind[] = ['sold', 'wasted', 'returned', 'donated'];
const REASONS: WasteReason[] = ['expired', 'damaged', 'quality', 'other'];
const PERCENTS = [25, 50, 75];

/** One date: where it stands, what is left, and what happened to it. Every action can be undone. */
export const DateDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'DateDetail'>>();
  const settings = useExpirySettings();
  const [batch, setBatch] = useState<DateBatch | null | undefined>(undefined);
  const [product, setProduct] = useState<Product | null>(null);
  const [sheet, setSheet] = useState<'reduce' | RemovalKind | null>(null);
  const [priceText, setPriceText] = useState('');
  const [qtyText, setQtyText] = useState('');
  const [reason, setReason] = useState<WasteReason>('expired');
  const [sheetError, setSheetError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const today = todayLocal();

  const load = useCallback(() => {
    getBatch(params.id).then(async b => {
      setBatch(b);
      setProduct(b ? await getProduct(b.productId) : null);
    }).catch(() => setBatch(null));
  }, [params.id]);
  useFocusEffect(load);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); if (done) AppAlert.success(done); load(); }
    catch (e) { AppAlert.error(e instanceof BatchValidationError ? t(`addDate.errors.store.${e.code}`) : t('addDate.errors.saveFailed')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  if (batch === undefined) return <View style={s.root}><ScreenHeader title={t('dateDetail.title')} onBack={() => nav.goBack()} /></View>;
  if (batch === null) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t('dateDetail.title')} onBack={() => nav.goBack()} />
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('dateDetail.missingTitle')} body={t('dateDetail.missingBody')} /></View>
      </View>
    );
  }

  const alertDays = alertDaysFor(product ?? undefined, settings.alertDays);
  const band = bandFor(batch.date, today, alertDays);
  const left = remainingQuantity(batch);
  const reduction = currentReduction(batch);
  const open = batch.status === 'open';
  const currency = reduction?.price?.currency ?? product?.price?.currency ?? (isCurrencySet() ? getCurrencyCode() : '');
  const normal = product?.price && product.price.currency === currency ? product.price : undefined;

  const openSheet = (k: 'reduce' | RemovalKind) => {
    setSheetError(''); setPriceText(''); setReason('expired');
    setQtyText(left != null ? String(left) : '');
    setSheet(k);
  };

  const confirmReduce = () => {
    const parsed = parseTypedPrice(priceText, currency);
    if (!parsed.ok) { setSheetError(t(`dateDetail.priceError.${parsed.error}`)); return; }
    if (normal && parsed.money.minor >= normal.minor) { setSheetError(t('dateDetail.priceNotLower')); return; }
    setSheet(null);
    run(() => recordEvent(batch.id, { kind: 'reduced', price: parsed.money }, today), t('dateDetail.reducedDone'));
  };

  const confirmRemove = (kind: RemovalKind) => {
    const raw = qtyText.trim() ? Number(normalizeArabicNumerals(qtyText.trim())) : undefined;
    if (qtyText.trim() && !(Number.isInteger(raw) && (raw as number) >= 1)) { setSheetError(t('dateDetail.qtyError')); return; }
    if (raw != null && left != null && raw > left) { setSheetError(t('dateDetail.qtyTooHigh', { count: left })); return; }
    setSheet(null);
    run(() => recordEvent(batch.id, { kind, quantity: raw, reason: kind === 'wasted' ? reason : undefined }, today), t(`dateDetail.done.${kind}`));
  };

  const confirmDelete = () => AppAlert.alert(t('dateDetail.deleteTitle'), t('dateDetail.deleteBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('dateDetail.deleteAction'), style: 'destructive', onPress: () => run(async () => { await deleteBatch(batch.id); nav.goBack(); }) },
  ]);

  const eventLine = (e: DateBatch['events'][number]) => {
    const parts = [t(`event.${e.kind}`)];
    if (e.quantity != null) parts.push(t('dateDetail.units', { count: e.quantity }));
    if (e.price) parts.push(displayMoney(e.price));
    if (e.reason) parts.push(t(`wasteReason.${e.reason}`));
    return parts.join(' · ');
  };

  const sheetOpen = sheet !== null;
  const reducePreview = sheet === 'reduce' ? parseTypedPrice(priceText, currency) : null;
  const pct = reducePreview?.ok && normal ? percentOff(normal, reducePreview.money) : null;

  return (
    <View style={s.root}>
      <ScreenHeader title={t('dateDetail.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.name}>{product?.name ?? batch.productName}</Text>
          <Text style={s.dateLine}>{`${t(`dateType.${batch.dateType}`)} · ${localDate(batch.date)}`}</Text>
          <View style={s.badges}>
            <BandPill band={band} text={daysLeftText(t, batch, today)} />
            {reduction?.price ? <Text style={s.reduced}>{t('dates.reducedTo', { price: displayMoney(reduction.price) })}</Text> : null}
            {!open ? <Text style={s.closed}>{t('dates.closed')}</Text> : null}
          </View>
          {open && band === 'expired' ? <Text style={s.advice}>{batch.dateType === 'bestBefore' ? t('dateDetail.adviceBestBefore') : t('dateDetail.adviceExpired')}</Text> : null}
        </View>

        <View style={s.card}>
          <LabelRow label={t('dateDetail.quantity')} value={batch.quantity != null ? String(batch.quantity) : t('dateDetail.notCounted')} />
          {batch.quantity != null ? <LabelRow label={t('dateDetail.left')} value={String(left)} /> : null}
          <LabelRow label={t('addDate.location')} value={batch.location || product?.shelfLocation || '—'} />
          {normal ? <LabelRow label={t('dateDetail.normalPrice')} value={displayMoney(normal)} /> : null}
          {batch.note ? <LabelRow label={t('addDate.note')} value={batch.note} /> : null}
        </View>

        {open ? (
          <>
            <AppButton label={t('dateDetail.checked')} onPress={() => run(() => recordEvent(batch.id, { kind: 'checked' }, today), t('dateDetail.checkedDone'))} disabled={busy} />
            <View style={s.actions}>
              <AppButton label={t('dateDetail.reduce')} onPress={() => openSheet('reduce')} variant="secondary" disabled={busy} />
              <AppButton label={t('dateDetail.sold')} onPress={() => openSheet('sold')} variant="secondary" disabled={busy} />
              <AppButton label={t('dateDetail.wasted')} onPress={() => openSheet('wasted')} variant="secondary" disabled={busy} />
              <AppButton label={t('dateDetail.otherRemoval')} onPress={() => openSheet('returned')} variant="secondary" disabled={busy} />
            </View>
          </>
        ) : null}

        <SettingsSection title={t('dateDetail.moreActions')}>
          {open ? <SettingsRow iconNode={<Ionicons name="create-outline" size={18} color={colors.primaryBlue} />} label={t('dateDetail.edit')} onPress={() => nav.navigate('AddDate', { batchId: batch.id })} /> : null}
          {product ? <SettingsRow iconNode={<Ionicons name="pricetags-outline" size={18} color={colors.primaryBlue} />} label={t('dateDetail.openProduct')} onPress={() => nav.navigate('ProductDetail', { id: product.id })} /> : null}
          {batch.events.length ? <SettingsRow iconNode={<Ionicons name="arrow-undo-outline" size={18} color={colors.primaryBlue} />} label={t('dateDetail.undo')} subtitle={eventLine(batch.events[batch.events.length - 1])} onPress={() => run(() => undoLastEvent(batch.id), t('dateDetail.undone'))} /> : null}
          <SettingsRow iconNode={<Ionicons name="trash-outline" size={18} color={colors.dangerRed} />} label={t('dateDetail.delete')} subtitle={t('dateDetail.deleteHint')} onPress={confirmDelete} isLast />
        </SettingsSection>

        <Text style={s.section}>{t('dateDetail.history')}</Text>
        <View style={s.card}>
          <LabelRow label={localDateShort(batch.createdAt)} value={t('dateDetail.added')} />
          {batch.events.map(e => <LabelRow key={e.id} label={localDateShort(e.on)} value={eventLine(e)} />)}
        </View>
      </AppKeyboardScrollView>

      <AppKeyboardBottomSheet visible={sheetOpen} onClose={() => setSheet(null)} title={sheet === 'reduce' ? t('dateDetail.reduceTitle') : sheet ? t(`dateDetail.removeTitle.${sheet}`) : ''} footer={(
        <View style={{ gap: spacing.sm }}>
          <AppButton label={t('common.save')} onPress={() => (sheet === 'reduce' ? confirmReduce() : sheet && confirmRemove(sheet))} />
          <AppButton label={t('common.cancel')} onPress={() => setSheet(null)} variant="secondary" />
        </View>
      )}>
        {sheet === 'reduce' ? (
          <View style={s.sheetBody}>
            {!currency ? <Text style={s.err}>{t('dateDetail.noCurrency')}</Text> : null}
            {normal ? (
              <>
                <Text style={s.hint}>{t('dateDetail.normalIs', { price: displayMoney(normal) })}</Text>
                <View style={s.chips}>{PERCENTS.map(p => <FilterChip key={p} label={t('dateDetail.percentOff', { percent: p })} active={false} onPress={() => { const m = reducedBy(normal, p); setPriceText(priceToInput(m)); }} />)}</View>
              </>
            ) : null}
            <Text style={s.label}>{t('dateDetail.newPrice', { currency: currency || '—' })}</Text>
            <AppTextInput style={s.input} value={priceText} onChangeText={setPriceText} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textFaint} testID="dd-price" />
            {pct != null ? <Text style={s.hint}>{t('dateDetail.percentPreview', { percent: pct })}</Text> : null}
            {sheetError ? <Text style={s.err}>{sheetError}</Text> : null}
          </View>
        ) : sheet ? (
          <View style={s.sheetBody}>
            {sheet !== 'sold' && sheet !== 'wasted' ? (
              <View style={s.chips}>{(['returned', 'donated'] as RemovalKind[]).map(k => <FilterChip key={k} label={t(`event.${k}`)} active={sheet === k} onPress={() => setSheet(k)} />)}</View>
            ) : null}
            <Text style={s.label}>{t('dateDetail.howMany')}</Text>
            <AppTextInput style={s.input} value={qtyText} onChangeText={setQtyText} keyboardType="number-pad" placeholder={t('dateDetail.allPh')} placeholderTextColor={colors.textFaint} testID="dd-qty" />
            <Text style={s.hint}>{left != null ? t('dateDetail.leftHint', { count: left }) : t('dateDetail.uncountedHint')}</Text>
            {sheet === 'wasted' ? (
              <>
                <Text style={s.label}>{t('dateDetail.reason')}</Text>
                <View style={s.chips}>{REASONS.map(r => <FilterChip key={r} label={t(`wasteReason.${r}`)} active={reason === r} onPress={() => setReason(r)} />)}</View>
              </>
            ) : null}
            {sheetError ? <Text style={s.err}>{sheetError}</Text> : null}
          </View>
        ) : null}
      </AppKeyboardBottomSheet>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  name: { ...typography.sectionTitle, color: colors.textDark },
  dateLine: { ...typography.body, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reduced: { ...typography.bodySm, fontSize: 11, fontWeight: '700', color: '#8A4B12', backgroundColor: '#FBEFE3', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  closed: { ...typography.bodySm, fontSize: 11, fontWeight: '700', color: colors.textMuted, backgroundColor: colors.inputMuted, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  advice: { ...typography.bodySm, color: colors.dangerRed, lineHeight: 18 },
  actions: { gap: 8 },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  sheetBody: { gap: spacing.sm },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  input: { ...typography.body, color: colors.textDark, borderBottomWidth: 1.5, borderBottomColor: colors.border, paddingVertical: 8, minHeight: 44 },
  hint: { ...typography.bodySm, color: colors.textMuted },
  err: { ...typography.bodySm, color: colors.dangerRed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
});
