/**
 * Blocking screen shown by App.tsx while a restore is unsettled — at start-up (EXP-REV-04) or right after a restore
 * that ended unconfirmed / with a failed rollback (P1-REOPEN-02). It has no Back button and replaces the whole
 * navigator, so there is no way into normal screens until Retry settles the journal.
 * Business data is not loaded or shown; nothing here clears or overwrites the restore journal. Retry runs the startup
 * recovery again. Plain React Native views: it renders before navigation and the safe-area providers are mounted.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/colors';
import type { RecoveryBlockReason } from './startupRecovery';

export const RecoveryRequiredScreen: React.FC<{ reason: RecoveryBlockReason; onRetry: () => void; busy?: boolean }> = ({ reason, onRetry, busy }) => {
  const { t } = useTranslation();
  return (
    <View style={s.root} testID="recovery-required">
      <Text style={s.title}>{t('recovery.title')}</Text>
      <Text style={s.body}>{t(reason === 'journalUnreadable' ? 'recovery.bodyUnreadable' : reason === 'restoreUnconfirmed' ? 'recovery.bodyUnconfirmed' : 'recovery.body')}</Text>
      <Text style={s.body}>{t('recovery.dataHidden')}</Text>
      <TouchableOpacity style={[s.btn, busy ? s.busy : null]} onPress={onRetry} disabled={busy} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: !!busy }} testID="recovery-retry">
        <Text style={s.btnText}>{t('recovery.retry')}</Text>
      </TouchableOpacity>
      <Text style={s.hint}>{t('recovery.hint')}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textDark, marginBottom: 12, textAlign: 'center' },
  body: { fontSize: 14, color: colors.textDark, textAlign: 'center', marginBottom: 12, lineHeight: 20 },
  btn: { backgroundColor: colors.primaryBlue, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, marginTop: 12 },
  busy: { opacity: 0.5 },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
