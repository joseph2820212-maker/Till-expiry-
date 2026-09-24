import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, I18nManager } from 'react-native';
import { fs } from '../../theme/responsive';
import { colors } from '../../theme/colors';

// Ported from Till Note SettingsComponents.tsx. Label takes the full width so
// long DE/FR labels wrap instead of pushing the value off-screen.
export interface SettingsRowProps {
  icon?: string;
  iconNode?: React.ReactNode;
  iconBg?: string;
  label: string;
  value?: string;
  subtitle?: string;
  onPress?: () => void;
  showChevron?: boolean;
  danger?: boolean;
  rightElement?: React.ReactNode;
  isLast?: boolean;
  testID?: string;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
  icon, iconNode, iconBg, label, value, subtitle, onPress, showChevron = true, danger, rightElement, isLast, testID,
}) => (
  <TouchableOpacity
    style={[sr.row, !isLast && sr.rowBorder]}
    onPress={onPress}
    activeOpacity={onPress ? 0.85 : 1}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={label}
    testID={testID}
  >
    {(icon || iconNode !== undefined) && (
      <View style={[sr.iconWrap, iconBg ? { backgroundColor: iconBg } : undefined]}>
        {iconNode !== undefined ? iconNode : <Text style={sr.icon}>{icon}</Text>}
      </View>
    )}
    <View style={sr.textCol}>
      <Text style={[sr.label, danger && sr.labelDanger]} numberOfLines={2}>{label}</Text>
      {subtitle ? <Text style={sr.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
    </View>
    <View style={sr.right}>
      {rightElement || (
        <>
          {value ? <Text style={sr.value} numberOfLines={2}>{value}</Text> : null}
          {showChevron && onPress ? <Text style={[sr.chev, danger && sr.chevDanger]}>{I18nManager.isRTL ? '‹' : '›'}</Text> : null}
        </>
      )}
    </View>
  </TouchableOpacity>
);

const sr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.rule2 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: fs(18, 15, 21), color: colors.primaryBlue },
  textCol: { flex: 1, minWidth: 0 },
  label: { fontSize: fs(15, 13, 17), color: colors.textDark, fontWeight: '500' },
  labelDanger: { color: colors.dangerRed },
  subtitle: { fontSize: fs(12, 10, 14), color: colors.textFaint, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '45%' },
  value: { fontSize: fs(14, 12, 16), color: colors.textFaint, textAlign: 'right', flexShrink: 1 },
  chev: { fontSize: fs(20, 17, 23), color: colors.textFaint },
  chevDanger: { color: colors.dangerRed },
});
