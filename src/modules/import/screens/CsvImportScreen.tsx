/**
 * E32 CsvImport — steps 1–3 of §19.3: pick a CSV file, decode it safely, check / change the column mapping and the
 * file's conventions (date order, decimal mark, the kind of date for rows without one). Nothing is written here; the
 * preview (E33) shows exactly what would happen and asks for confirmation.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { DropdownField } from '../../../components/DropdownField';
import { Section, ChoiceChips, ErrorText, Hint } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { DATE_KINDS, type DateKind } from '../../../domain/expiry/expiryTypes';
import type { DateOrder } from '../../../domain/dates';
import { base64ToBytes } from '../../../utils/base64';
import { useActiveWorkspace } from '../../workspaces/workspaceStore';
import {
  decodeCsvBytes, defaultImportOptions, fieldsFor, IMPORT_LIMITS, mappingProblems, MONEY_FIELDS, setColumnField,
  type DecodedCsv, type ImportField, type ImportOptions,
} from '../csvImport';
import { setImportSession } from '../importSession';

type Nav = NativeStackNavigationProp<TabStackParamList>;
const ORDERS: DateOrder[] = ['dmy', 'mdy', 'ymd'];

export const CsvImportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'CsvImport'>>();
  const kind = params?.kind === 'batches' ? 'batches' : 'products';
  const workspace = useActiveWorkspace();
  const [csv, setCsv] = useState<DecodedCsv | null>(null);
  const [opts, setOpts] = useState<ImportOptions | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const pick = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFileError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      if ((asset.size ?? 0) > IMPORT_LIMITS.fileBytes) { setFileError(t('import.decode.tooLarge')); return; }
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = decodeCsvBytes(base64ToBytes(b64), asset.name || 'import.csv');
      if (!r.ok) { setFileError(t(`import.decode.${r.error}`, { rows: IMPORT_LIMITS.rows, columns: IMPORT_LIMITS.columns })); setCsv(null); setOpts(null); return; }
      setCsv(r.csv);
      setOpts(defaultImportOptions(kind, r.csv));
    } catch {
      setFileError(t('import.decode.readFailed'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const patch = (p: Partial<ImportOptions>) => setOpts(o => (o ? { ...o, ...p } : o));
  const problems = useMemo(() => (opts ? mappingProblems(kind, opts.mapping) : []), [kind, opts]);
  const usesMoney = !!opts?.mapping.some(f => MONEY_FIELDS.includes(f));
  const noCurrency = usesMoney && !workspace?.currency;
  const needsKind = kind === 'batches' && !!opts && !opts.mapping.includes('date_kind');
  const sample = csv?.rows[0] ?? [];

  const next = () => {
    if (!csv || !opts || !workspace || problems.length) return;
    setImportSession({ kind, workspaceId: workspace.id, csv, options: opts });
    nav.navigate('CsvImportPreview', { kind });
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t(`import.title.${kind}`)} subtitle={csv?.fileName ?? t('import.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content}>
        <Section title={t('import.stepFile')}>
          <Text style={s.text}>{t(`import.intro.${kind}`)}</Text>
          <Hint text={t(`import.columnsHint.${kind}`)} />
          <Hint text={t('import.limits', { rows: IMPORT_LIMITS.rows, mb: Math.round(IMPORT_LIMITS.fileBytes / 1024 / 1024) })} />
          <ErrorText text={fileError} />
          {csv ? <Text style={s.meta}>{t('import.fileInfo', { rows: csv.rows.length, columns: csv.columnCount })}</Text> : null}
          {csv?.encoding === 'windows-1252' ? <Text style={s.note}>{t('import.encodingNote')}</Text> : null}
          <AppButton label={csv ? t('import.pickOther') : t('import.pick')} onPress={pick} variant={csv ? 'secondary' : 'primary'} loading={busy} disabled={busy} />
        </Section>

        {csv && opts ? (
          <>
            <Section title={t('import.stepColumns')} hint={t('import.columnsHelp')}>
              {csv.header.map((h, i) => (
                <DropdownField
                  key={i}
                  label={`${h || t('import.columnN', { n: i + 1 })}${sample[i] ? ` — ${sample[i]}` : ''}`}
                  value={opts.mapping[i] ?? 'ignore'}
                  options={[...fieldsFor(kind)]}
                  getLabel={v => t(`import.field.${v}`)}
                  onSelect={v => patch({ mapping: setColumnField(opts.mapping, i, v as ImportField) })}
                />
              ))}
              {problems.map(p => <ErrorText key={p} text={t(`import.blocker.${p}`)} />)}
            </Section>

            {kind === 'batches' ? (
              <Section title={t('import.stepDates')}>
                <ChoiceChips
                  label={t('import.dateOrder')}
                  options={ORDERS.map(o => ({ value: o, label: t(`import.order.${o}`) }))}
                  value={opts.dateOrder}
                  onChange={v => patch({ dateOrder: v })}
                />
                <Hint text={t('import.dateOrderHint')} />
                <ChoiceChips<DateKind>
                  label={t(needsKind ? 'import.defaultKindRequired' : 'import.defaultKind')}
                  options={DATE_KINDS.map(k => ({ value: k, label: t(`dateKind.${k}`) }))}
                  value={opts.defaultDateKind ?? undefined}
                  onChange={v => patch({ defaultDateKind: v })}
                />
                <Hint text={t('import.defaultKindHint')} />
                {needsKind && !opts.defaultDateKind ? <ErrorText text={t('import.defaultKindMissing')} /> : null}
              </Section>
            ) : null}

            {usesMoney ? (
              <Section title={t('import.stepMoney')}>
                {noCurrency ? <ErrorText text={t('import.blocker.moneyNoCurrency')} /> : (
                  <>
                    <Hint text={t('import.moneyCurrency', { currency: workspace?.currency ?? '' })} />
                    <ChoiceChips<'.' | ','>
                      label={t('import.decimalMark')}
                      options={[{ value: '.', label: t('import.decimal.dot') }, { value: ',', label: t('import.decimal.comma') }]}
                      value={opts.decimal}
                      onChange={v => patch({ decimal: v })}
                    />
                    <Hint text={t('import.decimalHint')} />
                  </>
                )}
              </Section>
            ) : null}

            <Section title={t('import.stepDuplicates')}>
              {kind === 'products' ? (
                <ChoiceChips<'skip' | 'update'>
                  label={t('import.onExisting')}
                  options={[{ value: 'skip', label: t('import.existing.skip') }, { value: 'update', label: t('import.existing.update') }]}
                  value={opts.onExisting}
                  onChange={v => patch({ onExisting: v })}
                />
              ) : (
                <>
                  <ChoiceChips<'skip' | 'import'>
                    label={t('import.onDuplicate')}
                    options={[{ value: 'skip', label: t('import.duplicate.skip') }, { value: 'import', label: t('import.duplicate.import') }]}
                    value={opts.onDuplicate}
                    onChange={v => patch({ onDuplicate: v })}
                  />
                  <Hint text={t('import.neverMerged')} />
                </>
              )}
            </Section>

            <AppButton label={t('import.toPreview')} onPress={next} disabled={!!problems.length || !workspace} />
          </>
        ) : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  text: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  meta: { ...typography.bodySm, color: colors.textDark, fontWeight: '700' },
  note: { ...typography.bodySm, color: colors.textMuted, backgroundColor: colors.softBlue, borderRadius: 12, padding: 10 },
});
