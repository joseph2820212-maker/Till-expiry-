import React, { createContext, useContext } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { fs } from '../theme/responsive';

interface Props { label: string; active: boolean; onPress: () => void; }

// Inside a ChipGrid every chip fills its cell, so a group reads as equal-size tiles in tidy rows.
const InGrid = createContext(false);

export const FilterChip: React.FC<Props> = ({ label, active, onPress }) => {
  const inGrid = useContext(InGrid);
  return (
    <TouchableOpacity style={[styles.chip, inGrid && styles.chipFill, active && styles.chipActive]} onPress={onPress} activeOpacity={0.8} hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={label}>
      <Text style={[styles.text, inGrid && styles.textFill, active && styles.textActive]} numberOfLines={inGrid ? 2 : undefined}>{label}</Text>
    </TouchableOpacity>
  );
};

/** Lays chips out in equal-width columns; chips in the same row share one height. */
export const ChipGrid: React.FC<{ children: React.ReactNode; columns?: number; style?: StyleProp<ViewStyle> }> = ({ children, columns = 2, style }) => (
  <InGrid.Provider value>
    <View style={[styles.grid, style]}>
      {React.Children.toArray(children).filter(React.isValidElement).map(child => (
        <View key={child.key} style={[styles.cell, { width: `${100 / columns}%` }]}>{child}</View>
      ))}
    </View>
  </InGrid.Provider>
);

const GAP = 8;

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 18, paddingVertical: 9, minHeight: 36, justifyContent: 'center', borderRadius: 24, backgroundColor: colors.cardWhite, borderWidth: 1.5, borderColor: colors.border, marginEnd: 8 },
  chipFill: { flex: 1, marginEnd: 0, paddingHorizontal: 12, minHeight: 44, alignItems: 'center' },
  chipActive: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  text: { fontSize: fs(14, 12, 16), fontWeight: '600', color: colors.textMuted },
  textFill: { textAlign: 'center' },
  textActive: { color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -GAP / 2, marginVertical: -GAP / 2 },
  cell: { padding: GAP / 2, flexDirection: 'row' },
});
