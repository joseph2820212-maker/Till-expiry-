import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { ChoiceChips, Field, Hint, ErrorText } from '../../../components/forms/FormBits';
import { WASTE_REASONS, type Batch, type WasteReason } from '../../../domain/expiry/expiryTypes';
import { parseQuantity } from '../../../domain/quantity/quantity';
import { DomainError } from '../../../storage/repoHelpers';
import { newId } from '../../../storage/entityStore';
import { recordRemoval, BATCH_LIMITS, type RemovalType } from '../batchStore';
import { quantityLine } from '../format';

/**
 * Part of E24: record used / sold / wasted / returned. Quantity is optional: empty means "all that is left". One
 * requestId per open sheet, so a double tap records the removal once (T16).
 */
export const RemovalSheet: React.FC<{ batch: Batch; type: RemovalType | null; onClose: () => void; onDone: () => void }> = ({ batch, type, onClose, onDone }) => {
  const { t } = useTranslation();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<WasteReason | undefined>();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const requestId = useRef(newId('req'));
  const inFlight = useRef(false);

  useEffect(() => {
    if (type) { setQty(''); setReason(undefined); setNote(''); setError(undefined); requestId.current = newId('req'); }
  }, [type]);

  const save = async () => {
    if (!type || inFlight.current) return;
    let quantity: number | undefined;
    if (qty.trim()) {
      const q = parseQuantity(qty);
      if (q === null || q <= 0) { setError(t('errors.badQuantity')); return; }
      quantity = q;
    }
    if (type === 'wasted' && !reason) { setError(t('errors.reasonRequired')); return; }
    inFlight.current = true; setBusy(true);
    try {
      await recordRemoval(batch.workspaceId, batch.id, type, { quantity, reason, note: note.trim() || undefined, requestId: requestId.current });
      onDone();
    } catch (e) {
      const code = e instanceof DomainError ? e.code : 'saveFailed';
      if (e instanceof DomainError) setError(t(`errors.${code}`)); else AppAlert.error(t('errors.saveFailed'));
    } finally { inFlight.current = false; setBusy(false); }
  };

  const left = quantityLine(t, batch);
  return (
    <AppKeyboardBottomSheet visible={!!type} onClose={onClose} dismissOnBackdrop={!busy} title={type ? t(`removal.title.${type}`) : ''} footer={
      <View style={s.row}>
        <AppButton label={t('common.cancel')} variant="outline" onPress={onClose} disabled={busy} style={s.flex} />
        <AppButton label={t('common.save')} onPress={save} loading={busy} disabled={busy} style={s.flex} testID="removal-save" />
      </View>
    }>
      <View style={s.body}>
        <Field label={t('removal.quantity')} value={qty} onChangeText={v => { setQty(v); setError(undefined); }} keyboardType="decimal-pad" placeholder={batch.quantityRemaining !== undefined ? String(batch.quantityRemaining) : t('removal.all')} ltr testID="removal-qty" />
        <Hint text={left ? `${left} · ${t('removal.emptyMeansAll')}` : t('removal.uncountedHint')} />
        {type === 'wasted' ? (
          <ChoiceChips label={t('removal.reason')} options={WASTE_REASONS.map(r => ({ value: r, label: t(`wasteReason.${r}`) }))} value={reason} onChange={r => { setReason(r); setError(undefined); }} />
        ) : null}
        <Field label={t('removal.note')} value={note} onChangeText={setNote} maxLength={BATCH_LIMITS.reason} placeholder={t('common.optional')} />
        <ErrorText text={error} />
      </View>
    </AppKeyboardBottomSheet>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  body: { gap: 10 },
});
