/**
 * Shared pieces of the Add flows and editors: product picker sheet, location field, time fields, reminder preview,
 * scanner hand-off and error wording. No deadline maths lives here.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { DeadlineInfo, ExpiryRule, Product, StorageLocation } from '../../../domain/expiry/expiryTypes';
import { splitDuration } from '../../../domain/expiry/ruleEngine';
import { isoInZone } from '../../../domain/expiry/datePrecision';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../../components/AppButton';
import { DropdownField } from '../../../components/DropdownField';
import { DatePickerField } from '../../../components/DatePickerField';
import { Field } from '../../../components/forms/FormBits';
import { FAR_FUTURE } from '../../../components/forms/DeadlineInput';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { foldText, DomainError } from '../../../storage/repoHelpers';
import { productSearchText } from '../../products/productStore';
import { takePendingScan, type ScanTarget } from '../../products/utils/scanBus';
import { formatDeadlineValue } from '../../batches/format';
import { localDateShort } from '../../../utils/locale';
import type { ReminderSettings } from '../../settings/settingsStore';
import { reminderPreview, type ReminderLine } from '../addForms';

type T = (k: string, o?: Record<string, unknown>) => string;

/** Words for a thrown error: a DomainError code (errors.<code>) or the generic "could not save". */
export function errorMessage(t: T, e: unknown): string {
  if (e instanceof DomainError || (e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string')) {
    return t(`errors.${(e as { code: string }).code}`);
  }
  return t('errors.saveFailed');
}

/** "3 days · Hard cutoff" — a rule's duration and class. */
export function ruleSummary(t: T, r: Pick<ExpiryRule, 'durationMinutes' | 'class'>): string {
  const d = r.durationMinutes != null ? splitDuration(r.durationMinutes) : null;
  const dur = d ? t(`rules.duration.${d.unit}`, { count: d.value }) : t('rules.noDuration');
  return `${dur} · ${t(`rules.class.${r.class}`)}`;
}

/** Read a code the scanner handed back (purpose 'attach') whenever this screen regains focus. */
export function useScanResult(target: ScanTarget, onCode: (code: string, symbology: string) => void): void {
  useFocusEffect(useCallback(() => {
    const p = takePendingScan(target);
    if (p) onCode(p.code, p.symbology);
  }, [target, onCode]));
}

const MAX_ROWS = 60;

export function filterProducts(products: Product[], query: string): Product[] {
  const q = foldText(query.trim());
  const list = q ? products.filter(p => productSearchText(p).includes(q)) : products;
  return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_ROWS);
}

/** Search existing products; optionally offer "create new product <typed name>". */
export const ProductPickerSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  products: Product[];
  onPick: (p: Product) => void;
  onCreate?: (name: string) => void;
  title?: string;
}> = ({ visible, onClose, products, onPick, onCreate, title }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const rows = useMemo(() => filterProducts(products, query), [products, query]);
  const close = () => { setQuery(''); onClose(); };
  return (
    <AppKeyboardBottomSheet visible={visible} onClose={close} title={title ?? t('add.product.choose')} footer={<AppButton label={t('common.cancel')} onPress={close} variant="secondary" />}>
      <Field label={t('common.search')} value={query} onChangeText={setQuery} placeholder={t('add.product.searchPh')} testID="product-search" />
      <View style={s.list}>
        {onCreate ? (
          <TouchableOpacity style={s.row} onPress={() => { onCreate(query.trim()); setQuery(''); }} accessibilityRole="button" testID="product-create">
            <Text style={s.create}>{query.trim() ? t('add.product.createNamed', { name: query.trim() }) : t('add.product.createNew')}</Text>
          </TouchableOpacity>
        ) : null}
        {rows.map(p => (
          <TouchableOpacity key={p.id} style={s.row} onPress={() => { setQuery(''); onPick(p); }} accessibilityRole="button" testID={`product-row-${p.id}`}>
            <Text style={s.name}>{p.name}</Text>
            {p.barcodes[0] || p.sku ? <Text style={s.meta}>{[p.sku, p.barcodes[0]?.code].filter(Boolean).join(' · ')}</Text> : null}
          </TouchableOpacity>
        ))}
        {!rows.length ? <Text style={s.meta}>{t('add.product.noMatch')}</Text> : null}
      </View>
    </AppKeyboardBottomSheet>
  );
};

