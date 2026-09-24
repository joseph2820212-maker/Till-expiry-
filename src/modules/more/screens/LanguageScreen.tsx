import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import i18n, { SUPPORTED_LANGUAGES, AppLanguage, changeLanguage } from '../../../i18n';

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  ar: 'العربية',
  tr: 'Türkçe',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
};

export const LanguageScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const currentLang = i18n.language as AppLanguage;
  const [switching, setSwitching] = useState(false);
  const [banner, setBanner] = useState('');

  const handleSelect = useCallback(async (lang: AppLanguage) => {
    if (lang === currentLang || switching) return;
    setSwitching(true);
    setBanner('');
    try {
      const result = await changeLanguage(lang);
      if (result.rolledBack) {
        setBanner(t('settings.languageRolledBack', { lang: LANGUAGE_LABELS[lang] }));
      }
    } catch {
      setBanner(t('settings.languageChangeFailed'));
    } finally {
      setSwitching(false);
    }
  }, [currentLang, switching, t]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('settings.language')} subtitle={t('settings.appLanguageSub')} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {switching && (
          <View style={styles.busyRow}>
            <ActivityIndicator size="small" color={colors.primaryBlue} />
            <Text style={styles.busyText}>{t('settings.languageSwitching')}</Text>
          </View>
        )}
        {banner !== '' && !switching && (
          <View style={styles.bannerRow}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>
        )}
        <Text style={styles.section}>{t('settings.displayLanguage')}</Text>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = lang === currentLang;
          return (
            <TouchableOpacity
              key={lang}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => handleSelect(lang)}
              activeOpacity={0.7}
              disabled={switching}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{LANGUAGE_LABELS[lang]}</Text>
                <Text style={styles.rowCode}>{lang.toUpperCase()}</Text>
              </View>
              {isActive && <Ionicons name="checkmark-circle" size={22} color={colors.successGreen} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  bodyContent: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  section: { ...typography.sectionLabel, color: colors.textMuted, marginBottom: spacing.sm },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  busyText: { ...typography.bodySm, color: colors.textMuted },
  bannerRow: { backgroundColor: colors.warningOrange + '22', borderRadius: 10, padding: 12, marginBottom: spacing.sm },
  bannerText: { ...typography.bodySm, color: colors.warningOrange },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rowActive: { borderColor: colors.successGreen },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { ...typography.cardTitle, color: colors.textDark },
  rowCode: { ...typography.bodySm, color: colors.textMuted },
});
