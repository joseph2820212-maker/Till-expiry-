import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { APP_NAME } from '../../../appMeta';
import type { OnboardingParamList } from '../OnboardingNavigator';
import { enterDemo } from '../../demo/demoMode';

/** E01 — what TillExpiry does, that it works offline, Start or Try demo. */
export const WelcomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<OnboardingParamList>>();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const demo = async () => {
    setBusy(true);
    try { await enterDemo(); } catch { AppAlert.error(t('demo.failed')); } finally { setBusy(false); }
  };

  const Point = ({ icon, text }: { icon: string; text: string }) => (
    <View style={s.point}><Ionicons name={icon as any} size={22} color={colors.warningOrange} /><Text style={s.pointText}>{text}</Text></View>
  );

  return (
    <View style={[s.root, { paddingTop: Math.max(insets.top, 24) }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.app}>{APP_NAME}</Text>
        <Text style={s.promise}>{t('onboarding.promise')}</Text>
        <View style={s.points}>
          <Point icon="storefront-outline" text={t('onboarding.pointShelf')} />
          <Point icon="beaker-outline" text={t('onboarding.pointOpened')} />
          <Point icon="restaurant-outline" text={t('onboarding.pointPrepared')} />
          <Point icon="cloud-offline-outline" text={t('onboarding.pointOffline')} />
        </View>
        <Text style={s.small}>{t('onboarding.disclaimer')}</Text>
      </ScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <AppButton label={t('onboarding.start')} onPress={() => nav.navigate('ChooseMode')} testID="onb-start" />
        <AppButton label={t('onboarding.tryDemo')} onPress={demo} variant="outline" loading={busy} disabled={busy} textStyle={{ color: '#fff' }} style={{ borderColor: '#fff' }} />
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryBlue },
  content: { padding: spacing.xl, gap: spacing.lg },
  app: { ...typography.moneyValue, color: '#fff' },
  promise: { ...typography.sectionTitle, color: '#fff', lineHeight: 24 },
  points: { gap: spacing.md },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { ...typography.body, color: 'rgba(255,255,255,0.9)', flex: 1, lineHeight: 20 },
  small: { ...typography.bodySm, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.sm },
});