export const NO_LOCATION = '__none';

export const LocationField: React.FC<{ locations: StorageLocation[]; value?: string; onChange: (id: string | undefined) => void; label?: string }> = ({ locations, value, onChange, label }) => {
  const { t } = useTranslation();
  const byId = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  return (
    <DropdownField
      label={label ?? t('add.location')}
      value={value && byId.has(value) ? value : NO_LOCATION}
      options={[NO_LOCATION, ...locations.map(l => l.id)]}
      getLabel={id => (id === NO_LOCATION ? t('add.noLocation') : byId.get(id)?.name ?? id)}
      onSelect={id => onChange(id === NO_LOCATION ? undefined : id)}
    />
  );
};

/** Date + HH:MM (workspace zone) with a "Now" shortcut. */
export const TimeFields: React.FC<{ label: string; date: string; time: string; onDate: (d: string) => void; onTime: (t: string) => void; onNow: () => void; tz: string; error?: string }> = ({ label, date, time, onDate, onTime, onNow, tz, error }) => {
  const { t } = useTranslation();
  return (
    <View style={{ gap: spacing.sm }}>
      <DatePickerField label={label} value={date} onChange={onDate} maxDate={FAR_FUTURE} />
      <Field label={t('add.time')} value={time} onChangeText={onTime} placeholder="14:00" maxLength={5} hint={t('add.timeHint', { zone: tz })} error={error} ltr testID="time-field" />
      <AppButton label={t('add.setNow')} onPress={onNow} variant="outline" />
    </View>
  );
};

export function reminderLineText(t: T, line: ReminderLine, tz: string): string {
  switch (line.kind) {
    case 'none': return t('add.reminder.none');
    case 'past': return t('add.reminder.past');
    case 'off': return t('add.reminder.off');
    case 'advance': return t('add.reminder.advance', { date: localDateShort(line.date), days: line.days });
    case 'sameDay': return t('add.reminder.sameDay', { date: localDateShort(line.date) });
    case 'exact': return t('add.reminder.exact', { time: formatDeadlineValue({ precision: 'datetime', at: isoInZone(line.at, tz) }, tz), minutes: line.minutes });
    case 'summary': return t('add.reminder.summary', { time: `${String(line.hour).padStart(2, '0')}:${String(line.minute).padStart(2, '0')}` });
  }
}

/** "You will be reminded…" — plain text from the current reminder settings. */
export const ReminderPreview: React.FC<{ info: DeadlineInfo; tz: string; settings: ReminderSettings }> = ({ info, tz, settings }) => {
  const { t } = useTranslation();
  const lines = reminderPreview(info, tz, settings);
  return (
    <View style={{ gap: 2 }} testID="reminder-preview">
      {lines.map((l, i) => <Text key={i} style={s.meta}>{reminderLineText(t, l, tz)}</Text>)}
      <Text style={s.faint}>{t('add.reminder.note')}</Text>
    </View>
  );
};

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  list: { gap: 2, marginTop: spacing.sm },
  row: { paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(217,205,180,0.45)', minHeight: 48, justifyContent: 'center' },
  name: { ...typography.body, fontWeight: '600', color: colors.textDark },
  create: { ...typography.body, fontWeight: '700', color: colors.primaryBlue },
  meta: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  faint: { ...typography.bodySm, color: colors.textFaint, lineHeight: 18 },
  strong: { ...typography.body, fontWeight: '700', color: colors.textDark },
  title: { ...typography.cardTitle, color: colors.textDark },
  error: { ...typography.bodySm, color: colors.dangerRed },
  selected: { backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.primaryBlue, padding: 12, gap: 4 },
  gap: { gap: spacing.sm },
  success: { backgroundColor: colors.softGreen, borderRadius: 14, padding: 14, gap: 6 },
});
