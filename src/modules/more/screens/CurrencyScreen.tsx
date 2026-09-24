import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { SYMBOL_MAP, setCurrencyOption, useCurrencySymbol, useCurrencyCode } from '../../../utils/currency';

const OPTIONS = Object.keys(SYMBOL_MAP);

export const CurrencyScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const currentSymbol = useCurrencySymbol();
  const currentCode = useCurrencyCode();
  const [error, setError] = useState('');

  const handleSelect = useCallback(async (option: string) => {
    setError('');
    try {
      await setCurrencyOption(option);
    } catch {
      setError(t('settings.currencySaveFailed'));
    }
  }, [t]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScreenHeader title={t('settings.currencyScreenTitle')} subtitle={t('settings.currencyScreenSub')} onBack={() => navigation.goBack()} />
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.section}>{t('settings.currentCurrency')}</Text>
        <View style={styles.currentCard}>
          <Text style={styles.currentSymbol}>{currentSymbol}</Text>
          <Text style={styles.currentCode}>{currentCode}</Text>
        </View>

        {error !== '' && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <Text style={styles.note}>{t('settings.defaultsNote')}</Text>
        <Text style={styles.note}>{t('settings.numberFormatNote')}</Text>

        <Text style={[styles.section, { marginTop: spacing.sectionGap }]}>{t('settings.chooseCurrency')}</Text>
        {OPTIONS.map((option) => {
          const sym = SYMBOL_MAP[option];
          const parts = option.split(' ');
          const code = parts[parts.length - 1];
          const isActive = code === currentCode;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.row, isActive && styles.rowActive]}
              onPress={() => handleSelect(option)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowSymbol}>{sym}</Text>
                <Text style={styles.rowCode}>{code}</Text>
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
  currentCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 14, padding: 16, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  currentSymbol: { ...typography.cardValue, color: colors.textDark, marginEnd: 12 },
  currentCode: { ...typography.cardTitle, color: colors.textMuted },
  note: { ...typography.bodySm, color: colors.textFaint, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  rowActive: { borderColor: colors.successGreen },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowSymbol: { ...typography.cardTitle, color: colors.textDark, width: 48 },
  rowCode: { ...typography.body, color: colors.textMuted },
  errorBanner: { backgroundColor: colors.dangerRed + '22', borderRadius: 10, padding: 12, marginBottom: spacing.sm },
  errorText: { ...typography.bodySm, color: colors.dangerRed },
});
