import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { DeadlineInput } from '../../../components/forms/DeadlineInput';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { DATE_KINDS, type Batch, type DateKind, type DeadlineValue } from '../../../domain/expiry/expiryTypes';
import { validateDeadline } from '../../../domain/expiry/expiryValidation';
import { ownDeadline } from '../../../domain/expiry/deadlineEngine';
import { parseQuantity } from '../../../domain/quantity/quantity';
import { DomainError } from '../../../storage/repoHelpers';
import { newId } from '../../../storage/entityStore';
import { BATCH_LIMITS, correctDeadline, correctQuantity, getBatch } from '../batchStore';
import { deadlineLine, quantityLine } from '../format';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/**
 * E25 — correct a wrong date (or what is left) with a reason. The correction is a new history event with the old and
 * new values; nothing is overwritten silently (§7 append-only history, T25).
 */
export const DeadlineCorrectionScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'DeadlineCorrection'>>();
  const { data: batch } = useWorkspaceData(ws => getBatch(ws.id, params.id));
  return (
    <View style={s.root}>
      <ScreenHeader title={t('correct.title')} subtitle={batch?.productName} onBack={() => nav.goBack()} />
      {batch ? <CorrectionForm batch={batch} onDone={() => nav.goBack()} onParent={id => nav.push('DeadlineCorrection', { id })} /> : null}
    </View>
  );
};

const CorrectionForm: React.FC<{ batch: Batch; onDone: () => void; onParent: (id: string) => void }> = ({ batch, onDone, onParent }) => {
  const { t } = useTranslation();
  /** An opened child corrects its OWN after-opening date; the original pack's date belongs to the parent (EXP-REV-01). */
  const childOfPack = batch.kind === 'opened' && !!batch.parentBatchId;
  const [kind, setKind] = useState<DateKind>(childOfPack ? batch.dateKind : batch.effective.dateKind);
  const [deadline, setDeadline] = useState<DeadlineValue | undefined>(childOfPack ? ownDeadline(batch) : batch.effective.deadline);
  const [reason, setReason] = useState('');
  const [qty, setQty] = useState('');
  const [qtyReason, setQtyReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [qtyError, setQtyError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef(newId('req'));
  const qtyRequestId = useRef(newId('req'));
  useEffect(() => setError(undefined), [kind, deadline, reason]);

  const run = async (fn: () => Promise<unknown>, setErr: (e: string) => void) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); onDone(); }
    catch (e) { if (e instanceof DomainError) setErr(t(`errors.${e.code}`)); else AppAlert.error(t('errors.saveFailed')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const saveDeadline = () => {
    const err = validateDeadline(kind, deadline);
    if (err) { setError(t(`errors.deadline_${err}`)); return; }
    if (!reason.trim()) { setError(t('errors.reasonRequired')); return; }
    void run(() => correctDeadline(batch.workspaceId, batch.id, kind, kind === 'none' ? undefined : deadline, reason, requestId.current), setError);
  };
  const saveQuantity = () => {
    const q = parseQuantity(qty);
    if (q === null) { setQtyError(t('errors.badQuantity')); return; }
    if (!qtyReason.trim()) { setQtyError(t('errors.reasonRequired')); return; }
    void run(() => correctQuantity(batch.workspaceId, batch.id, q, qtyReason, qtyRequestId.current), setQtyError);
  };

  const allowTime = batch.kind === 'opened' || batch.kind === 'prepared' || batch.effective.deadline?.precision === 'datetime';
  return (
    <AppKeyboardScrollView contentContainerStyle={s.content}>
      <Section title={t('correct.dateTitle')} hint={t('correct.current', { value: deadlineLine(t, batch.effective, batch.timeZone) })}>
        <ChoiceChips label={t('correct.kind')} options={DATE_KINDS.map(k => ({ value: k, label: t(`dateKind.${k}`) }))} value={kind} onChange={setKind} />
        <Hint text={t(`dateKindHelp.${kind}`)} />
        {childOfPack ? (
          <>
            <Hint text={t('correct.childHint')} />
            <AppButton label={t('correct.parentDate')} variant="ghost" onPress={() => onParent(batch.parentBatchId as string)} testID="correct-parent" />
          </>
        ) : null}
        {kind !== 'none' ? <DeadlineInput kind={kind} value={deadline} onChange={setDeadline} tz={batch.timeZone} allowTime={allowTime} /> : null}
        <Field label={t('correct.reason')} value={reason} onChangeText={setReason} maxLength={BATCH_LIMITS.reason} placeholder={t('correct.reasonPh')} testID="correct-reason" />
        <ErrorText text={error} />
        <AppButton label={t('correct.saveDate')} onPress={saveDeadline} loading={busy} disabled={busy} testID="correct-save" />
      </Section>
      <Section title={t('correct.qtyTitle')} hint={quantityLine(t, batch) ?? t('batch.notCounted')}>
        <Field label={t('correct.qtyNow')} value={qty} onChangeText={v => { setQty(v); setQtyError(undefined); }} keyboardType="decimal-pad" ltr />
        <Field label={t('correct.reason')} value={qtyReason} onChangeText={v => { setQtyReason(v); setQtyError(undefined); }} maxLength={BATCH_LIMITS.reason} placeholder={t('correct.qtyReasonPh')} />
        <ErrorText text={qtyError} />
        <AppButton label={t('correct.saveQty')} variant="outline" onPress={saveQuantity} loading={busy} disabled={busy} />
      </Section>
    </AppKeyboardScrollView>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
