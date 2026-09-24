import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar, Linking, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { AppAlert } from '../../../components/AppAlert';
import { AppButton } from '../../../components/AppButton';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { APP_NAME, APP_VERSION, PUBLISHER, EMAILS } from '../../../appMeta';
import { OSS_COUNT } from '../content/openSourceLicenses';
import { legalVars } from '../content/legalContent';
import type { RootStackParamList } from '../../../navigation/AppNavigator';

function InfoRow({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={18} color={colors.primaryBlue} style={styles.infoIcon} />
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        {sub ? <Text style={styles.infoSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

type TFn = (k: string, o?: Record<string, unknown>) => string;

/** Prefilled support email body (app version + platform, as Till Note asks for), never any business figure. */
export function supportMailBody(t: TFn): string {
  const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  return t('legal.contact.mailBody', { app: APP_NAME, version: APP_VERSION, platform, osVersion: String(Platform.Version ?? '') });
}

export function supportMailUrl(t: TFn): string {
  const subject = encodeURIComponent(`${APP_NAME} ${APP_VERSION}`);
  return `mailto:${EMAILS.support}?subject=${subject}&body=${encodeURIComponent(supportMailBody(t))}`;
}

export async function openSupportMail(t: TFn): Promise<void> {
  const url = supportMailUrl(t);
  try { if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; } } catch { /* fall through */ }
  AppAlert.alert(t('settings.contactSupport'), t('settings.emailFallbackMsg', { email: EMAILS.support }));
}

export const AboutScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const vars = legalVars(t);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('settings.aboutApp', { app: APP_NAME })} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <View style={styles.logoCard}>
          <Text style={styles.appName}>{APP_NAME}</Text>
          <Text style={styles.tagline}>{t('settings.appTagline')}</Text>
          <Text style={styles.description}>{t('about.description', vars)}</Text>
          <Text style={styles.version}>v{APP_VERSION} · {t('about.publisherLine', { publisher: PUBLISHER })}</Text>
        </View>

        <Text style={styles.section}>{t('settings.dataPrivacyModel')}</Text>
        <View style={styles.card}>
          <InfoRow icon="cloud-offline-outline" label={t('settings.offlineFirst')} sub={t('settings.offlineFirstSub')} />
          <InfoRow icon="phone-portrait-outline" label={t('settings.dataOnDevice')} sub={t('settings.dataOnDeviceSub')} />
          <InfoRow icon="person-outline" label={t('settings.noAccountRequired')} sub={t('settings.noAccountRequiredSub')} />
          <InfoRow icon="eye-off-outline" label={t('about.noAnalytics')} sub={t('about.noAnalyticsSub')} />
        </View>

        <Text style={styles.section}>{t('legal.contact.title')}</Text>
        <View style={styles.card}>
          <View style={styles.contactBody}>
            <Text style={styles.contactText}>{t('legal.contact.body', vars)}</Text>
            <Text style={styles.contactNever}>{t('legal.contact.never')}</Text>
            <Text style={styles.contactText}>{t('legal.contact.security', vars)}</Text>
            <AppButton label={t('legal.contact.emailButton')} onPress={() => openSupportMail(t)} style={styles.contactButton} />
            <Text style={styles.contactEmail} selectable>{EMAILS.support}</Text>
          </View>
        </View>

        <SettingsSection title={t('settings.supportLegal')}>
          <SettingsRow iconNode={<Ionicons name="lock-closed-outline" size={18} color={colors.primaryBlue} />} label={t('settings.privacyPolicy')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'privacy' })} />
          <SettingsRow iconNode={<Ionicons name="document-text-outline" size={18} color={colors.primaryBlue} />} label={t('settings.termsOfUse')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'terms' })} />
          <SettingsRow iconNode={<Ionicons name="save-outline" size={18} color={colors.primaryBlue} />} label={t('settings.dataStorageNotice')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'dataStorage' })} />
          <SettingsRow iconNode={<Ionicons name="code-slash-outline" size={18} color={colors.primaryBlue} />} label={t('settings.openSourceLicenses')} subtitle={t('about.ossCount', { count: OSS_COUNT })} onPress={() => navigation.navigate('SettingsLegal', { doc: 'licences' })} />
          <SettingsRow iconNode={<Ionicons name="shield-checkmark-outline" size={18} color={colors.primaryBlue} />} label={t('settings.offlinePrivate')} subtitle={t('settings.offlinePrivateSub')} onPress={() => navigation.navigate('SettingsOfflinePrivate')} isLast />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginBottom: spacing.sm },
  logoCard: { backgroundColor: colors.primaryBlue, borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: spacing.lg },
  appName: { ...typography.screenTitle, color: '#fff', marginBottom: 4 },
  tagline: { ...typography.bodySm, color: 'rgba(255,255,255,0.75)' },
  description: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)', lineHeight: 19, textAlign: 'center', marginTop: 10 },
  contactBody: { padding: 12, gap: 10 },
  contactText: { ...typography.bodySm, color: colors.textMuted, lineHeight: 19 },
  contactNever: { ...typography.bodySm, color: colors.textDark, lineHeight: 19, fontWeight: '600' },
  contactButton: { marginTop: 2 },
  contactEmail: { ...typography.micro, color: colors.textFaint, textAlign: 'center' },
  version: { ...typography.micro, color: 'rgba(255,255,255,0.6)', marginTop: 8, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12 },
  infoIcon: { marginTop: 2, marginEnd: 12 },
  infoBody: { flex: 1 },
  infoLabel: { ...typography.cardTitle, color: colors.textDark },
  infoSub: { ...typography.bodySm, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
});
