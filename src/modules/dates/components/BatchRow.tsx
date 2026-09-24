import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import type { DateBatch, Product } from '../../../domain/types';
import { bandFor, currentReduction, remainingQuantity, type Band } from '../../../domain/expiry';
import { daysBetween } from '../../../domain/dates';
import { localDateShort } from '../../../utils/locale';
import { displayMoney } from '../../../utils/displayMoney';

export const BAND_STYLE: Record<Band, { fg: string; bg: string }> = {
  expired: { fg: colors.dangerRed, bg: colors.softRed },
  today: { fg: '#9A4E0F', bg: '#FBEFE3' },
  soon: { fg: colors.primaryBlue, bg: colors.softBlue },
  later: { fg: colors.successGreen, bg: colors.softGreen },
};

/** "3 days ago" / "Today" / "Tomorrow" / "In 5 days", with the best-before wording for past best-before dates. */
export function daysLeftText(t: (k: string, o?: any) => string, batch: Pick<DateBatch, 'date' | 'dateType'>, today: string): string {
  const d = daysBetween(today, batch.date);
  if (d === 0) return t('dates.dueToday');
  if (d === 1) return t('dates.dueTomorrow');
  if (d > 1) return t('dates.dueIn', { count: d });
  const kind = batch.dateType === 'bestBefore' ? 'pastBestBefore' : 'expired';
  return d === -1 ? t(`dates.${kind}Yesterday`) : t(`dates.${kind}Ago`, { count: -d });
}

export const BandPill: React.FC<{ band: Band; text: string }> = ({ band, text }) => (
  <Text style={[s.pill, { color: BAND_STYLE[band].fg, backgroundColor: BAND_STYLE[band].bg }]} numberOfLines={1}>{text}</Text>
);

/** One date on the shelf: product, date, kind, how long is left, what is left, and a reduced badge. */
export const BatchRow: React.FC<{ batch: DateBatch; product?: Product; today: string; alertDays: number; onPress?: () => void; right?: React.ReactNode; testID?: string }> = ({ batch, product, today, alertDays, onPress, right, testID }) => {
  const { t } = useTranslation();
  const band = bandFor(batch.date, today, alertDays);
  const left = remainingQuantity(batch);
  const red = currentReduction(batch);
  const location = batch.location || product?.shelfLocation;
  const Body = (
    <View style={s.row}>
      <View style={[s.stripe, { backgroundColor: BAND_STYLE[band].fg }]} />
      <View style={s.text}>
        <Text style={s.name} numberOfLines={2}>{product?.name ?? batch.productName}</Text>
        <Text style={s.meta} numberOfLines={1}>{[`${t(`dateType.${batch.dateType}`)} ${localDateShort(batch.date)}`, location, left != null ? t('dates.left', { count: left }) : null].filter(Boolean).join(' · ')}</Text>
        <View style={s.badges}>
          <BandPill band={band} text={daysLeftText(t, batch, today)} />
          {red?.price ? <Text style={[s.pill, s.reduced]}>{t('dates.reducedTo', { price: displayMoney(red.price) })}</Text> : null}
          {batch.status === 'closed' ? <Text style={[s.pill, s.closed]}>{t('dates.closed')}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" testID={testID}>{Body}</TouchableOpacity> : <View testID={testID}>{Body}</View>;
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, overflow: 'hidden' },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  pill: { ...typography.bodySm, fontSize: 11, fontWeight: '700', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, overflow: 'hidden' },
  reduced: { color: '#8A4B12', backgroundColor: '#FBEFE3' },
  closed: { color: colors.textMuted, backgroundColor: colors.inputMuted },
});
