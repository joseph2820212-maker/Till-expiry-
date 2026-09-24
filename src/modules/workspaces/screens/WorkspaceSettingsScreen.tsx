import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { deviceTimeZone } from '../../../domain/expiry/datePrecision';
import { DomainError } from '../../../storage/repoHelpers';
import { createWorkspace, hideWorkspace, listWorkspaces, updateWorkspace } from '../workspaceStore';
import { WorkspaceForm, type WorkspaceFormValue } from '../WorkspaceForm';
import { addSuggestedLocations } from '../../locations/suggestedLocations';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/**
 * E38 — create or edit a business. Changing the time zone changes how "today" is counted from now on; saved dates keep
 * their meaning. Hiding keeps every record (archive, not delete) and needs a confirmation.
 */
export const WorkspaceSettingsScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'WorkspaceSettings'>>();
  const creating = !!params?.create || !params?.id;
  const [value, setValue] = useState<WorkspaceFormValue | null>(creating ? { name: '', mode: 'retail', currency: '', timeZone: deviceTimeZone() } : null);
  const [places, setPlaces] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (creating || !params?.id) return;
    listWorkspaces({ includeHidden: true }).then(all => {
      const w = all.find(x => x.id === params.id);
      if (w) setValue({ name: w.name, mode: w.mode, currency: w.currency, timeZone: w.timeZone });
    }).catch(() => AppAlert.error(t('errors.loadFailed')));
  }, [creating, params?.id, t]);

  const run = async (fn: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); nav.goBack(); }
    catch (e) { AppAlert.error(t(`errors.${e instanceof DomainError ? e.code : 'saveFailed'}`)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  const save = () => {
    if (!value) return;
    if (!value.name.trim()) { setError(t('errors.workspaceNameRequired')); return; }
    void run(async () => {
      if (creating) {
        const ws = await createWorkspace(value, { makeActive: true });
        if (places) await addSuggestedLocations(ws.id, ws.mode, t);
      } else {
        await updateWorkspace(params!.id!, value);
      }
    });
  };

  const hide = () => AppAlert.alert(t('workspace.hideTitle'), t('workspace.hideBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('workspace.hide'), style: 'destructive', onPress: () => { void run(() => hideWorkspace(params!.id!)); } },
  ]);

  return (
    <View style={s.root}>
      <ScreenHeader title={t(creating ? 'workspace.addTitle' : 'workspace.editTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {value ? (
          <>
            <Section>
              <WorkspaceForm value={value} onChange={v => { setValue(v); setError(undefined); }} nameError={error} />
            </Section>
            {creating ? (
              <Section>
                <CheckboxRow label={t('onboarding.suggestedPlaces')} checked={places} onToggle={() => setPlaces(x => !x)} />
                <Hint text={t('onboarding.suggestedPlacesHint')} />
              </Section>
            ) : <Hint text={t('workspace.zoneChangeHint')} />}
            <AppButton label={t('common.save')} onPress={save} loading={busy} disabled={busy} testID="ws-save" />
            {!creating ? <AppButton label={t('workspace.hide')} variant="dangerLink" onPress={hide} disabled={busy} /> : null}
          </>
        ) : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
