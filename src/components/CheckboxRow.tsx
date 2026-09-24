import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';

interface Props { label: string; checked: boolean; onToggle: () => void; }

export const CheckboxRow: React.FC<Props> = ({ label, checked, onToggle }) => (
  <TouchableOpacity style={styles.row} onPress={onToggle} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}>
    <View style={[styles.box, checked && styles.boxChecked]}>
      {checked ? <Ionicons name="checkmark" size={14} style={styles.tick} /> : null}
    </View>
    <Text style={styles.label}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginEnd: 12 },
  boxChecked: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  tick: { color: '#fff', fontSize: fs(14, 12, 16), fontWeight: '700' },
  label: { flex: 1, fontSize: fs(15, 13, 17), fontWeight: '500', color: colors.textDark },
});
