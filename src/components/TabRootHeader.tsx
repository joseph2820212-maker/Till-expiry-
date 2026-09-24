import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { HeaderTopBleed } from './HeaderTopBleed';

/** The navy header used by every tab root (family shell: same look as TillCalc's More tab). */
export const TabRootHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const insets = useSafeAreaInsets();
  return (
    <>
      <HeaderTopBleed color={colors.primaryBlue} />
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
    </>
  );
};

const s = StyleSheet.create({
  header: { backgroundColor: colors.primaryBlue, paddingHorizontal: spacing.screenPadding, paddingBottom: 14 },
  title: { ...typography.screenTitle, color: '#fff' },
  subtitle: { ...typography.bodySm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
});
