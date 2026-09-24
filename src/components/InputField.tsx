import React from 'react';
import { View, Text, StyleSheet, ViewStyle, I18nManager } from 'react-native';
import { AppTextInput } from './AppTextInput';
import { colors } from '../theme/colors';
import { localizeDigits, normalizeArabicNumerals } from '../utils/locale';
import { currencyAfter } from '../utils/currency';
import { fs } from '../theme/responsive';

interface Props {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  keyboardType?: 'numeric' | 'decimal-pad' | 'default';
  style?: ViewStyle;
  error?: string;
  hint?: string;
}

export const InputField: React.FC<Props> = ({
  label, value, onChangeText, placeholder, prefix, suffix,
  keyboardType = 'decimal-pad', style, error, hint,
}) => {
  // F09.2 (audit): currency placement follows the language (after the number for ar/fr/es/de), not a demo flag.
  const prefixAfter = !!prefix && currencyAfter();
  const handleChange = (v: string) =>
    onChangeText(keyboardType !== 'default' ? normalizeArabicNumerals(v) : v);
  const isNumeric = keyboardType !== 'default';
  return (
  <View style={[styles.wrap, style]}>
    {label ? (
      <Text
        style={[styles.label, I18nManager.isRTL && styles.rtlText]}
        numberOfLines={2}
      >
        {label}
      </Text>
    ) : null}
    <View style={[styles.row, error ? styles.errorBorder : null]}>
      {prefix && !prefixAfter ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <AppTextInput
        style={[styles.input, isNumeric && I18nManager.isRTL ? styles.rtlNumericInput : null]}
        value={isNumeric ? localizeDigits(value) : value}
        onChangeText={handleChange}
        placeholder={isNumeric ? localizeDigits(placeholder || '0.00') : (placeholder || '0.00')}
        placeholderTextColor="#4A5570"
        keyboardType={keyboardType}
        returnKeyType="done"
        blurOnSubmit={true}
      />
      {prefixAfter ? <Text style={styles.suffix}>{prefix}</Text> : null}
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
    {error ? <Text style={[styles.errorText, I18nManager.isRTL && styles.rtlText]}>{error}</Text> : null}
    {hint && !error ? <Text style={[styles.hint, I18nManager.isRTL && styles.rtlText]}>{hint}</Text> : null}
  </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: { fontSize: fs(14, 12, 16), fontWeight: '600', color: colors.textDark, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, height: 50 },
  errorBorder: { borderColor: colors.dangerRed },
  prefix: { fontSize: fs(16, 14, 18), color: colors.textMuted, marginEnd: 6 },
  suffix: { fontSize: fs(14, 12, 16), color: colors.textMuted, marginStart: 6 },
  input: { flex: 1, fontSize: fs(16, 14, 18), color: colors.textDark, height: 50 },
  rtlNumericInput: { writingDirection: 'ltr', textAlign: 'left' },
  rtlText: { alignSelf: 'stretch', textAlign: 'right', writingDirection: 'rtl' },
  errorText: { fontSize: fs(12, 10, 14), color: colors.dangerRed, marginTop: 4 },
  hint: { fontSize: fs(11, 9, 13), color: '#4A5570', marginTop: 4 },
});
