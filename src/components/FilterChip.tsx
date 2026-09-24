import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';

interface Props { label: string; active: boolean; onPress: () => void; }

export const FilterChip: React.FC<Props> = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}>
    <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 18, paddingVertical: 9, minHeight: 36, justifyContent: 'center', borderRadius: 24, backgroundColor: colors.cardWhite, borderWidth: 1.5, borderColor: colors.border, marginEnd: 8 },
  chipActive: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  text: { fontSize: fs(14, 12, 16), fontWeight: '600', color: colors.textMuted },
  textActive: { color: '#fff' },
});
