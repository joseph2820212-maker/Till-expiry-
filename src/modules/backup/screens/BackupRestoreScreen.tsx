/**
 * E35 Backup & restore. Create: passphrase → encrypted file → share sheet. Restore: pick a file → header check
 * (wrong app / version / damaged file is refused here) → RestorePreview (E36), which asks for the passphrase.
 * Adapted from TillCalc's BackupScreen (`e7ea8caa` src/modules/backup/screens/BackupScreen.tsx).
 */
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { BackupPassphraseModal } from '../../../components/BackupPassphraseModal';
import { Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { getScope } from '../../../storage/scope';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { BackupError, checkBackupHeader, createBackup, loadLastBackupAt, readBackupFile } from '../backupFile';
import { clearRestoreSession, setRestoreSession } from '../restoreSession';

type Nav = NativeStackNavigationProp<TabStackParamList>;

/** Translated message for any backup failure. */
export function backupErrorText(t: (k: string, o?: Record<string, unknown>) => string, e: unknown): string {
  return e instanceof BackupError ? t(`backup.err.${e.code}`) : t('backup.err.unexpected');
}

const nextFrame = () => new Promise<void>(r => setTimeout(r, 30));

export const BackupRestoreScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const demo = getScope() === 'demo';

  useFocusEffect(useCallback(() => { loadLastBackupAt().then(setLastAt).catch(() => undefined); }, []));

  const doCreate = async (passphrase: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await nextFrame(); // let the spinner paint before the key derivation blocks the JS thread
      const r = await createBackup(passphrase);
      setCreateOpen(false);
      setLastAt(r.createdAt);
      const skipped = r.skipped.length ? `\n\n${t('backup.skippedRecords', { count: r.skipped.length })}` : '';
      const body = r.shared ? t('backup.createdShared', { file: r.fileName }) : t('backup.createdNotShared', { file: r.fileName });
      AppAlert.success(t('backup.createdTitle'), body + skipped);
    } catch (e) {
      setCreateOpen(false);
      AppAlert.error(backupErrorText(t, e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const pickFile = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPickError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const file = { uri: asset.uri, name: asset.name, size: asset.size ?? null };
      const header = checkBackupHeader(await readBackupFile(file));
      clearRestoreSession();
      setRestoreSession({ file, createdAt: header.createdAt, appVersion: header.appVersion });
      nav.navigate('RestorePreview');
    } catch (e) {
      setPickError(backupErrorText(t, e));
    } finally {
      inFlight.current = false;
    }
  };

  const lastLine = lastAt ? t('backup.lastBackup', { when: new Date(lastAt).toLocaleString() }) : t('backup.never');

  return (
    <View style={s.root}>
      <ScreenHeader title={t('backup.title')} subtitle={t('backup.subtitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {demo ? <Text style={s.demo} testID="backup-demo-notice">{t('backup.demoNotice')}</Text> : null}

        <Section title={t('backup.createSection')} hint={t('backup.createHint')}>
          <Text style={s.meta}>{lastLine}</Text>
          <AppButton label={t('backup.createNow')} onPress={() => setCreateOpen(true)} disabled={demo || busy} />
        </Section>

        <Section title={t('backup.restoreSection')} hint={t('backup.restoreHint')}>
          <AppButton label={t('backup.chooseFile')} onPress={pickFile} variant="outline" disabled={demo || busy} />
          {pickError ? <Text style={s.error} testID="backup-pick-error">{pickError}</Text> : null}
        </Section>

        <Text style={s.note}>{t('backup.notIncluded')}</Text>
      </AppKeyboardScrollView>

      <BackupPassphraseModal visible={createOpen} mode="create" busy={busy} onConfirm={doCreate} onCancel={() => { if (!busy) setCreateOpen(false); }} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  demo: { ...typography.bodySm, color: colors.textDark, backgroundColor: colors.softBlue, borderRadius: 12, padding: spacing.md, lineHeight: 18 },
  meta: { ...typography.bodySm, color: colors.textMuted, marginBottom: spacing.sm },
  error: { ...typography.bodySm, color: colors.dangerRed, marginTop: spacing.sm, lineHeight: 18 },
  note: { ...typography.bodySm, color: colors.textFaint, lineHeight: 18, textAlign: 'center' },
});
