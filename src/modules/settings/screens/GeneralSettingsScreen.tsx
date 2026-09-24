import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { ChoiceChips, Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { saveGeneral, useGeneralSettings } from '../settingsStore';

const SOON_DAYS = [1, 2, 3, 5, 7, 14];
const URGENT_HOURS = [6, 12, 24, 48];

/** E40 — when a date counts as "soon" and when an exact-time cutoff counts as "urgent". Changes status words only, never a date. */
export const GeneralSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const current = useGeneralSettings();
  const [soonDays, setSoonDays] = useState(current.soonDays);
  const [urgentHours, setUrgentHours] = useState(current.urgentHours);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await saveGeneral({ soonDays, urgentHours }); nav.goBack(); }
    catch { AppAlert.error(t('errors.saveFailed')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const soonOpts = [...new Set([...SOON_DAYS, current.soonDays])].sort((a, b) => a - b);
  const urgentOpts = [...new Set([...URGENT_HOURS, current.urgentHours])].sort((a, b) => a - b);
  return (
    <View style={s.root}>
      <ScreenHeader title={t('general.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Section title={t('general.soonTitle')} hint={t('general.soonHint')}>
          <ChoiceChips options={soonOpts.map(n => ({ value: String(n), label: t('general.days', { count: n }) }))} value={String(soonDays)} onChange={v => setSoonDays(Number(v))} />
        </Section>
        <Section title={t('general.urgentTitle')} hint={t('general.urgentHint')}>
          <ChoiceChips options={urgentOpts.map(n => ({ value: String(n), label: t('general.hours', { count: n }) }))} value={String(urgentHours)} onChange={v => setUrgentHours(Number(v))} />
        </Section>
        <Hint text={t('general.note')} />
        <AppButton label={t('common.save')} onPress={save} loading={busy} disabled={busy} testID="general-save" />
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
