/**
 * Small form pieces on top of the family components (TillCalc AppTextInput / FilterChip): label above the field,
 * error or hint below, wrapping choice chips, and a card section with one clear question (§26.4).
 */
import React from 'react';
import { View, Text, StyleSheet, I18nManager } from 'react-native';
import { AppTextInput } from '../AppTextInput';
import { ChipGrid, FilterChip } from '../FilterChip';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

export const Section: React.FC<{ title?: string; hint?: string; children: React.ReactNode; testID?: string }> = ({ title, hint, children, testID }) => (
  <View style={s.section} testID={testID}>
    {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
    {hint ? <Text style={s.hint}>{hint}</Text> : null}
    {children}
  </View>
);

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  maxLength?: number;
  error?: string;
  hint?: string;
  multiline?: boolean;
  testID?: string;
  /** Numbers, dates and codes stay left-to-right in Arabic (UI rule 7). */
  ltr?: boolean;
}

export const Field: React.FC<FieldProps> = ({ label, value, onChangeText, placeholder, keyboardType = 'default', maxLength, error, hint, multiline, testID, ltr }) => (
  <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <AppTextInput
      style={[s.input, error ? s.inputError : null, ltr && I18nManager.isRTL ? s.ltr : null, multiline ? s.multiline : null]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      accessibilityLabel={label}
      testID={testID}
    />
    {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
  </View>
);

export function ChoiceChips<V extends string>({ options, value, onChange, label }: { options: { value: V; label: string }[]; value: V | undefined; onChange: (v: V) => void; label?: string }) {
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <ChipGrid>
        {options.map(o => <FilterChip key={o.value} label={o.label} active={value === o.value} onPress={() => onChange(o.value)} />)}
      </ChipGrid>
    </View>
  );
}

export const ErrorText: React.FC<{ text?: string | null }> = ({ text }) => (text ? <Text style={s.error}>{text}</Text> : null);
export const Hint: React.FC<{ text?: string | null }> = ({ text }) => (text ? <Text style={s.hint}>{text}</Text> : null);

const s = StyleSheet.create({
  section: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: spacing.sm },
  sectionTitle: { ...typography.sectionLabel, color: colors.textMuted },
  field: { gap: 4 },
  label: { ...typography.body, fontWeight: '600', color: colors.textDark },
  input: { ...typography.body, color: colors.textDark, backgroundColor: colors.cardWhite, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  multiline: { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 },
  inputError: { borderColor: colors.dangerRed },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  error: { ...typography.bodySm, color: colors.dangerRed },
});
