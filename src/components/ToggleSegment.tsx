import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';

interface Props { options: string[]; selected: string; onSelect: (v: string) => void; style?: ViewStyle; }

export const ToggleSegment: React.FC<Props> = ({ options, selected, onSelect, style }) => (
  <View style={[styles.container, style]}>
    {options.map(opt => (
      <TouchableOpacity key={opt} style={[styles.option, selected === opt && styles.optionActive]} onPress={() => onSelect(opt)} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ selected: selected === opt }} accessibilityLabel={opt}>
        <Text
          style={[styles.text, selected === opt && styles.textActive]}
          numberOfLines={2}
        >
          {opt}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: colors.inputMuted, borderRadius: 12, padding: 3 },
  option: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, minHeight: 40 },
  optionActive: { backgroundColor: colors.primaryBlue, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  text: { fontSize: fs(13, 11, 15), fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  textActive: { color: colors.card },
});
