import React from 'react';
import { View, Text, ScrollView, StyleSheet, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';

function PrivacyRow({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <View style={styles.privacyRow}>
      <Ionicons name={icon as any} size={20} color={colors.successGreen} style={styles.privacyIcon} />
      <View style={styles.privacyBody}>
        <Text style={styles.privacyLabel}>{label}</Text>
        <Text style={styles.privacySub}>{sub}</Text>
      </View>
    </View>
  );
}

export const OfflinePrivateScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('settings.offlinePrivate')} subtitle={t('settings.offlinePrivateSub')} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.section}>{t('settings.dataPrivacyModel')}</Text>
        <View style={styles.card}>
          <PrivacyRow icon="cloud-offline-outline" label={t('settings.offlineFirst')} sub={t('settings.offlineFirstSub')} />
          <PrivacyRow icon="lock-closed-outline" label={t('settings.calculationsLocalOnly')} sub={t('settings.calculationsLocalOnlySub')} />
          <PrivacyRow icon="person-outline" label={t('settings.noAccountRequired')} sub={t('settings.noAccountRequiredSub')} />
        </View>

        <View style={styles.disclaimerCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} style={styles.disclaimerIcon} />
          <Text style={styles.disclaimerText}>{t('settings.offlineInfoMsg')}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  privacyIcon: { marginEnd: 12, marginTop: 2 },
  privacyBody: { flex: 1 },
  privacyLabel: { ...typography.cardTitle, color: colors.textDark },
  privacySub: { ...typography.bodySm, color: colors.textMuted, marginTop: 2 },
  disclaimerCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.softBlue, borderRadius: 14, padding: 16, marginTop: spacing.md,
  },
  disclaimerIcon: { marginEnd: 10, marginTop: 2 },
  disclaimerText: { ...typography.bodySm, color: colors.textMuted, flex: 1 },
});
