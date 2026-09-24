import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppSwitch } from '../../../components/AppSwitch';
import { AppAlert } from '../../../components/AppAlert';
import { FilterChip } from '../../../components/FilterChip';
import { DATE_TYPES } from '../../../domain/types';
import { updateSettings, useExpirySettings } from '../settingsStore';
import { getReminderPermission, requestReminderPermission, syncReminders, type PermissionState } from '../../reminders/reminderService';

const ALERT_CHOICES = [1, 2, 3, 5, 7, 14];
const HOURS = [6, 7, 8, 9, 10, 12, 15, 18, 20];
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** How far ahead "due soon" looks, the usual date kind, and the daily reminder. */
export const DatesSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const settings = useExpirySettings();
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [explain, setExplain] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { getReminderPermission().then(setPermission).catch(() => undefined); }, []));

  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    try { await updateSettings(patch); await syncReminders(); }
    catch { AppAlert.error(t('datesSettings.saveFailed')); }
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const p = await requestReminderPermission();
      setPermission(p);
      setExplain(false);
      if (p === 'granted') { await save({ reminder: { enabled: true } }); AppAlert.success(t('reminders.enabled')); }
      else AppAlert.alert(t('reminders.deniedTitle'), t('reminders.deniedBody'));
    } finally { setBusy(false); }
  };

  const toggle = (on: boolean) => {
    if (!on) { save({ reminder: { enabled: false } }); return; }
    if (permission === 'granted') { save({ reminder: { enabled: true } }); return; }
    setExplain(true);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('datesSettings.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.label}>{t('datesSettings.alertTitle')}</Text>
          <Text style={s.hint}>{t('datesSettings.alertHint')}</Text>
          <View style={s.chips}>
            {ALERT_CHOICES.map(n => <FilterChip key={n} label={String(n)} active={settings.alertDays === n} onPress={() => save({ alertDays: n })} />)}
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.label}>{t('datesSettings.defaultType')}</Text>
          <Text style={s.hint}>{t('datesSettings.defaultTypeHint')}</Text>
          <View style={s.chips}>
            {DATE_TYPES.map(k => <FilterChip key={k} label={t(`dateType.${k}`)} active={settings.defaultDateType === k} onPress={() => save({ defaultDateType: k })} />)}
          </View>
        </View>

        <View style={s.card}>
          <View style={s.switchRow}>
            <View style={s.switchText}>
              <Text style={s.title}>{t('reminders.rowTitle')}</Text>
              <Text style={s.hint}>{settings.reminder.enabled ? t('reminders.onAt', { time: hhmm(settings.reminder.hour, settings.reminder.minute) }) : t('reminders.off')}</Text>
            </View>
            <AppSwitch value={settings.reminder.enabled && permission === 'granted'} onValueChange={toggle} />
          </View>
          {explain ? (
            <View style={s.explain}>
              <Text style={s.title}>{t('reminders.explainTitle')}</Text>
              <Text style={s.hint}>{t('reminders.explainBody')}</Text>
              <AppButton label={t('common.continue')} onPress={turnOn} loading={busy} disabled={busy} />
              <AppButton label={t('common.cancel')} onPress={() => setExplain(false)} variant="ghost" />
            </View>
          ) : null}
          {settings.reminder.enabled && permission === 'denied' ? (
            <View style={s.explain}>
              <Text style={s.err}>{t('reminders.blocked')}</Text>
              <AppButton label={t('settings.openSettings')} onPress={() => Linking.openSettings().catch(() => {})} variant="secondary" />
            </View>
          ) : null}
          <Text style={[s.label, s.gapTop]}>{t('reminders.time')}</Text>
          <View style={s.chips}>
            {HOURS.map(h => <FilterChip key={h} label={hhmm(h, 0)} active={settings.reminder.hour === h && settings.reminder.minute === 0} onPress={() => save({ reminder: { hour: h, minute: 0 } })} />)}
          </View>
          <Text style={s.hint}>{t('reminders.howItWorks', { days: settings.alertDays })}</Text>
        </View>
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 },
  label: { ...typography.sectionLabel, color: colors.textMuted },
  gapTop: { marginTop: spacing.sm },
  title: { ...typography.cardTitle, color: colors.textDark },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  err: { ...typography.bodySm, color: colors.dangerRed },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  explain: { backgroundColor: colors.softBlue, borderRadius: 12, padding: 12, gap: 8 },
});
