/**
 * E39 ReminderSettings: the four reminder types, the permission status and the last reconcile outcome.
 * Lead times are reminder settings, never shelf-life rules. The Today screen is always the authority.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppSwitch } from '../../../components/AppSwitch';
import { Section, Field, ChoiceChips, ErrorText, Hint } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { isTime } from '../../../domain/expiry/datePrecision';
import { saveReminderSettings, useReminderSettings, type ReminderSettings } from '../../settings/settingsStore';
import { getReminderPermission, reconcileReminders, requestReminderPermission, useReminderState, type PermissionInfo } from '../reminderService';

const ADVANCE_OPTIONS = [0, 1, 2, 3, 5, 7];
const LEAD_OPTIONS = [15, 30, 60, 120, 240];
const pad = (n: number) => String(n).padStart(2, '0');

const ToggleRow: React.FC<{ label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ label, hint, value, onChange, disabled }) => (
  <View style={s.toggleRow}>
    <View style={s.toggleText}>
      <Text style={s.toggleLabel}>{label}</Text>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
    <AppSwitch value={value} onValueChange={onChange} disabled={disabled} />
  </View>
);

export const ReminderSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const settings = useReminderSettings();
  const rs = useReminderState();
  const [permission, setPermission] = useState<PermissionInfo | null>(null);
  const [time, setTime] = useState(`${pad(settings.dailySummary.hour)}:${pad(settings.dailySummary.minute)}`);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refreshPermission = useCallback(() => { getReminderPermission().then(setPermission).catch(() => undefined); }, []);
  useFocusEffect(refreshPermission);
  useEffect(() => { setTime(`${pad(settings.dailySummary.hour)}:${pad(settings.dailySummary.minute)}`); }, [settings.dailySummary.hour, settings.dailySummary.minute]);

  const guarded = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setSaveError(null);
    try { await fn(); } catch { setSaveError(t('errors.saveFailed')); } finally { inFlight.current = false; setBusy(false); }
  };

  const save = (patch: Partial<ReminderSettings>) => guarded(async () => {
    await saveReminderSettings(patch);
    await reconcileReminders('settings');
  });

  const saveTime = () => {
    const v = time.trim();
    if (!isTime(v)) { setTimeError(t('reminders.timeInvalid')); return; }
    setTimeError(null);
    const [hour, minute] = v.split(':').map(Number);
    save({ dailySummary: { ...settings.dailySummary, hour, minute } });
  };

  const askPermission = () => guarded(async () => {
    if (permission && !permission.canAskAgain) { await Linking.openSettings(); return; }
    await requestReminderPermission();
    refreshPermission();
  });

  const retry = () => guarded(async () => { await reconcileReminders('retry'); refreshPermission(); });

  const statusLine = (() => {
    switch (rs.status) {
      case 'ok': return t('reminders.stateOk', { count: rs.scheduled });
      case 'permission_required': return t('reminders.statePermissionRequired');
      case 'schedule_failed': return t('reminders.stateFailed', { scheduled: rs.scheduled, failed: rs.failed });
      default: return t('reminders.stateOff');
    }
  })();
  const granted = permission?.state === 'granted';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={t('reminders.settingsTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={{ padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.cardGap }}>
        <View style={s.authority} testID="reminders-authority">
          <Text style={s.authorityText}>{t('reminders.authorityHint')}</Text>
        </View>

        <Section title={t('reminders.statusSection')} testID="reminders-status">
          <Text style={[s.stateLine, rs.status === 'schedule_failed' ? s.stateAttention : null]}>{statusLine}</Text>
          {rs.lastRunIso ? <Hint text={t('reminders.lastRun', { time: new Date(rs.lastRunIso).toLocaleString() })} /> : null}
          {rs.demoActive ? <Hint text={t('reminders.demoHint')} /> : null}
          <Text style={s.body}>{permission == null ? t('common.loading') : granted ? t('reminders.permissionGranted') : permission.canAskAgain ? t('reminders.permissionNotAsked') : t('reminders.permissionDenied')}</Text>
          {permission && !granted ? (
            <AppButton label={permission.canAskAgain ? t('reminders.allow') : t('reminders.openSettings')} onPress={askPermission} loading={busy} />
          ) : null}
          {rs.status === 'schedule_failed' ? <AppButton label={t('common.retry')} onPress={retry} variant="secondary" disabled={busy} /> : null}
          <ErrorText text={saveError} />
        </Section>

        <Section title={t('reminders.summarySection')} hint={t('reminders.summaryHint')}>
          <ToggleRow label={t('reminders.summaryToggle')} value={settings.dailySummary.enabled} onChange={v => save({ dailySummary: { ...settings.dailySummary, enabled: v } })} disabled={busy} />
          <Field label={t('reminders.timeLabel')} value={time} onChangeText={setTime} placeholder="08:00" keyboardType="number-pad" maxLength={5} error={timeError ?? undefined} hint={t('reminders.timeHint')} ltr testID="reminders-time" />
          <AppButton label={t('reminders.saveTime')} onPress={saveTime} variant="outline" disabled={busy} />
        </Section>

        <Section title={t('reminders.advanceSection')} hint={t('reminders.advanceHint')}>
          <ChoiceChips
            options={ADVANCE_OPTIONS.map(n => ({ value: String(n), label: n === 0 ? t('reminders.off') : t('reminders.daysBefore', { count: n }) }))}
            value={String(settings.advanceDays)}
            onChange={v => save({ advanceDays: Number(v) })}
          />
        </Section>

        <Section title={t('reminders.sameDaySection')}>
          <ToggleRow label={t('reminders.sameDayToggle')} hint={t('reminders.sameDayHint')} value={settings.sameDay} onChange={v => save({ sameDay: v })} disabled={busy} />
        </Section>

        <Section title={t('reminders.exactSection')}>
          <ToggleRow label={t('reminders.exactToggle')} hint={t('reminders.exactHint')} value={settings.exactTime.enabled} onChange={v => save({ exactTime: { ...settings.exactTime, enabled: v } })} disabled={busy} />
          {settings.exactTime.enabled ? (
            <ChoiceChips
              label={t('reminders.leadLabel')}
              options={LEAD_OPTIONS.map(n => ({ value: String(n), label: t('reminders.minutesBefore', { count: n }) }))}
              value={String(settings.exactTime.leadMinutes)}
              onChange={v => save({ exactTime: { ...settings.exactTime, leadMinutes: Number(v) } })}
            />
          ) : null}
        </Section>

        <Hint text={t('reminders.notShelfLife')} />
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  authority: { backgroundColor: colors.softBlue, borderRadius: 14, padding: 12 },
  authorityText: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  stateLine: { ...typography.cardTitle, color: colors.textDark },
  stateAttention: { color: colors.dangerRed },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  hint: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { ...typography.body, fontWeight: '600', color: colors.textDark },
});
