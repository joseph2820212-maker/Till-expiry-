import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { BackupPassphraseModal } from '../../../components/BackupPassphraseModal';
import { LabelRow } from '../../../components/LabelRow';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { APP_VERSION } from '../../../appMeta';
import { initCurrency } from '../../../utils/currency';
import { loadSettings } from '../../settings/settingsStore';
import { syncReminders } from '../../reminders/reminderService';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import { checkStorageIntegrity, createBackup, inspectBackup, loadLastBackupAt, restoreBackup, RestoreError, type BackupInspection } from '../backupFile';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Pending = { uri: string; name: string; inspection: BackupInspection };

/** Backup & restore: encrypted file out via the share sheet, file in via the document picker. */
export const BackupScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [enterOpen, setEnterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<string | undefined>();
  const [pending, setPending] = useState<Pending | null>(null);
  useFocusEffect(useCallback(() => { loadLastBackupAt().then(setLastAt); }, []));

  const counts = (c: Record<string, number>) => [['products', c.products], ['openDates', c.openDates], ['history', c.history]] as [string, number | undefined][];

  const doCreate = async (passphrase: string) => {
    setBusy(true);
    try {
      const r = await createBackup(passphrase, APP_VERSION);
      setCreateOpen(false);
      setLastAt(new Date().toISOString());
      AppAlert.success(t('backup.createdTitle'), t('backup.createdBody', { file: r.fileName }));
    } catch { AppAlert.error(t('backup.createFailed')); }
    finally { setBusy(false); }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const inspection = await inspectBackup(asset.uri);
      setPending({ uri: asset.uri, name: asset.name, inspection });
    } catch (e) {
      AppAlert.error(t(`backup.errors.${e instanceof RestoreError ? e.code : 'read'}`));
    }
  };

  const confirmRestore = () => {
    if (!pending) return;
    AppAlert.alert(t('backup.restoreTitle'), t('backup.restoreConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('backup.restoreAction'), style: 'destructive', onPress: () => { if (pending.inspection.encrypted) { setPwError(undefined); setEnterOpen(true); } else doRestore(undefined); } },
    ]);
  };

  const doRestore = async (passphrase?: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await restoreBackup(pending.uri, passphrase);
      setEnterOpen(false); setPending(null);
      // Refresh in-memory caches that were primed at startup.
      await initCurrency();
      await loadSettings();
      // Reminders are device-only: plan them again from the restored dates.
      await syncReminders();
      AppAlert.success(t('backup.restoredTitle'), t('backup.restoredBody', { keys: r.restoredKeys }), [{ text: t('common.ok'), onPress: () => nav.navigate('Tabs', tabTarget('Home')) }]);
    } catch (e) {
      const code = e instanceof RestoreError ? e.code : 'read';
      if (code === 'wrong-passphrase') setPwError(t('backup.errors.wrong-passphrase'));
      else { setEnterOpen(false); AppAlert.error(t(`backup.errors.${code}`)); }
    } finally { setBusy(false); }
  };

  const checkData = async () => {
    const r = await checkStorageIntegrity();
    if (r.ok) AppAlert.success(t('backup.checkOkTitle'), t('backup.checkOkBody', { count: r.totalRecords }));
    else AppAlert.alert(t('backup.checkIssuesTitle'), t('backup.checkIssuesBody', { count: r.parseErrors }));
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('settings.backupRestore')} subtitle={t('backup.subtitle')} onBack={() => nav.goBack()} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <SettingsSection title={t('backup.createSection')} footer={t('backup.createFooter')}>
          <SettingsRow icon="↑" label={t('backup.createNow')} subtitle={lastAt ? t('backup.lastBackup', { when: new Date(lastAt).toLocaleString() }) : t('backup.never')} onPress={() => setCreateOpen(true)} isLast />
        </SettingsSection>

        <SettingsSection title={t('backup.restoreSection')} footer={t('backup.restoreFooter')}>
          <SettingsRow icon="↓" label={t('backup.chooseFile')} subtitle={pending ? pending.name : t('backup.chooseFileHint')} onPress={pickFile} isLast={!pending} />
          {pending ? (
            <View style={s.preview}>
              <Text style={s.previewTitle}>{t('backup.previewTitle')}</Text>
              <LabelRow label={t('common.date')} value={pending.inspection.createdAt ? new Date(pending.inspection.createdAt).toLocaleString() : '—'} />
              <LabelRow label={t('common.version')} value={pending.inspection.appVersion ?? '—'} />
              <LabelRow label={t('backup.encrypted')} value={pending.inspection.encrypted ? t('common.yes') : t('common.no')} />
              {counts(pending.inspection.entityCounts).map(([k, v]) => <LabelRow key={k} label={t(`backup.counts.${k}`)} value={v == null ? '—' : String(v)} />)}
              <AppButton label={t('backup.restoreAction')} onPress={confirmRestore} variant="danger" style={{ marginTop: spacing.sm }} />
              <AppButton label={t('common.cancel')} onPress={() => setPending(null)} variant="ghost" />
            </View>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('backup.toolsSection')}>
          <SettingsRow icon="✓" label={t('settings.checkRepairData')} subtitle={t('backup.checkHint')} onPress={checkData} isLast />
        </SettingsSection>
        <Text style={s.note}>{t('settings.backupSecureNote')}</Text>
      </ScrollView>

      <BackupPassphraseModal visible={createOpen} mode="create" busy={busy} onConfirm={doCreate} onCancel={() => { if (!busy) setCreateOpen(false); }} />
      <BackupPassphraseModal visible={enterOpen} mode="enter" busy={busy} error={pwError} onConfirm={doRestore} onCancel={() => { if (!busy) setEnterOpen(false); }} />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  preview: { padding: 14, paddingTop: 6, gap: 2, borderTopWidth: 1, borderTopColor: colors.rule2 },
  previewTitle: { ...typography.sectionLabel, color: colors.textMuted, marginBottom: 4 },
  note: { ...typography.bodySm, color: colors.textFaint, lineHeight: 17, textAlign: 'center' },
});
