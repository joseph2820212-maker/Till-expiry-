import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { EmptyState } from '../../../components/EmptyState';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { localDateShort } from '../../../utils/locale';
import { localDateOf, localTimeOf } from '../../../domain/expiry/datePrecision';
import type { BatchEvent, DeadlineInfo } from '../../../domain/expiry/expiryTypes';
import { getBatch, listBatchEvents } from '../batchStore';
import { deadlineLine } from '../format';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

type T = (k: string, o?: Record<string, unknown>) => string;

/** Old → new for the fields a correction can change; everything else in before/after is internal. */
export function eventChange(t: T, e: BatchEvent, tz: string): string | null {
  const b = e.before as Record<string, unknown> | undefined;
  const a = e.after as Record<string, unknown> | undefined;
  if (!b || !a) return null;
  if (b.effective && a.effective) return t('history.change', { from: deadlineLine(t, b.effective as DeadlineInfo, tz), to: deadlineLine(t, a.effective as DeadlineInfo, tz) });
  if ('quantityRemaining' in a) return t('history.change', { from: b.quantityRemaining ?? t('batch.notCounted'), to: a.quantityRemaining ?? t('batch.notCounted') });
  return null;
}

/** E13 — the append-only history of a batch, newest first. Corrections show before → after and the reason. */
export const BatchHistoryScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<TabStackParamList, 'BatchHistory'>>();
  const { data } = useWorkspaceData(async ws => ({ batch: await getBatch(ws.id, params.id), events: await listBatchEvents(ws.id, params.id) }));
  const tz = data?.batch?.timeZone ?? 'UTC';
  const events = data ? [...data.events].sort((x, y) => y.at.localeCompare(x.at)) : [];
  return (
    <View style={s.root}>
      <ScreenHeader title={t('history.title')} subtitle={data?.batch?.productName} onBack={() => nav.goBack()} />
      <FlatList
        data={events}
        keyExtractor={e => e.id}
        contentContainerStyle={s.list}
        initialNumToRender={20}
        ListEmptyComponent={data ? <EmptyState icon="time-outline" title={t('history.emptyTitle')} body={t('history.emptyBody')} /> : null}
        renderItem={({ item: e }) => {
          const ms = Date.parse(e.at);
          const change = eventChange(t, e, tz);
          const reason = e.reason ? (e.type === 'wasted' ? t(`wasteReason.${e.reason}`, { defaultValue: e.reason }) : e.reason) : null;
          return (
            <View style={s.item} testID={`event-${e.type}`}>
              <Text style={s.type}>{t(`event.${e.type}`)}{e.quantity !== undefined && e.type !== 'quantity_corrected' ? ` · ${t('history.qty', { count: e.quantity })}` : ''}</Text>
              <Text style={s.when}>{localDateShort(localDateOf(ms, tz))}, {localTimeOf(ms, tz)}</Text>
              {(e.after as { fromParent?: string } | undefined)?.fromParent ? <Text style={s.detail}>{t('history.fromParent')}</Text> : null}
              {change ? <Text style={s.detail}>{change}</Text> : null}
              {reason ? <Text style={s.detail}>{t('history.reason', { reason })}</Text> : null}
              {e.note ? <Text style={s.detail}>{e.note}</Text> : null}
            </View>
          );
        }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  item: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3 },
  type: { ...typography.body, color: colors.textDark, fontWeight: '700' },
  when: { ...typography.bodySm, color: colors.textMuted },
  detail: { ...typography.bodySm, color: colors.textDark },
});
