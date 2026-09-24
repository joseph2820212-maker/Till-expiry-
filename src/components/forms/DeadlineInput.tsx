/**
 * Entering a deadline with the right precision (§7.3, §26.4): a day (calendar), a month only (where the date kind
 * allows it, e.g. "best before end 09/2026"), or an exact date and time (opened / prepared cutoffs). The meaning of the
 * date is always shown above the field.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DateKind, DatePrecision, DeadlineValue } from '../../domain/expiry/expiryTypes';
import { allowsMonth } from '../../domain/expiry/expiryValidation';
import { isTime, localDateOf, localTimeOf, zonedIso } from '../../domain/expiry/datePrecision';
import { DatePickerField } from '../DatePickerField';
import { DropdownField } from '../DropdownField';
import { ChoiceChips, Field } from './FormBits';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { normalizeArabicNumerals } from '../../utils/locale';

/** Pack dates can be years ahead; nothing after this is a real date. */
export const FAR_FUTURE = '2199-12-31';

export function precisionsFor(kind: DateKind, allowTime: boolean): DatePrecision[] {
  if (kind === 'none') return [];
  const list: DatePrecision[] = ['date'];
  if (allowsMonth(kind)) list.push('month');
  if (allowTime) list.push('datetime');
  return list;
}

interface Props {
  kind: DateKind;
  value: DeadlineValue | undefined;
  onChange: (v: DeadlineValue | undefined) => void;
  tz: string;
  allowTime?: boolean;
  error?: string;
}

export const DeadlineInput: React.FC<Props> = ({ kind, value, onChange, tz, allowTime = false, error }) => {
  const { t } = useTranslation();
  const options = precisionsFor(kind, allowTime);
  const [precision, setPrecision] = useState<DatePrecision>(value?.precision ?? 'date');
  const [date, setDate] = useState(value?.precision === 'date' ? value.date : value?.precision === 'datetime' ? localDateOf(Date.parse(value.at), tz) : '');
  const [month, setMonth] = useState(value?.precision === 'month' ? value.month.slice(5) : '');
  const [year, setYear] = useState(value?.precision === 'month' ? value.month.slice(0, 4) : '');
  const [time, setTime] = useState(value?.precision === 'datetime' ? localTimeOf(Date.parse(value.at), tz) : '');
  const [timeError, setTimeError] = useState('');

  useEffect(() => { if (!options.includes(precision) && options.length) setPrecision(options[0]); }, [kind]);

  useEffect(() => {
    if (kind === 'none') { onChange(undefined); return; }
    if (precision === 'date') onChange(date ? { precision: 'date', date } : undefined);
    else if (precision === 'month') onChange(month && year ? { precision: 'month', month: `${year}-${month}` } : undefined);
    else {
      const tm = normalizeArabicNumerals(time.trim());
      if (tm && !isTime(tm)) { setTimeError(t('deadlineInput.timeInvalid')); onChange(undefined); return; }
      setTimeError('');
      onChange(date && tm ? { precision: 'datetime', at: zonedIso(date, tm, tz) } : undefined);
    }
  }, [precision, date, month, year, time, kind]);

  if (kind === 'none') return <Text style={s.none}>{t('deadlineInput.noneHint')}</Text>;

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 16 }, (_, i) => String(thisYear - 2 + i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const monthNames = t('common.monthsFull', { returnObjects: true }) as unknown as string[];

  return (
    <View style={s.wrap}>
      <Text style={s.meaning}>{t(`dateKindHelp.${kind}`)}</Text>
      {options.length > 1 ? (
        <ChoiceChips options={options.map(p => ({ value: p, label: t(`precision.${p}`) }))} value={precision} onChange={setPrecision} />
      ) : null}
      {precision === 'month' ? (
        <View style={s.row}>
          <View style={s.half}><DropdownField label={t('deadlineInput.month')} value={month} options={months} getLabel={m => monthNames[Number(m) - 1] ?? m} onSelect={setMonth} placeholder={t('deadlineInput.choose')} /></View>
          <View style={s.half}><DropdownField label={t('deadlineInput.year')} value={year} options={years} onSelect={setYear} placeholder={t('deadlineInput.choose')} /></View>
        </View>
      ) : (
        <DatePickerField label={t('deadlineInput.date')} value={date} onChange={setDate} maxDate={FAR_FUTURE} placeholder={t('deadlineInput.choose')} />
      )}
      {precision === 'datetime' ? (
        <Field label={t('deadlineInput.time')} value={time} onChangeText={setTime} placeholder="14:00" keyboardType="default" maxLength={5} error={timeError || undefined} hint={t('deadlineInput.timeHint', { zone: tz })} ltr testID="deadline-time" />
      ) : null}
      {precision === 'month' ? <Text style={s.hint}>{t('deadlineInput.monthHint')}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: 8 },
  meaning: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  none: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  hint: { ...typography.bodySm, color: colors.textMuted },
  error: { ...typography.bodySm, color: colors.dangerRed },
});
