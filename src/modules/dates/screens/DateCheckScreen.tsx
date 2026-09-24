import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import type { DateBatch } from '../../../domain/types';
import { checkedToday, needsAttention } from '../../../domain/expiry';
import { useShelfData } from '../hooks/useShelfData';
import { BatchRow } from '../components/BatchRow';
import { checkMany, recordEvent } from '../storage/batchStore';
import { useTier } from '../../billing/useTier';
import { canUseFeature } from '../../billing/limits';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { shareCheckSheetPdf } from '../../reports/exports';
import { useExpirySettings } from '../../settings/settingsStore';

/**
 * The date check: walk the shelves with everything that is expired, due today or due soon. Each line is ticked as
 * still fine, sold out or thrown away in one tap; anything else (reduce, part of the stock) opens the date.
 */
export const DateCheckScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const tier = useTier();
  const settings = useExpirySettings();
  const { batches, products, byId, today, alertDaysOf, error, reload } = useShelfData('open');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(false);
  const inFlight = useRef(false);

  const list = useMemo(() => (batches ? needsAttention(batches, today, alertDaysOf) : []), [batches, today, alertDaysOf]);
  const done = list.filter(b => checkedToday(b, today)).length;
  const remaining = list.filter(b => !checkedToday(b, today));

  const act = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); reload(); }
    catch { AppAlert.error(t('addDate.errors.saveFailed')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const allFine = () => AppAlert.alert(t('check.allFineTitle'), t('check.allFineBody', { count: remaining.length }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('check.allFineAction'), onPress: () => act(() => checkMany(remaining.map(b => b.id), today)) },
  ]);

  const printSheet = async () => {
    if (!canUseFeature(tier, 'checkSheetPdf')) { setLimit(true); return; }
    if (!batches) return;
    // The sheet looks as far ahead as the longest warning window, so a product with its own window is on it too.
    const through = Math.max(settings.alertDays, ...products.map(p => p.alertDays ?? 0));
    try { if (!(await shareCheckSheetPdf(batches, products, through, settings.alertDays))) AppAlert.error(t('export.shareUnavailable')); }
    catch { AppAlert.error(t('export.failed')); }
  };

  const renderItem = ({ item }: { item: DateBatch }) => {
    const ticked = checkedToday(item, today);
    return (
      <View style={[s.item, ticked && s.itemDone]}>
        <BatchRow batch={item} product={byId.get(item.productId)} today={today} alertDays={alertDaysOf(item)} onPress={() => nav.navigate('DateDetail', { id: item.id })} testID={`check-${item.id}`} />
        {!ticked ? (
          <View style={s.quick}>
            <QuickButton icon="checkmark" label={t('check.fine')} onPress={() => act(() => recordEvent(item.id, { kind: 'checked' }, today))} disabled={busy} />
            <QuickButton icon="bag-check-outline" label={t('check.soldOut')} onPress={() => act(() => recordEvent(item.id, { kind: 'sold' }, today))} disabled={busy} />
            <QuickButton icon="trash-outline" label={t('check.binned')} danger onPress={() => act(() => recordEvent(item.id, { kind: 'wasted', reason: 'expired' }, today))} disabled={busy} />
          </View>
        ) : <Text style={s.tickedText}>{t('check.ticked')}</Text>}
      </View>
    );
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('check.title')} subtitle={list.length ? t('check.progress', { done, total: list.length }) : undefined} onBack={() => nav.goBack()} />
      {error ? (
        <View style={s.content}><EmptyState icon="alert-circle-outline" title={t('dates.loadErrorTitle')} body={t('dates.loadErrorBody')} /></View>
      ) : batches && list.length === 0 ? (
        <View style={s.content}>
          <EmptyState icon="checkmark-done-outline" title={t('check.emptyTitle')} body={t('check.emptyBody', { days: settings.alertDays })} testID="check-empty" />
          <AppButton label={t('check.printSheet')} onPress={printSheet} variant="secondary" style={s.gapTop} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={b => b.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListHeaderComponent={(
            <View style={s.head}>
              <Text style={s.intro}>{t('check.intro', { days: settings.alertDays })}</Text>
              {remaining.length ? <AppButton label={t('check.allFineAction')} onPress={allFine} variant="outline" disabled={busy} /> : <Text style={s.allDone}>{t('check.allDone')}</Text>}
              <AppButton label={t('check.printSheet')} onPress={printSheet} variant="secondary" />
            </View>
          )}
          initialNumToRender={15}
        />
      )}
      <FreeLimitSheet reason={limit ? 'proFeature' : null} onClose={() => setLimit(false)} />
    </View>
  );
};

const QuickButton: React.FC<{ icon: string; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }> = ({ icon, label, onPress, disabled, danger }) => (
  <TouchableOpacity style={[s.qb, danger && s.qbDanger]} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} activeOpacity={0.7}>
    <Ionicons name={icon as any} size={18} color={danger ? colors.dangerRed : colors.primaryBlue} />
    <Text style={[s.qbText, danger && s.qbTextDanger]} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding },
  gapTop: { marginTop: spacing.md },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  head: { gap: spacing.sm, marginBottom: spacing.md },
  intro: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  allDone: { ...typography.body, color: colors.successGreen, fontWeight: '700', textAlign: 'center' },
  item: { marginBottom: spacing.md, gap: 6 },
  itemDone: { opacity: 0.6 },
  quick: { flexDirection: 'row', gap: 6 },
  qb: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardWhite, paddingHorizontal: 4 },
  qbDanger: { borderColor: colors.softRed },
  qbText: { ...typography.bodySm, color: colors.primaryBlue, fontWeight: '700', flexShrink: 1 },
  qbTextDanger: { color: colors.dangerRed },
  tickedText: { ...typography.bodySm, color: colors.successGreen, fontWeight: '700', textAlign: 'center' },
});
