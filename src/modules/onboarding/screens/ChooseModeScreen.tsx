import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { WorkspaceMode } from '../../../domain/expiry/expiryTypes';
import { WORKSPACE_MODES } from '../../workspaces/workspaceStore';
import type { OnboardingParamList } from '../OnboardingNavigator';

const ICONS: Record<WorkspaceMode, string> = { retail: 'storefront-outline', food_prep: 'restaurant-outline', mixed: 'git-merge-outline', home_other: 'home-outline' };

/** E02 — the mode only changes suggestions and wording; all modes share one data model and can be changed later (§6). */
export const ChooseModeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<OnboardingParamList>>();
  const [mode, setMode] = useState<WorkspaceMode>('retail');
  return (
    <View style={s.root}>
      <ScreenHeader title={t('onboarding.modeTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Text style={s.hint}>{t('onboarding.modeHint')}</Text>
        {WORKSPACE_MODES.map(m => (
          <TouchableOpacity key={m} style={[s.card, mode === m && s.cardOn]} onPress={() => setMode(m)} accessibilityRole="radio" accessibilityState={{ selected: mode === m }} accessibilityLabel={t(`mode.${m}`)} testID={`mode-${m}`}>
            <Ionicons name={ICONS[m] as any} size={26} color={mode === m ? '#fff' : colors.primaryBlue} />
            <View style={s.text}>
              <Text style={[s.title, mode === m && s.on]}>{t(`mode.${m}`)}</Text>
              <Text style={[s.sub, mode === m && s.onSub]}>{t(`modeHelp.${m}`)}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <AppButton label={t('common.continue')} onPress={() => nav.navigate('WorkspaceSetup', { mode })} />
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  hint: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'flex-start' },
  cardOn: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  text: { flex: 1, gap: 2 },
  title: { ...typography.cardTitle, color: colors.textDark },
  sub: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  on: { color: '#fff' },
  onSub: { color: 'rgba(255,255,255,0.85)' },
});
