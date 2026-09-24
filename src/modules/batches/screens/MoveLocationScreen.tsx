import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { RadioRow } from '../../../components/RadioRow';
import { EmptyState } from '../../../components/EmptyState';
import { Field, Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { newId } from '../../../storage/entityStore';
import { BATCH_LIMITS, getBatch, moveBatch } from '../batchStore';
import { listLocations } from '../../locations/locationStore';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/** E26 — move a batch to another place. Moving never extends or changes its deadline (T10); it is recorded in history. */
export const MoveLocationScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'MoveLocation'>>();
  const { data } = useWorkspaceData(async ws => ({ batch: await getBatch(ws.id, params.id), locations: await listLocations(ws.id) }));
  const [target, setTarget] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef(newId('req'));

  const save = async () => {
    if (!data?.batch || !target || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await moveBatch(data.batch.workspaceId, data.batch.id, target, note.trim() || undefined, requestId.current); nav.goBack(); }
    catch { AppAlert.error(t('errors.saveFailed')); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const choices = data?.locations.filter(l => l.id !== data.batch?.locationId) ?? [];
  return (
    <View style={s.root}>
      <ScreenHeader title={t('move.title')} subtitle={data?.batch?.productName} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {data && !choices.length ? (
          <>
            <EmptyState icon="location-outline" title={t('move.noneTitle')} body={t('move.noneBody')} />
            <AppButton label={t('move.addPlace')} variant="outline" onPress={() => nav.navigate('LocationDetail')} />
          </>
        ) : null}
        {choices.length ? (
          <Section title={t('move.to')}>
            {choices.map(l => <RadioRow key={l.id} label={l.name} selected={target === l.id} onSelect={() => setTarget(l.id)} />)}
          </Section>
        ) : null}
        <Hint text={t('move.hint')} />
        <Field label={t('move.note')} value={note} onChangeText={setNote} maxLength={BATCH_LIMITS.reason} placeholder={t('common.optional')} />
        <AppButton label={t('move.save')} onPress={save} disabled={!target || busy} loading={busy} testID="move-save" />
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
