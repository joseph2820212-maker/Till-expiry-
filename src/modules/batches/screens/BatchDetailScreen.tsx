import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { StatusChip } from '../../../components/status/StatusChip';
import { Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { useGeneralSettings } from '../../settings/settingsStore';
import { evaluateBatch, evaluateDeadline, priceActionAllowed } from '../../../domain/expiry/statusEngine';
import { localDateShort } from '../../../utils/locale';
import { localDateOf, localTimeOf } from '../../../domain/expiry/datePrecision';
import { newId } from '../../../storage/entityStore';
import { getBatch, setBatchArchived, REMOVAL_TYPES, type RemovalType } from '../batchStore';
import { getProduct } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { deadlineLine, kindLabel, moneyText, quantityValue, reasonLine } from '../format';
import { RemovalSheet } from '../components/RemovalSheet';
import { MarkdownHelperSheet } from '../../markdown/MarkdownHelperSheet';
import { snoozeBatchReminder } from '../../reminders/reminderService';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<TabStackParamList>;

const REMOVAL_ICON: Record<RemovalType, string> = { used: 'checkmark-circle-outline', sold: 'cart-outline', wasted: 'trash-outline', returned: 'return-down-back-outline' };

/**
 * E12 + E24 — one dated batch: what controls its deadline and why, the original date kept visible, the rule it was
 * calculated from (as it was when applied), and every action. Past a hard deadline no price action is ever offered.
 */
export const BatchDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'BatchDetail'>>();
  const settings = useGeneralSettings();
  const { data, error, reload } = useWorkspaceData(async ws => {
    const batch = await getBatch(ws.id, params.id);
    if (!batch) return { batch: null } as const;
    const [product, locations] = await Promise.all([getProduct(ws.id, batch.productId), listLocations(ws.id, { includeHidden: true })]);
    return { batch, product, location: locations.find(l => l.id === batch.locationId) } as const;
  });
  const [removal, setRemoval] = useState<RemovalType | null>(null);
  const [markdown, setMarkdown] = useState(false);
  const inFlight = useRef(false);

  if (error) return <Shell title={t('batch.title')} onBack={() => nav.goBack()}><EmptyState icon="alert-circle-outline" title={t('errors.loadFailed')} body={t('batch.loadFailedBody')} /><AppButton label={t('common.retry')} onPress={reload} /></Shell>;
  if (!data) return <Shell title={t('batch.title')} onBack={() => nav.goBack()}>{null}</Shell>;
  if (!data.batch) return <Shell title={t('batch.title')} onBack={() => nav.goBack()}><EmptyState icon="help-circle-outline" title={t('batch.notFound')} body={t('batch.notFoundBody')} /></Shell>;

  const { batch, product, location } = data;
  const now = Date.now();
  const ev = evaluateBatch(batch, now, settings);
  const active = batch.status === 'active';
  const canPrice = priceActionAllowed(batch, now, settings) && !!product?.sellingPrice;
  const zone = batch.timeZone;
  const when = (iso?: string) => (iso ? `${localDateShort(localDateOf(Date.parse(iso), zone))}, ${localTimeOf(Date.parse(iso), zone)}` : null);

  const archive = async (archived: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await setBatchArchived(batch.workspaceId, batch.id, archived, newId('req')); reload(); }
    catch { AppAlert.error(t('errors.saveFailed')); }
    finally { inFlight.current = false; }
  };
  /** T09: silencing a reminder never touches the deadline or the status shown here. */
  const snooze = async () => {
    try {
      await snoozeBatchReminder(batch.id, new Date(Date.now() + 24 * 3600000).toISOString());
      AppAlert.success(t('batch.snoozed'), t('batch.snoozedBody'));
    } catch { AppAlert.error(t('errors.saveFailed')); }
  };
  const confirmArchive = () => AppAlert.alert(t('batch.archiveTitle'), t('batch.archiveBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('batch.archive'), style: 'destructive', onPress: () => { void archive(true); } },
  ]);

  return (
    <Shell title={batch.productName} subtitle={kindLabel(t, batch)} onBack={() => nav.goBack()}>
      <View style={s.hero} testID="batch-hero">
        <Text style={s.deadline}>{deadlineLine(t, batch.effective, zone)}</Text>
        <StatusChip evaluation={ev} kind={batch.effective.dateKind} testID="batch-status" />
        <Text style={s.reason}>{reasonLine(t, batch.effective)}</Text>
        {batch.secondary ? (
          <View style={s.secondary}>
            <Text style={s.secondaryText}>{deadlineLine(t, batch.secondary, zone)}</Text>
            <StatusChip evaluation={evaluateDeadline(batch.secondary, zone, now, settings)} kind={batch.secondary.dateKind} />
            <Text style={s.small}>{reasonLine(t, batch.secondary)}</Text>
          </View>
        ) : null}
        {!active ? <Text style={s.closed}>{t(`batch.state.${batch.status}`)}</Text> : null}
      </View>

      <Section title={t('batch.details')}>
        <Row label={t('batch.product')} value={product?.name ?? batch.productName} onPress={() => nav.navigate('ProductDetail', { id: batch.productId })} />
        <Row label={t('batch.quantity')} value={quantityValue(t, batch) ?? t('batch.notCounted')} />
        <Row label={t('batch.lot')} value={batch.lotNumber ?? t('common.notSet')} ltr />
        <Row label={t('batch.location')} value={location?.name ?? t('common.notSet')} />
        {batch.openedAt ? <Row label={t('batch.openedAt')} value={when(batch.openedAt) ?? ''} ltr /> : null}
        {batch.preparedAt ? <Row label={t('batch.preparedAt')} value={when(batch.preparedAt) ?? ''} ltr /> : null}
        {batch.receivedAt ? <Row label={t('batch.addedAt')} value={when(batch.receivedAt) ?? ''} ltr /> : null}
        {product?.costPerTrackingUnit ? <Row label={t('batch.cost')} value={moneyText(product.costPerTrackingUnit)} ltr /> : null}
        {batch.parentBatchId ? <Row label={t('batch.openedFrom')} value={t('batch.viewParent')} onPress={() => nav.push('BatchDetail', { id: batch.parentBatchId as string })} /> : null}
        {batch.notes ? <Row label={t('batch.notes')} value={batch.notes} /> : null}
      </Section>

      {batch.appliedRule ? (
        <Section title={t('batch.rule')} hint={t('batch.ruleSnapshotHint')}>
          <Row label={t('batch.ruleName')} value={t('batch.ruleVersion', { name: batch.appliedRule.ruleName, version: batch.appliedRule.ruleVersion })} />
          {batch.appliedRule.sourceText ? <Row label={t('batch.ruleSource')} value={batch.appliedRule.sourceText} /> : null}
          {batch.appliedRule.storageInstruction ? <Row label={t('batch.ruleStorage')} value={batch.appliedRule.storageInstruction} /> : null}
        </Section>
      ) : null}

      {active ? (
        <Section title={t('batch.actions')} testID="batch-actions">
          <View style={s.grid}>
            {REMOVAL_TYPES.map(type => (
              <TouchableOpacity key={type} style={s.tile} onPress={() => setRemoval(type)} accessibilityRole="button" accessibilityLabel={t(`removal.action.${type}`)} testID={`action-${type}`}>
                <Ionicons name={REMOVAL_ICON[type] as any} size={20} color={type === 'wasted' ? colors.dangerRed : colors.primaryBlue} />
                <Text style={s.tileText}>{t(`removal.action.${type}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {batch.kind !== 'opened' && batch.kind !== 'prepared' ? <AppButton label={t('batch.openSome')} icon="open-outline" variant="outline" onPress={() => nav.navigate('AddOpened', { parentBatchId: batch.id, productId: batch.productId })} testID="action-open" /> : null}
          <AppButton label={t('batch.move')} icon="swap-horizontal-outline" variant="outline" onPress={() => nav.navigate('MoveLocation', { id: batch.id })} />
          <AppButton label={t('batch.correct')} icon="create-outline" variant="outline" onPress={() => nav.navigate('DeadlineCorrection', { id: batch.id })} />
          {batch.kind === 'opened' || batch.kind === 'prepared' ? <AppButton label={t('batch.printLabel')} icon="print-outline" variant="outline" onPress={() => nav.navigate('InternalLabelPreview', { batchIds: [batch.id] })} /> : null}
          {canPrice ? <AppButton label={t('batch.markdown')} icon="pricetag-outline" variant="outline" onPress={() => setMarkdown(true)} testID="action-markdown" /> : null}
        </Section>
      ) : null}

      {active ? <AppButton label={t('batch.snooze')} icon="notifications-off-outline" variant="ghost" onPress={() => { void snooze(); }} /> : null}
      <AppButton label={t('batch.history')} icon="time-outline" variant="ghost" onPress={() => nav.navigate('BatchHistory', { id: batch.id })} />
      {active ? <AppButton label={t('batch.archive')} variant="dangerLink" onPress={confirmArchive} /> : null}
      {batch.status === 'archived' ? <AppButton label={t('batch.restore')} variant="outline" onPress={() => { void archive(false); }} /> : null}

      <RemovalSheet batch={batch} type={removal} onClose={() => setRemoval(null)} onDone={() => { setRemoval(null); reload(); }} />
      {canPrice ? <MarkdownHelperSheet batch={batch} visible={markdown} onClose={() => setMarkdown(false)} /> : null}
    </Shell>
  );
};

const Shell: React.FC<{ title: string; subtitle?: string; onBack: () => void; children: React.ReactNode }> = ({ title, subtitle, onBack, children }) => (
  <View style={s.root}>
    <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} />
    <AppKeyboardScrollView contentContainerStyle={s.content}>{children}</AppKeyboardScrollView>
  </View>
);

const Row: React.FC<{ label: string; value: string; onPress?: () => void; ltr?: boolean }> = ({ label, value, onPress }) => {
  const body = (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, onPress ? s.link : null]}>{value}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}>{body}</TouchableOpacity> : body;
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  hero: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6 },
  deadline: { ...typography.sectionTitle, color: colors.textDark },
  reason: { ...typography.bodySm, color: colors.textMuted },
  secondary: { borderTopWidth: 1, borderTopColor: colors.rule2, paddingTop: 8, marginTop: 4, gap: 4 },
  secondaryText: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  small: { ...typography.bodySm, color: colors.textMuted },
  closed: { ...typography.body, color: colors.dangerRed, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.rule2, minHeight: 40 },
  rowLabel: { ...typography.bodySm, color: colors.textMuted, flexShrink: 0, maxWidth: '45%' },
  rowValue: { ...typography.body, color: colors.textDark, flex: 1, textAlign: 'right' },
  link: { color: colors.primaryBlue, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  tileText: { ...typography.body, color: colors.textDark, fontWeight: '600', flexShrink: 1 },
});
