import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { TabRootHeader } from '../../../components/TabRootHeader';
import { EmptyState } from '../../../components/EmptyState';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { APP_NAME } from '../../../appMeta';
import { localDate } from '../../../utils/locale';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { tabTarget } from '../../../navigation/tabs';
import { countBands, needsAttention, checkedToday, type Band } from '../../../domain/expiry';
import { useShelfData } from '../../dates/hooks/useShelfData';
import { BatchRow, BAND_STYLE } from '../../dates/components/BatchRow';
import { useExpirySettings } from '../../settings/settingsStore';

const PREVIEW_ROWS = 5;

/**
 * Today: how many dates are expired, due today and due soon; the next few to deal with; the everyday actions
 * (scan to add a date, add a date, start the date check) and the first-run settings.
 */
export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const settings = useExpirySettings();
  const { batches, byId, today, alertDaysOf, error } = useShelfData('open');

  const counts = useMemo(() => (batches ? countBands(batches, today, alertDaysOf) : null), [batches, today, alertDaysOf]);
  const attention = useMemo(() => (batches ? needsAttention(batches, today, alertDaysOf) : []), [batches, today, alertDaysOf]);
  const unchecked = attention.filter(b => !checkedToday(b, today)).length;

  const tile = (band: Band, n: number | undefined, label: string) => (
    <TouchableOpacity key={band} style={[s.stat, { backgroundColor: BAND_STYLE[band].bg }]} onPress={() => nav.navigate('Tabs', tabTarget('Dates', { filter: band }))} accessibilityRole="button" testID={`home-stat-${band}`}>
      <Text style={[s.statNum, { color: BAND_STYLE[band].fg }]}>{n == null ? '—' : String(n)}</Text>
      <Text style={[s.statLabel, { color: BAND_STYLE[band].fg }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <TabRootHeader title={APP_NAME} subtitle={localDate(today)} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.stats}>
          {tile('expired', counts?.expired, t('home.statExpired'))}
          {tile('today', counts?.today, t('home.statToday'))}
          {tile('soon', counts?.soon, t('home.statSoon'))}
        </View>

        <TouchableOpacity style={[s.check, !attention.length && s.checkDone]} onPress={() => nav.navigate('DateCheck')} accessibilityRole="button" testID="home-check">
          <Ionicons name={attention.length && unchecked ? 'checkbox-outline' : 'checkmark-done-outline'} size={24} color="#fff" />
          <View style={s.checkText}>
            <Text style={s.checkTitle}>{t('home.checkTitle')}</Text>
            <Text style={s.checkSub}>{!batches ? '—' : attention.length === 0 ? t('home.checkNothing') : unchecked ? t('home.checkWaiting', { count: unchecked }) : t('home.checkDone')}</Text>
          </View>
        </TouchableOpacity>

        <View style={s.grid}>
          {([
            ['barcode-outline', 'home.scanAdd', () => nav.navigate('Scan', { mode: 'addDate' }), 'home-scan'],
            ['add-circle-outline', 'home.addDate', () => nav.navigate('AddDate', {}), 'home-add'],
          ] as const).map(([icon, key, go, id]) => (
            <TouchableOpacity key={key} style={s.tile} onPress={go} accessibilityRole="button" testID={id}>
              <Ionicons name={icon} size={24} color={colors.primaryBlue} />
              <Text style={s.tileText}>{t(key)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <EmptyState icon="alert-circle-outline" title={t('dates.loadErrorTitle')} body={t('dates.loadErrorBody')} /> : null}
        {batches && batches.length === 0 && !error ? <EmptyState icon="calendar-outline" title={t('home.emptyTitle')} body={t('home.emptyBody')} testID="home-empty" /> : null}

        {attention.length ? (
          <View style={s.list}>
            <Text style={s.section}>{t('home.nextUp')}</Text>
            {attention.slice(0, PREVIEW_ROWS).map(b => (
              <BatchRow key={b.id} batch={b} product={byId.get(b.productId)} today={today} alertDays={alertDaysOf(b)} onPress={() => nav.navigate('DateDetail', { id: b.id })} />
            ))}
            {attention.length > PREVIEW_ROWS ? (
              <TouchableOpacity onPress={() => nav.navigate('Tabs', tabTarget('Dates', { filter: 'attention' }))} accessibilityRole="button" style={s.more}>
                <Text style={s.moreText}>{t('home.seeAll', { count: attention.length })}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <SettingsSection title={t('home.setupTitle')} footer={t('home.setupFooter')}>
          <SettingsRow iconNode={<Ionicons name="language-outline" size={18} color={colors.primaryBlue} />} label={t('settings.language')} subtitle={t('settings.languageValue')} onPress={() => nav.navigate('SettingsLanguage')} />
          <SettingsRow iconNode={<Ionicons name="calendar-outline" size={18} color={colors.primaryBlue} />} label={t('datesSettings.title')} subtitle={t('datesSettings.summary', { days: settings.alertDays })} onPress={() => nav.navigate('SettingsDates')} />
          <SettingsRow iconNode={<Ionicons name="notifications-outline" size={18} color={colors.primaryBlue} />} label={t('reminders.rowTitle')} subtitle={settings.reminder.enabled ? t('reminders.onAt', { time: `${String(settings.reminder.hour).padStart(2, '0')}:${String(settings.reminder.minute).padStart(2, '0')}` }) : t('reminders.off')} onPress={() => nav.navigate('SettingsDates')} isLast />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 16, padding: 12, minHeight: 88, justifyContent: 'space-between' },
  statNum: { ...typography.moneyValue },
  statLabel: { ...typography.bodySm, fontWeight: '700' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.primaryBlue, borderRadius: 16, padding: 16 },
  checkDone: { backgroundColor: colors.successGreen },
  checkText: { flex: 1, gap: 2 },
  checkTitle: { ...typography.cardTitle, color: '#fff' },
  checkSub: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 76, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8, justifyContent: 'center' },
  tileText: { ...typography.cardTitle, color: colors.textDark },
  list: { gap: 8 },
  section: { ...typography.sectionLabel, color: colors.textMuted },
  more: { alignItems: 'center', paddingVertical: 10 },
  moreText: { ...typography.body, color: colors.primaryBlue, fontWeight: '700' },
});
