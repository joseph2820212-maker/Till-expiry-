import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

/** Long values (≥ this many characters) stack under the label instead of shrinking. */
export const LABEL_ROW_STACK_AT = 14;

/**
 * Label on the left, value on the right (RTL-safe via flexDirection row). Both
 * wrap to two lines; a long value — "£24.96 → £26.40", a 3-dp KWD amount — stacks
 * under the label at full width instead of being squeezed and shrunk (F09.6).
 */
export const LabelRow: React.FC<{ label: string; value: string; strong?: boolean; tone?: 'default' | 'muted' | 'danger' | 'success' }> = ({ label, value, strong, tone = 'default' }) => {
  const stacked = value.length >= LABEL_ROW_STACK_AT;
  return (
    <View style={[s.row, stacked && s.rowStacked]} testID={stacked ? 'label-row-stacked' : 'label-row-inline'}>
      <Text style={s.label} numberOfLines={2}>{label}</Text>
      <Text style={[s.value, stacked && s.valueStacked, strong && s.strong, tone === 'muted' && s.muted, tone === 'danger' && s.danger, tone === 'success' && s.success]} numberOfLines={2}>{value}</Text>
    </View>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  label: { ...typography.bodySm, color: colors.textMuted, flex: 1 },
  value: { ...typography.body, color: colors.textDark, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  valueStacked: { textAlign: 'left', writingDirection: 'ltr' },
  strong: { ...typography.moneySmall, color: colors.textDark },
  muted: { color: colors.textFaint },
  danger: { color: colors.dangerRed },
  success: { color: colors.successGreen },
});
