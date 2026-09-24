import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fs } from '../../theme/responsive';
import { colors } from '../../theme/colors';

export interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
  footer?: string;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children, footer }) => (
  <View style={ss.container}>
    <Text style={ss.title}>{title}</Text>
    <View style={ss.card}>{children}</View>
    {footer ? <Text style={ss.footer}>{footer}</Text> : null}
  </View>
);

const ss = StyleSheet.create({
  container: { marginBottom: 22 },
  title: { fontSize: fs(11, 9, 13), fontWeight: '700', color: colors.textFaint, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  card: { backgroundColor: colors.card, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  footer: { fontSize: fs(12, 10, 14), color: colors.textFaint, marginTop: 8, paddingHorizontal: 4, lineHeight: 17 },
});
