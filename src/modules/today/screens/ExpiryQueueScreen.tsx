import React, { useMemo } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { EmptyState } from '../../../components/EmptyState';
import { BatchCard } from '../../../components/status/BatchCard';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { filterRanked, loadWorkspaceView } from '../workspaceView';
import type { BatchQuery, TabStackParamList } from '../../../navigation/AppNavigator';

type T = (k: string, o?: Record<string, unknown>) => string;

export function queryTitle(t: T, q: BatchQuery | undefined, locationName?: string): string {
  const parts: string[] = [];
  if (q?.group) parts.push(t(q.group === 'attention' ? 'today.nextActions' : `group.${q.group}`));
  if (q?.kind) parts.push(t(`batchKind.${q.kind}`));
  if (locationName) parts.push(locationName);
  return parts.length ? parts.join(' · ') : t('queue.all');
}

/** E06 — a filtered, urgency-sorted work list (virtualised). */
export const ExpiryQueueScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'ExpiryQueue'>>();
  const query = params?.query;
  const { data: v } = useWorkspaceData(ws => loadWorkspaceView(ws));
  const rows = useMemo(() => (v ? filterRanked(v, query) : []), [v, query]);
  const title = queryTitle(t, query, v?.locationName(query?.locationId));

  return (
    <View style={s.root}>
      <ScreenHeader title={title} subtitle={v ? t('queue.count', { count: rows.length }) : undefined} onBack={() => nav.goBack()} />
      <FlatList
        data={rows}
        keyExtractor={r => r.batch.id}
        contentContainerStyle={s.content}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        testID="queue-list"
        ListEmptyComponent={v ? <EmptyState icon="checkmark-circle-outline" title={t('queue.emptyTitle')} body={t('queue.emptyBody')} /> : null}
        renderItem={({ item: r }) => (
          <BatchCard batch={r.batch} evaluation={r.evaluation} locationName={v?.locationName(r.batch.locationId)} onPress={() => nav.navigate('BatchDetail', { id: r.batch.id })} />
        )}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
});
