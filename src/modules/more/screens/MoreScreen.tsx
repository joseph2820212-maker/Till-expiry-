import React, { useRef, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { WorkspaceHeader } from '../../../components/WorkspaceHeader';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { AppAlert } from '../../../components/AppAlert';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { APP_NAME, APP_VERSION } from '../../../appMeta';
import { openSupportMail } from './AboutScreen';
import { useActiveWorkspace } from '../../workspaces/workspaceStore';
import { enterDemo, exitDemo, isDemo, resetDemo } from '../../demo/demoMode';
import { useScope } from '../../../storage/scope';

const icon = (name: string, color: string = colors.primaryBlue) => <Ionicons name={name as any} size={18} color={color} />;

/** E37 — settings hub (Till Note SettingsSection / SettingsRow pattern). Review build: every feature is unlocked, no billing. */
export const MoreScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const ws = useActiveWorkspace();
  useScope();
  const demo = isDemo();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); } catch { AppAlert.error(t('demo.failed')); } finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <View style={s.root}>
      <WorkspaceHeader title={t('nav.more')} onSearch={() => nav.navigate('GlobalSearch')} />
      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
        <SettingsSection title={t('more.businessGroup')}>
          <SettingsRow iconNode={icon('business-outline')} label={t('more.thisBusiness')} subtitle={ws ? `${ws.name} · ${t(`mode.${ws.mode}`)}` : undefined} onPress={() => ws && nav.navigate('WorkspaceSettings', { id: ws.id })} />
          <SettingsRow iconNode={icon('layers-outline')} label={t('more.workspaces')} subtitle={t('more.workspacesSub')} onPress={() => nav.navigate('Workspaces')} />
          <SettingsRow iconNode={icon('location-outline')} label={t('more.locations')} subtitle={t('more.locationsSub')} onPress={() => nav.navigate('LocationsList')} />
          <SettingsRow iconNode={icon('timer-outline')} label={t('more.rules')} subtitle={t('more.rulesSub')} onPress={() => nav.navigate('RulesList')} isLast />
        </SettingsSection>

        <SettingsSection title={t('more.appGroup')}>
          <SettingsRow iconNode={icon('notifications-outline')} label={t('more.reminders')} subtitle={t('more.remindersSub')} onPress={() => nav.navigate('ReminderSettings')} />
          <SettingsRow iconNode={icon('options-outline')} label={t('more.general')} subtitle={t('more.generalSub')} onPress={() => nav.navigate('GeneralSettings')} />
          <SettingsRow iconNode={icon('language-outline')} label={t('settings.language')} subtitle={t('settings.languageValue')} onPress={() => nav.navigate('SettingsLanguage')} isLast />
        </SettingsSection>

        <SettingsSection title={t('more.dataGroup')} footer={t('more.dataFooter')}>
          <SettingsRow iconNode={icon('cloud-upload-outline')} label={t('more.backup')} subtitle={t('more.backupSub')} onPress={() => nav.navigate('BackupRestore')} />
          <SettingsRow iconNode={icon('document-attach-outline')} label={t('more.importProducts')} onPress={() => nav.navigate('CsvImport', { kind: 'products' })} />
          <SettingsRow iconNode={icon('document-attach-outline')} label={t('more.importBatches')} onPress={() => nav.navigate('CsvImport', { kind: 'batches' })} />
          <SettingsRow iconNode={icon('download-outline')} label={t('more.export')} subtitle={t('more.exportSub')} onPress={() => nav.navigate('DataExport')} isLast />
        </SettingsSection>

        <SettingsSection title={t('demo.group')} footer={t(demo ? 'demo.footerOn' : 'demo.footerOff')}>
          {demo ? (
            <>
              <SettingsRow iconNode={icon('exit-outline')} label={t('demo.exit')} onPress={busy ? undefined : () => { void run(exitDemo); }} />
              <SettingsRow iconNode={icon('refresh-outline', colors.dangerRed)} label={t('demo.reset')} onPress={busy ? undefined : () => AppAlert.alert(t('demo.resetTitle'), t('demo.resetBody'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('demo.reset'), style: 'destructive', onPress: () => { void run(resetDemo); } },
              ])} isLast />
            </>
          ) : (
            <SettingsRow iconNode={icon('play-circle-outline')} label={t('demo.enter')} subtitle={t('demo.enterSub')} onPress={busy ? undefined : () => { void run(enterDemo); }} isLast />
          )}
        </SettingsSection>

        <SettingsSection title={t('settings.supportLegal')}>
          <SettingsRow iconNode={icon('book-outline')} label={t('help.tabGuide')} subtitle={t('help.guideIntro')} onPress={() => nav.navigate('SettingsHelp', { tab: 'guide' })} />
          <SettingsRow iconNode={icon('chatbubble-ellipses-outline')} label={t('help.tabFaq')} subtitle={t('help.faqIntro')} onPress={() => nav.navigate('SettingsHelp', { tab: 'faq' })} />
          <SettingsRow iconNode={icon('mail-outline')} label={t('settings.contactSupport')} onPress={() => openSupportMail(t)} />
          <SettingsRow iconNode={icon('shield-checkmark-outline')} label={t('settings.offlinePrivate')} onPress={() => nav.navigate('SettingsOfflinePrivate')} />
          <SettingsRow iconNode={icon('lock-closed-outline')} label={t('settings.privacyPolicy')} onPress={() => nav.navigate('SettingsLegal', { doc: 'privacy' })} />
          <SettingsRow iconNode={icon('document-text-outline')} label={t('settings.termsOfUse')} onPress={() => nav.navigate('SettingsLegal', { doc: 'terms' })} />
          <SettingsRow iconNode={icon('save-outline')} label={t('settings.dataStorageNotice')} onPress={() => nav.navigate('SettingsLegal', { doc: 'dataStorage' })} />
          <SettingsRow iconNode={icon('code-slash-outline')} label={t('settings.openSourceLicenses')} onPress={() => nav.navigate('SettingsLegal', { doc: 'licences' })} />
          <SettingsRow iconNode={icon('information-circle-outline')} label={t('settings.aboutApp', { app: APP_NAME })} subtitle={`v${APP_VERSION} · ${t('about.reviewBuild')}`} onPress={() => nav.navigate('SettingsAbout')} isLast />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
});
