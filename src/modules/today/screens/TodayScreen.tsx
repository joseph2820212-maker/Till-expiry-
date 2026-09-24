import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { WorkspaceHeader } from '../../../components/WorkspaceHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { AppButton } from '../../../components/AppButton';
import { BatchCard } from '../../../components/status/BatchCard';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { groupOf, type StatusGroup } from '../../../domain/expiry/statusEngine';
import { ATTENTION_GROUPS, SUMMARY_GROUPS, loadWorkspaceView, primaryActionFor } from '../workspaceView';
import { ReminderIntroCard } from '../../reminders/ReminderIntroCard';
import type { BatchQuery, TabStackParamList } from '../../../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<TabStackParamList>;

const TILE: Record<StatusGroup, { icon: string; fg: string; bg: string }> = {
  past_hard: { icon: 'alert-circle', fg: '#FFFFFF', bg: colors.dangerRed },
  due_today: { icon: 'time', fg: '#7A3D08', bg: '#FBE2C8' },
  due_soon: { icon: 'hourglass-outline', fg: colors.primaryBlue, bg: colors.softBlue },
  needs_checking: { icon: 'help-circle-outline', fg: '#5B6476', bg: '#E8E4DA' },
  quality_review: { icon: 'eye-outline', fg: '#4B3B8F', bg: colors.softPurple },
  later: { icon: 'calendar-outline', fg: colors.textMuted, bg: colors.card },
};

const NEXT_LIMIT = 8;

/** E05 — the operational home: what is past, due today, due soon, unchecked or up for quality review, and what to do next. */
export const TodayScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { data: v, error, reload } = useWorkspaceData(ws => loadWorkspaceView(ws));
  const [locationId, setLocationId] = React.useState<string | undefined>();

  const next = useMemo(() => (v ? v.ranked.filter(r => ATTENTION_GROUPS.includes(groupOf(r.evaluation.status)) && (!locationId || r.batch.locationId === locationId)) : []), [v, locationId]);
  const hasKinds = useMemo(() => ({
    opened: !!v?.ranked.some(r => r.batch.kind === 'opened'),
    prepared: !!v?.ranked.some(r => r.batch.kind === 'prepared'),
  }), [v]);
  const openQueue = (query: BatchQuery) => nav.navigate('ExpiryQueue', { query });

  return (
    <View style={s.root}>
      <WorkspaceHeader title={t('today.title')} onSearch={() => nav.navigate('GlobalSearch')} />
      <AppKeyboardScrollView contentContainerStyle={s.content} testID="today-scroll">
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{t('errors.loadFailed')}</Text>
            <AppButton label={t('common.retry')} variant="outline" onPress={reload} />
          </View>
        ) : null}

        <View style={s.tiles} testID="today-summary">
          {SUMMARY_GROUPS.map(g => {
            const count = v?.counts[g] ?? 0;
            const style = TILE[g];
            return (
              <TouchableOpacity key={g} style={[s.tile, { backgroundColor: count ? style.bg : colors.card }]} onPress={() => openQueue({ group: g, locationId })} accessibilityRole="button" accessibilityLabel={`${t(`group.${g}`)}: ${count}`} testID={`tile-${g}`}>
                <Ionicons name={style.icon as any} size={18} color={count ? style.fg : colors.textFaint} />
                <Text style={[s.tileCount, { color: count ? style.fg : colors.textFaint }]}>{count}</Text>
                <Text style={[s.tileLabel, { color: count ? style.fg : colors.textMuted }]} numberOfLines={2}>{t(`group.${g}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ReminderIntroCard />

        {v && v.locations.length > 0 ? (
          <View style={s.chips}>
            <FilterChip label={t('today.allPlaces')} active={!locationId} onPress={() => setLocationId(undefined)} />
            {v.locations.map(l => <FilterChip key={l.id} label={l.name} active={locationId === l.id} onPress={() => setLocationId(locationId === l.id ? undefined : l.id)} />)}
          </View>
        ) : null}

        {hasKinds.opened || hasKinds.prepared ? (
          <View style={s.kindRow}>
            {hasKinds.opened ? <FilterChip label={t('today.openedItems')} active={false} onPress={() => openQueue({ kind: 'opened', locationId })} /> : null}
            {hasKinds.prepared ? <FilterChip label={t('today.preparedItems')} active={false} onPress={() => openQueue({ kind: 'prepared', locationId })} /> : null}
          </View>
        ) : null}

        <View style={s.actionsRow}>
          <AppButton label={t('today.startCheck')} icon="checkmark-done-outline" variant="outline" onPress={() => nav.navigate('CheckRound', { query: locationId ? { locationId } : undefined })} style={s.flex} />
          <AppButton label={t('today.quickAdd')} icon="add" onPress={() => nav.navigate('AddBoughtIn')} style={s.flex} />
        </View>

        <Text style={s.sectionTitle}>{t('today.nextActions')}</Text>
        {v && next.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title={t('today.nothingTitle')} body={v.ranked.length ? t('today.nothingBody') : t('today.emptyBody')} testID="today-empty" />
        ) : null}
        {next.slice(0, NEXT_LIMIT).map(r => {
          const g = groupOf(r.evaluation.status);
          const action = primaryActionFor(r.batch, g);
          return (
            <BatchCard
              key={r.batch.id}
              batch={r.batch}
              evaluation={r.evaluation}
              locationName={v?.locationName(r.batch.locationId)}
              onPress={() => nav.navigate('BatchDetail', { id: r.batch.id })}
              action={{ label: t(`cardAction.${action}`), onPress: () => nav.navigate('BatchDetail', { id: r.batch.id }) }}
              testID={`next-${r.batch.id}`}
            />
          );
        })}
        {next.length > NEXT_LIMIT ? (
          <AppButton label={t('today.seeAll', { count: next.length })} variant="ghost" onPress={() => openQueue({ group: 'attention', locationId })} />
        ) : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '31%', flexGrow: 1, minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 2 },
  tileCount: { ...typography.screenTitle },
  tileLabel: { ...typography.bodySm, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  kindRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  sectionTitle: { ...typography.cardTitle, color: colors.textDark, marginTop: spacing.sm },
  errorBox: { backgroundColor: colors.softRed, borderRadius: 12, padding: 12, gap: 8 },
  errorText: { ...typography.body, color: colors.dangerRed },
});
