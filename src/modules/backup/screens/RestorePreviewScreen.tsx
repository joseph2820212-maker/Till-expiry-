/**
 * E36 Restore preview. Passphrase → decrypted and validated file → counts per workspace → an explicit
 * "replaces all data on this phone" confirmation → restore. A failed restore shows whether the previous data was put
 * back (rolled back) or will be recovered on the next launch.
 * Flow adapted from Till Note's restore preview (`6fa6e941` src/modules/onboarding/screens/RestoreBackupScreen.tsx).
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { BackupPassphraseModal } from '../../../components/BackupPassphraseModal';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { EmptyState } from '../../../components/EmptyState';
import { Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { BackupError, parseBackup, readBackupFile, restoreParsed, type RestoreResult } from '../backupFile';
import type { WorkspaceCounts } from '../backupKeys';
import { clearRestoreSession, getRestoreSession, setParsedBackup } from '../restoreSession';
import { backupErrorText } from './BackupRestoreScreen';

type Nav = NativeStackNavigationProp<TabStackParamList>;
type Phase = 'locked' | 'preview' | 'restoring' | 'done' | 'failed';

const nextFrame = () => new Promise<void>(r => setTimeout(r, 30));
const COUNT_FIELDS = ['products', 'batches', 'events', 'rules', 'locations'] as const;

const WorkspaceCard: React.FC<{ w: WorkspaceCounts }> = ({ w }) => {
  const { t } = useTranslation();
  return (
    <View style={s.card} testID={`restore-ws-${w.id}`}>
      <Text style={s.cardTitle}>{w.name}{w.hidden ? `  ·  ${t('backup.preview.hidden')}` : ''}</Text>
      {COUNT_FIELDS.map(f => (
        <View key={f} style={s.countRow}>
          <Text style={s.countLabel}>{t(`backup.preview.${f}`)}</Text>
          <Text style={s.countValue}>{String(w[f])}</Text>
        </View>
      ))}
    </View>
  );
};

export const RestorePreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [session] = useState(() => getRestoreSession());
  const [phase, setPhase] = useState<Phase>(session?.parsed ? 'preview' : 'locked');
  const [pwOpen, setPwOpen] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | undefined>();
  const [understood, setUnderstood] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [parsed, setParsed] = useState(session?.parsed ?? null);
  const inFlight = useRef(false);

  const leave = () => { clearRestoreSession(); nav.goBack(); };

  if (!session) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t('backup.preview.title')} onBack={() => nav.goBack()} />
        <AppKeyboardScrollView contentContainerStyle={s.content}>
          <EmptyState icon="document-outline" title={t('backup.preview.noFileTitle')} body={t('backup.preview.noFileBody')} />
        </AppKeyboardScrollView>
      </View>
    );
  }

  const unlock = async (passphrase: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPwBusy(true);
    setPwError(undefined);
    try {
      await nextFrame();
      const p = parseBackup(await readBackupFile(session.file), passphrase);
      setParsedBackup(p);
      setParsed(p);
      setPwOpen(false);
      setPhase('preview');
    } catch (e) {
      if (e instanceof BackupError && e.code === 'wrongPassphrase') setPwError(t('backup.err.wrongPassphrase'));
      else { setPwOpen(false); setFailure(backupErrorText(t, e)); setPhase('failed'); }
    } finally {
      inFlight.current = false;
      setPwBusy(false);
    }
  };

  const runRestore = async () => {
    if (inFlight.current || !parsed) return;
    inFlight.current = true;
    setPhase('restoring');
    try {
      const r = await restoreParsed(parsed);
      clearRestoreSession();
      setResult(r);
      setPhase('done');
    } catch (e) {
      setFailure(backupErrorText(t, e));
      setPhase('failed');
    } finally {
      inFlight.current = false;
    }
  };

  const confirmRestore = () => {
    if (!understood || !parsed) return;
    AppAlert.alert(t('backup.preview.confirmTitle'), t('backup.preview.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backup.preview.replaceAction'), style: 'destructive', onPress: () => { runRestore(); } },
    ]);
  };

  const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(); };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('backup.preview.title')} onBack={phase === 'restoring' ? undefined : leave} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Section title={t('backup.preview.fileSection')}>
          <Text style={s.meta}>{session.file.name ?? ''}</Text>
          <Text style={s.meta}>{t('backup.preview.createdAt', { when: when(session.createdAt) })}</Text>
          <Text style={s.meta}>{t('backup.preview.appVersion', { version: session.appVersion })}</Text>
        </Section>

        {phase === 'locked' ? (
          <Section title={t('backup.preview.lockedTitle')} hint={t('backup.preview.lockedHint')}>
            <AppButton label={t('backup.preview.enterPassword')} onPress={() => { setPwError(undefined); setPwOpen(true); }} />
          </Section>
        ) : null}

        {(phase === 'preview' || phase === 'restoring') && parsed ? (
          <>
            <Text style={s.sectionLabel}>{t('backup.preview.contents')}</Text>
            {parsed.workspaces.map(w => <WorkspaceCard key={w.id} w={w} />)}
            <View style={s.warning} testID="restore-warning">
              <Text style={s.warningTitle}>{t('backup.preview.replaceTitle')}</Text>
              <Text style={s.warningBody}>{t('backup.preview.replaceBody')}</Text>
            </View>
            <CheckboxRow label={t('backup.preview.understand')} checked={understood} onToggle={() => setUnderstood(v => !v)} />
            <AppButton
              label={phase === 'restoring' ? t('backup.pw.restoring') : t('backup.preview.replaceAction')}
              onPress={confirmRestore}
              variant="danger"
              loading={phase === 'restoring'}
              disabled={!understood || phase === 'restoring'}
            />
            <AppButton label={t('common.cancel')} onPress={leave} variant="ghost" disabled={phase === 'restoring'} />
          </>
        ) : null}

        {phase === 'done' && result ? (
          <View style={s.okBox} testID="restore-done">
            <Text style={s.okTitle}>{t('backup.preview.doneTitle')}</Text>
            <Text style={s.okBody}>{t('backup.preview.doneBody', { count: result.workspaces.length })}</Text>
            {!result.remindersOk ? <Text style={s.errorText}>{t('backup.preview.remindersFailed')}</Text> : null}
            <AppButton label={t('common.done')} onPress={() => nav.popToTop()} />
          </View>
        ) : null}

        {phase === 'failed' ? (
          <View style={s.errBox} testID="restore-failed">
            <Text style={s.errTitle}>{t('backup.preview.failedTitle')}</Text>
            <Text style={s.errorText}>{failure}</Text>
            <AppButton label={t('common.back')} onPress={leave} variant="secondary" />
          </View>
        ) : null}
      </AppKeyboardScrollView>

      <BackupPassphraseModal visible={pwOpen} mode="enter" busy={pwBusy} error={pwError} onConfirm={unlock} onCancel={() => { if (!pwBusy) setPwOpen(false); }} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  meta: { ...typography.bodySm, color: colors.textMuted, marginBottom: 2 },
  sectionLabel: { ...typography.sectionLabel, color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.cardPadding, gap: 4 },
  cardTitle: { ...typography.cardTitle, color: colors.textDark, marginBottom: 4 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  countLabel: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  countValue: { ...typography.body, fontWeight: '700', color: colors.textDark },
  warning: { backgroundColor: colors.softRed, borderRadius: 12, padding: spacing.md, gap: 4 },
  warningTitle: { ...typography.cardTitle, color: colors.dangerRed },
  warningBody: { ...typography.bodySm, color: colors.textDark, lineHeight: 18 },
  okBox: { backgroundColor: colors.softGreen, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  okTitle: { ...typography.cardTitle, color: colors.textDark },
  okBody: { ...typography.bodySm, color: colors.textDark, lineHeight: 18 },
  errBox: { backgroundColor: colors.softRed, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  errTitle: { ...typography.cardTitle, color: colors.dangerRed },
  errorText: { ...typography.bodySm, color: colors.dangerRed, lineHeight: 18 },
});
