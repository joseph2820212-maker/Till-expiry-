import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { BatchCard } from '../../../components/status/BatchCard';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { newId } from '../../../storage/entityStore';
import { checkBatch } from '../../batches/batchStore';
import { filterRanked, loadWorkspaceView } from '../workspaceView';
import { reasonLine } from '../../batches/format';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/**
 * E07 — a date-check round: walk the shelf item by item, most urgent first. "Checked" records a check event only; it
 * never changes a date or a status (T20). A wrong date goes to Deadline correction with a reason; anything to remove
 * opens the batch's actions.
 */
export const CheckRoundScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'CheckRound'>>();
  const { data: v, workspace } = useWorkspaceData(ws => loadWorkspaceView(ws));
  /** The round's order is frozen when it starts so items do not jump while you work through them. */
  const [order, setOrder] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (v && order === null) setOrder(filterRanked(v, params?.query).map(r => r.batch.id));
  }, [v, order, params?.query]);

  const byId = new Map(v?.ranked.map(r => [r.batch.id, r]) ?? []);
  // Items removed during the round (used up, wasted) simply drop out.
  const remaining = (order ?? []).slice(index).filter(id => byId.has(id));
  const current = remaining.length ? byId.get(remaining[0]) : undefined;
  const advance = () => { if (current) setIndex((order ?? []).indexOf(current.batch.id) + 1); };

  const markChecked = async () => {
    if (!current || !workspace || inFlight.current) return;
    inFlight.current = true;
    try {
      await checkBatch(workspace.id, current.batch.id, newId('req'));
      setChecked(c => c + 1);
      advance();
    } catch {
      AppAlert.error(t('errors.saveFailed'));
    } finally { inFlight.current = false; }
  };

  const total = order?.length ?? 0;
  const position = order && current ? order.indexOf(current.batch.id) + 1 : total;

  return (
    <View style={s.root}>
      <ScreenHeader title={t('check.title')} subtitle={order ? t('check.progress', { current: Math.min(position, total), total }) : undefined} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {order && !current ? (
          <>
            <EmptyState icon="checkmark-done-circle-outline" title={t('check.doneTitle')} body={total ? t('check.doneBody', { count: checked }) : t('check.nothing')} testID="check-done" />
            <AppButton label={t('common.done')} onPress={() => nav.goBack()} />
          </>
        ) : null}
        {current ? (
          <>
            <Text style={s.hint}>{t('check.hint')}</Text>
            <BatchCard batch={current.batch} evaluation={current.evaluation} locationName={v?.locationName(current.batch.locationId)} onPress={() => nav.navigate('BatchDetail', { id: current.batch.id })} />
            <Text style={s.reason}>{reasonLine(t, current.batch.effective)}</Text>
            <AppButton label={t('check.confirm')} icon="checkmark" onPress={markChecked} testID="check-confirm" />
            <AppButton label={t('check.wrongDate')} variant="outline" onPress={() => nav.navigate('DeadlineCorrection', { id: current.batch.id })} />
            <AppButton label={t('check.removeSome')} variant="outline" onPress={() => nav.navigate('BatchDetail', { id: current.batch.id })} />
            <AppButton label={t('check.skip')} variant="ghost" onPress={advance} testID="check-skip" />
          </>
        ) : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  hint: { ...typography.bodySm, color: colors.textMuted },
  reason: { ...typography.bodySm, color: colors.textMuted },
});
