import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { HeaderTopBleed } from '../../../components/HeaderTopBleed';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { AppAlert } from '../../../components/AppAlert';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { getCurrencyCode, isCurrencySet, symbolForCode } from '../../../utils/currency';
import { useBilling } from '../../billing/BillingProvider';
import { useTier } from '../../billing/useTier';
import { FreeLimitSheet, type FreeLimitReason } from '../../billing/FreeLimitSheet';
import { APP_NAME, APP_VERSION } from '../../../appMeta';
import { openSupportMail } from './AboutScreen';

/** Settings hub on the Till Note SettingsSection / SettingsRow pattern. */
export const MoreScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const billing = useBilling();
  const tier = useTier();
  const [limit, setLimit] = React.useState<FreeLimitReason | null>(null);

  const code = getCurrencyCode();
  const currencySub = isCurrencySet() ? `${code} (${symbolForCode(code)})` : t('settings.currencyNotSet');

  const restore = async () => {
    const r = await billing.restore();
    if (r.success) AppAlert.success(t('billing.unlocked'));
    else AppAlert.alert(t('billing.restoreTitle'), t('billing.nothingToRestore'));
  };

  return (
    <View style={styles.root}>
      <HeaderTopBleed color={colors.primaryBlue} />
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <Text style={styles.title}>{t('nav.more')}</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <SettingsSection title={t('settings.appGroup')}>
          <SettingsRow iconNode={<Ionicons name="language-outline" size={18} color={colors.primaryBlue} />} label={t('settings.language')} subtitle={t('settings.languageValue')} onPress={() => navigation.navigate('SettingsLanguage')} />
          <SettingsRow iconNode={<Ionicons name="cash-outline" size={18} color={colors.primaryBlue} />} label={t('settings.currency')} subtitle={currencySub} onPress={() => navigation.navigate('SettingsCurrency')} />
          <SettingsRow iconNode={<Ionicons name="calendar-outline" size={18} color={colors.primaryBlue} />} label={t('datesSettings.title')} subtitle={t('datesSettings.moreRow')} onPress={() => navigation.navigate('SettingsDates')} />
          <SettingsRow iconNode={<Ionicons name="cloud-upload-outline" size={18} color={colors.primaryBlue} />} label={t('settings.backupRestore')} subtitle={t('settings.backupRow')} onPress={() => navigation.navigate('SettingsBackup')} isLast />
        </SettingsSection>

        <SettingsSection title={t('more.datesGroup')}>
          <SettingsRow iconNode={<Ionicons name="checkbox-outline" size={18} color={colors.primaryBlue} />} label={t('check.title')} subtitle={t('more.checkSub')} onPress={() => navigation.navigate('DateCheck')} />
          <SettingsRow iconNode={<Ionicons name="bar-chart-outline" size={18} color={colors.primaryBlue} />} label={t('reports.title')} subtitle={t('more.reportsSub')} onPress={() => navigation.navigate('Reports')} />
          <SettingsRow iconNode={<Ionicons name="document-attach-outline" size={18} color={colors.primaryBlue} />} label={t('importer.title')} subtitle={t('more.importSub')} onPress={() => navigation.navigate('Import')} isLast />
        </SettingsSection>

        <SettingsSection title={t('billing.settingsTitle')} footer={tier === 'pro' ? t('settings.proActiveFooter') : t('settings.proFreeFooter')}>
          <SettingsRow iconNode={<Ionicons name="diamond-outline" size={18} color={colors.primaryBlue} />} label={tier === 'pro' ? t('settings.proActive') : t('settings.proTitle')} subtitle={tier === 'pro' ? t('billing.statusLifetime') : billing.purchaseRecoveryPending ? t('billing.purchaseEntitlementMissing') : t('settings.proDesc')} onPress={tier === 'pro' ? undefined : () => setLimit('proFeature')} showChevron={tier !== 'pro'} />
          <SettingsRow iconNode={<Ionicons name="refresh-outline" size={18} color={colors.primaryBlue} />} label={t('billing.restorePurchases')} onPress={restore} isLast />
        </SettingsSection>

        <SettingsSection title={t('settings.supportLegal')}>
          <SettingsRow iconNode={<Ionicons name="book-outline" size={18} color={colors.primaryBlue} />} label={t('help.tabGuide')} subtitle={t('help.guideIntro')} onPress={() => navigation.navigate('SettingsHelp', { tab: 'guide' })} />
          <SettingsRow iconNode={<Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primaryBlue} />} label={t('help.tabFaq')} subtitle={t('help.faqIntro')} onPress={() => navigation.navigate('SettingsHelp', { tab: 'faq' })} />
          <SettingsRow iconNode={<Ionicons name="mail-outline" size={18} color={colors.primaryBlue} />} label={t('settings.contactSupport')} onPress={() => openSupportMail(t)} />
          <SettingsRow iconNode={<Ionicons name="lock-closed-outline" size={18} color={colors.primaryBlue} />} label={t('settings.privacyPolicy')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'privacy' })} />
          <SettingsRow iconNode={<Ionicons name="document-text-outline" size={18} color={colors.primaryBlue} />} label={t('settings.termsOfUse')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'terms' })} />
          <SettingsRow iconNode={<Ionicons name="save-outline" size={18} color={colors.primaryBlue} />} label={t('settings.dataStorageNotice')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'dataStorage' })} />
          <SettingsRow iconNode={<Ionicons name="code-slash-outline" size={18} color={colors.primaryBlue} />} label={t('settings.openSourceLicenses')} onPress={() => navigation.navigate('SettingsLegal', { doc: 'licences' })} />
          <SettingsRow iconNode={<Ionicons name="information-circle-outline" size={18} color={colors.primaryBlue} />} label={t('settings.aboutApp', { app: APP_NAME })} subtitle={`v${APP_VERSION}`} onPress={() => navigation.navigate('SettingsAbout')} isLast />
        </SettingsSection>
      </ScrollView>
      <FreeLimitSheet reason={limit} onClose={() => setLimit(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primaryBlue, paddingHorizontal: spacing.screenPadding, paddingBottom: 14 },
  title: { ...typography.screenTitle, color: '#fff' },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
});
