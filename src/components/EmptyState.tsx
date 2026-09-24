import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

/** Content-sized empty-state card: icon, title, one explanatory sentence. No action unless one really exists. */
export const EmptyState: React.FC<{ icon: string; title: string; body: string; testID?: string }> = ({ icon, title, body, testID }) => (
  <View style={s.card} testID={testID}>
    <Ionicons name={icon as any} size={28} color={colors.primaryBlue} />
    <Text style={s.title}>{title}</Text>
    <Text style={s.body}>{body}</Text>
  </View>
);

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', gap: 8 },
  title: { ...typography.cardTitle, color: colors.textDark, textAlign: 'center' },
  body: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
