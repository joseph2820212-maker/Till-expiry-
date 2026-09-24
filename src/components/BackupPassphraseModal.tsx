import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppTextInput } from './AppTextInput';
import { AppKeyboardBottomSheet } from './AppKeyboardBottomSheet';
import { AppButton } from './AppButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

export const BACKUP_PASSPHRASE_MIN = 8;

interface Props {
  visible: boolean;
  mode: 'create' | 'enter';
  busy?: boolean;
  error?: string;
  onConfirm: (passphrase: string) => void;
  onCancel: () => void;
}

/** Ported from Till Note. create = set + confirm with the no-recovery warning; enter = type to decrypt. */
export const BackupPassphraseModal: React.FC<Props> = ({ visible, mode, busy, error, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localErr, setLocalErr] = useState('');
  const [show, setShow] = useState(false);
  useEffect(() => { if (visible) { setValue(''); setConfirm(''); setLocalErr(''); setShow(false); } }, [visible]);
  useEffect(() => { if (error) { setValue(''); setConfirm(''); } }, [error]);

  const handleConfirm = () => {
    if (mode === 'create') {
      if (value.length < BACKUP_PASSPHRASE_MIN) { setLocalErr(t('backup.pw.tooShort', { min: BACKUP_PASSPHRASE_MIN })); return; }
      if (value !== confirm) { setLocalErr(t('backup.pw.mismatch')); return; }
    } else if (!value) return;
    setLocalErr('');
    onConfirm(value);
  };
  const shownErr = localErr || error;
  const eye = (
    <TouchableOpacity style={s.eye} onPress={() => setShow(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={show ? t('common.hide') : t('common.show')}>
      <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
  return (
    <AppKeyboardBottomSheet visible={visible} onClose={onCancel} dismissOnBackdrop={!busy} title={mode === 'create' ? t('backup.pw.createTitle') : t('backup.pw.enterTitle')} maxHeightPct="82%" footer={(
      <View style={{ gap: spacing.sm }}>
        <AppButton label={busy ? t('common.pleaseWait') : t('common.continue')} onPress={handleConfirm} disabled={busy} />
        <AppButton label={t('common.cancel')} onPress={onCancel} variant="secondary" disabled={busy} />
      </View>
    )}>
      {mode === 'create' ? <Text style={s.warning}>{t('backup.pw.warning')}</Text> : null}
      <Text style={s.label}>{t('backup.pw.label')}</Text>
      <View style={s.inputRow}>
        <AppTextInput style={s.input} value={value} onChangeText={setValue} placeholder={t('backup.pw.placeholder')} placeholderTextColor={colors.textFaint} secureTextEntry={!show} editable={!busy} autoFocus autoCapitalize="none" autoCorrect={false} returnKeyType={mode === 'enter' ? 'done' : 'next'} onSubmitEditing={mode === 'enter' ? handleConfirm : undefined} testID="backup-pw" />
        {eye}
      </View>
      {mode === 'create' ? <Text style={s.hint}>{t('backup.pw.minHint', { min: BACKUP_PASSPHRASE_MIN })}</Text> : null}
      {mode === 'create' ? (
        <>
          <Text style={s.label}>{t('backup.pw.confirmLabel')}</Text>
          <View style={s.inputRow}>
            <AppTextInput style={s.input} value={confirm} onChangeText={setConfirm} placeholder={t('backup.pw.placeholder')} placeholderTextColor={colors.textFaint} secureTextEntry={!show} editable={!busy} autoCapitalize="none" autoCorrect={false} returnKeyType="done" onSubmitEditing={handleConfirm} testID="backup-pw-confirm" />
            {eye}
          </View>
        </>
      ) : null}
      {shownErr ? <Text style={s.error}>{shownErr}</Text> : null}
      {busy ? <View style={s.busy}><ActivityIndicator color={colors.primaryBlue} /><Text style={s.busyText}>{mode === 'create' ? t('backup.pw.creating') : t('backup.pw.restoring')}</Text></View> : null}
    </AppKeyboardBottomSheet>
  );
};

const s = StyleSheet.create({
  warning: { ...typography.bodySm, color: colors.warningOrange, backgroundColor: colors.softRed, borderRadius: 10, padding: 10, marginBottom: spacing.md, lineHeight: 17 },
  label: { ...typography.sectionLabel, color: colors.textMuted, marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, marginBottom: spacing.md, paddingEnd: 4 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, ...typography.inputText, color: colors.textDark },
  hint: { ...typography.micro, color: colors.textFaint, marginTop: -8, marginBottom: spacing.md },
  eye: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { ...typography.bodySm, color: colors.dangerRed, marginBottom: 10 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inputMuted, borderRadius: 12, padding: 12, marginTop: 4 },
  busyText: { ...typography.bodySm, fontWeight: '700', color: colors.textDark, flex: 1 },
});
