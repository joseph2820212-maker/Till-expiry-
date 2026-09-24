import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { DropdownField } from '../../../components/DropdownField';
import { FilterChip } from '../../../components/FilterChip';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { LabelRow } from '../../../components/LabelRow';
import { FreeLimitSheet } from '../../billing/FreeLimitSheet';
import { useTier } from '../../billing/useTier';
import { remainingCapacity } from '../../billing/limits';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { DATE_TYPES, type DateType, type Product } from '../../../domain/types';
import type { DateOrder } from '../../../domain/dates';
import { base64ToBytes, decodeText } from '../../../utils/base64';
import { detectDelimiter, parseCsv } from '../../products/utils/csvParse';
import { countProductsForLimit, listProducts } from '../../products/storage/productStore';
import { commitImport, guessMapping, IMPORT_FIELDS, ImportChangedError, MAX_FILE_BYTES, MAX_IMPORT_ROWS, planImport, type ImportField } from '../csvImport';
import { useExpirySettings } from '../../settings/settingsStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;
const ORDERS: DateOrder[] = ['dmy', 'mdy', 'ymd'];

interface FileState { name: string; rows: string[][]; encoding: 'utf-8' | 'windows-1252' }

/**
 * Import products and dates from a CSV file: pick → check the columns and the date order → preview → import.
 * Nothing is written until "Import"; then every valid row is written in one go, or nothing is.
 */
