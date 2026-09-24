import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';

interface Props { label: string; subtitle?: string; selected: boolean; onSelect: () => void; children?: React.ReactNode; }

export const RadioRow: React.FC<Props> = ({ label, subtitle, selected, onSelect, children }) => (
  <TouchableOpacity style={[styles.row, selected && styles.rowSelected]} onPress={onSelect} activeOpacity={0.8} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={subtitle ? `${label}, ${subtitle}` : label}>
    <View style={styles.header}>
      <View style={styles.textWrap}>
        <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </View>
    {selected && children ? <View style={styles.content}>{children}</View> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: { backgroundColor: colors.cardWhite, borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: colors.border },
  rowSelected: { borderColor: colors.primaryBlue },
  header: { flexDirection: 'row', alignItems: 'center' },
  textWrap: { flex: 1 },
  label: { fontSize: fs(15, 13, 17), fontWeight: '600', color: colors.textDark },
  labelSelected: { color: colors.primaryBlue },
  subtitle: { fontSize: fs(14, 12, 16), color: colors.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primaryBlue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryBlue },
  content: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
});
