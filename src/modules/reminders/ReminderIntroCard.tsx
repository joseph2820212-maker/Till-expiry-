/**
 * E04 ReminderIntro — shown on Today until the user turns reminders on or dismisses it. It explains local reminders
 * first; the OS permission question is asked only after the user taps "Turn on". Continuing without permission keeps
 * the app fully usable (T39); the reminder settings screen then shows "permission required" (T40).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { getReminderPermission, requestReminderPermission } from './reminderService';

/** Device-local: never backed up. */
export const REMINDER_INTRO_DISMISSED_KEY = 'app:reminderIntroDismissed';

export const ReminderIntroCard: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      let dismissed = false;
      try { dismissed = (await AsyncStorage.getItem(REMINDER_INTRO_DISMISSED_KEY)) === '1'; } catch { dismissed = false; }
      if (dismissed) return;
      const p = await getReminderPermission();
      if (live && p.state !== 'granted') setVisible(true);
    })().catch(() => undefined);
    return () => { live = false; };
  }, []);

  const dismiss = async () => {
    setVisible(false);
    await AsyncStorage.setItem(REMINDER_INTRO_DISMISSED_KEY, '1').catch(() => undefined);
  };

  const turnOn = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await requestReminderPermission();
      if (result === 'granted') await dismiss();
      else setDenied(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!visible) return null;
  return (
    <View style={s.card} testID="reminder-intro">
      <Text style={s.title}>{t('reminderIntro.title')}</Text>
      <Text style={s.body}>{t('reminderIntro.body')}</Text>
      <Text style={s.body}>{t('reminderIntro.authority')}</Text>
      {denied ? <Text style={s.notice}>{t('reminderIntro.denied')}</Text> : null}
      {denied ? (
        <AppButton label={t('common.ok')} onPress={dismiss} variant="secondary" />
      ) : (
        <>
          <AppButton label={t('reminderIntro.turnOn')} onPress={turnOn} loading={busy} />
          <AppButton label={t('reminderIntro.notNow')} onPress={dismiss} variant="ghost" disabled={busy} />
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: spacing.cardPadding, gap: spacing.sm },
  title: { ...typography.cardTitle, color: colors.textDark },
  body: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  notice: { ...typography.body, color: colors.textDark, lineHeight: 20 },
});