export const ImportScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const tier = useTier();
  const settings = useExpirySettings();
  const [file, setFile] = useState<FileState | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [order, setOrder] = useState<DateOrder | null>(null);
  const [defaultType, setDefaultType] = useState<DateType>(settings.defaultDateType);
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const inFlight = useRef(false);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const info = await FileSystem.getInfoAsync(asset.uri);
      const size = (info as { size?: number }).size ?? asset.size ?? 0;
      if (size > MAX_FILE_BYTES) { AppAlert.error(t('importer.errors.tooLarge')); return; }
      const bytes = base64ToBytes(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) { AppAlert.error(t('importer.errors.spreadsheet')); return; }
      const { text, encoding } = decodeText(bytes);
      const rows = parseCsv(text, detectDelimiter(text));
      if (rows.length < 1) { AppAlert.error(t('importer.errors.empty')); return; }
      setProducts(await listProducts({ includeArchived: true }));
      setFile({ name: asset.name, rows, encoding });
      setMapping(guessMapping(rows[0]));
      setHasHeader(true);
      setOrder(null);
    } catch {
      AppAlert.error(t('importer.errors.read'));
    }
  };

  const columns = file ? Math.max(...file.rows.slice(0, 20).map(r => r.length)) : 0;
  const header = file?.rows[0] ?? [];
  const sample = file?.rows[hasHeader ? 1 : 0] ?? [];
  const hasDate = mapping.includes('date');
  const ready = !!file && (mapping.includes('name') || mapping.includes('barcode')) && (!hasDate || order !== null);
  const plan = useMemo(() => (file && ready ? planImport(file.rows, mapping, hasHeader, order ?? 'ymd', products, defaultType) : null), [file, ready, mapping, hasHeader, order, products, defaultType]);
  const problems = plan?.rows.filter(r => r.problem).slice(0, 5) ?? [];

  const setColumn = (i: number, f: ImportField) => setMapping(m => {
    const next = [...m];
    while (next.length < columns) next.push('ignore');
    // A field is used by one column only: the column that had it is set to "ignore".
    if (f !== 'ignore') for (let j = 0; j < next.length; j++) if (next[j] === f) next[j] = 'ignore';
    next[i] = f;
    return next;
  });

  const run = async () => {
    if (!plan || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (plan.counts.newProducts > remainingCapacity(tier, 'products', await countProductsForLimit())) { setLimitOpen(true); return; }
      const r = await commitImport(plan);
      AppAlert.success(t('importer.doneTitle'), t('importer.doneBody', { products: r.products, dates: r.dates }), [{ text: t('common.ok'), onPress: () => nav.goBack() }]);
      setFile(null);
    } catch (e) {
      if (e instanceof ImportChangedError) { AppAlert.error(t('importer.errors.changed')); setProducts(await listProducts({ includeArchived: true })); }
      else AppAlert.error(t('importer.errors.commit'));
    } finally { setBusy(false); inFlight.current = false; }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('importer.title')} subtitle={file?.name ?? t('importer.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content}>
        {!file ? (
          <View style={s.card}>
            <Text style={s.body1}>{t('importer.intro')}</Text>
            <Text style={s.hint}>{t('importer.columnsHint')}</Text>
            <Text style={s.hint}>{t('importer.limits', { rows: MAX_IMPORT_ROWS })}</Text>
          </View>
        ) : (
          <>
            {file.encoding === 'windows-1252' ? <Text style={s.note}>{t('importer.encodingNote')}</Text> : null}
            <View style={s.card}>
              <Text style={s.label}>{t('importer.columns')}</Text>
              <CheckboxRow label={t('importer.hasHeader')} checked={hasHeader} onToggle={() => setHasHeader(h => !h)} />
              {Array.from({ length: columns }, (_, i) => (
                <DropdownField
                  key={i}
                  label={`${hasHeader ? header[i] || t('importer.columnN', { n: i + 1 }) : t('importer.columnN', { n: i + 1 })}${sample[i] ? ` — ${sample[i]}` : ''}`}
                  value={mapping[i] ?? 'ignore'}
                  options={[...IMPORT_FIELDS]}
                  getLabel={v => t(`importer.field.${v}`)}
                  onSelect={v => setColumn(i, v as ImportField)}
                />
              ))}
              {!mapping.includes('name') && !mapping.includes('barcode') ? <Text style={s.err}>{t('importer.needNameOrBarcode')}</Text> : null}
            </View>

            {hasDate ? (
              <View style={s.card}>
                <Text style={s.label}>{t('importer.dateOrder')}</Text>
                <Text style={s.hint}>{t('importer.dateOrderHint')}</Text>
                <View style={s.chips}>{ORDERS.map(o => <FilterChip key={o} label={t(`importer.order.${o}`)} active={order === o} onPress={() => setOrder(o)} />)}</View>
                {order === null ? <Text style={s.err}>{t('importer.chooseOrder')}</Text> : null}
                <Text style={[s.label, s.gapTop]}>{t('importer.defaultType')}</Text>
                <View style={s.chips}>{DATE_TYPES.map(k => <FilterChip key={k} label={t(`dateType.${k}`)} active={defaultType === k} onPress={() => setDefaultType(k)} />)}</View>
              </View>
            ) : null}

            {plan ? (
              <View style={s.card}>
                <Text style={s.label}>{t('importer.preview')}</Text>
                <LabelRow label={t('importer.count.newProducts')} value={String(plan.counts.newProducts)} />
                <LabelRow label={t('importer.count.matchedProducts')} value={String(plan.counts.matchedProducts)} />
                <LabelRow label={t('importer.count.dates')} value={String(plan.counts.dates)} />
                <LabelRow label={t('importer.count.invalid')} value={String(plan.counts.invalid)} tone={plan.counts.invalid ? 'danger' : 'default'} />
                {plan.counts.ambiguousDates ? <Text style={s.warn}>{t('importer.ambiguous', { count: plan.counts.ambiguousDates })}</Text> : null}
                {plan.counts.overLimit ? <Text style={s.warn}>{t('importer.overLimit', { count: plan.counts.overLimit, rows: MAX_IMPORT_ROWS })}</Text> : null}
                {problems.map(r => <Text key={r.line} style={s.hint}>{t('importer.problemLine', { line: r.line, problem: t(`importer.problem.${r.problem}`) })}</Text>)}
              </View>
            ) : null}

            <AppButton label={t('importer.run')} onPress={run} loading={busy} disabled={!plan || busy || (plan.counts.newProducts === 0 && plan.counts.dates === 0)} />
          </>
        )}
        <AppButton label={file ? t('importer.pickOther') : t('importer.pick')} onPress={pick} variant={file ? 'secondary' : 'primary'} disabled={busy} />
      </AppKeyboardScrollView>
      <FreeLimitSheet reason={limitOpen ? 'products' : null} onClose={() => setLimitOpen(false)} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  body1: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  note: { ...typography.bodySm, color: colors.textMuted, backgroundColor: colors.softBlue, borderRadius: 12, padding: 10 },
  warn: { ...typography.bodySm, color: '#9A4E0F' },
  err: { ...typography.bodySm, color: colors.dangerRed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
});
