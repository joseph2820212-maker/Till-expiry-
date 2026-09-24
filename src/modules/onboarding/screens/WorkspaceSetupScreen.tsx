import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { CheckboxRow } from '../../../components/CheckboxRow';
import { AppAlert } from '../../../components/AppAlert';
import { Section, Hint } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { deviceTimeZone } from '../../../domain/expiry/datePrecision';
import { DomainError } from '../../../storage/repoHelpers';
import { createWorkspace } from '../../workspaces/workspaceStore';
import { WorkspaceForm, type WorkspaceFormValue } from '../../workspaces/WorkspaceForm';
import { addSuggestedLocations } from '../../locations/suggestedLocations';
import type { OnboardingParamList } from '../OnboardingNavigator';

/** E03 — name, currency and time zone of the first workspace. Creating it opens the app. */
export const WorkspaceSetupScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<OnboardingParamList, 'WorkspaceSetup'>>();
  const [value, setValue] = useState<WorkspaceFormValue>({ name: '', mode: params.mode, currency: '', timeZone: deviceTimeZone() });
  const [places, setPlaces] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const create = async () => {
    if (inFlight.current) return;
    if (!value.name.trim()) { setError(t('errors.workspaceNameRequired')); return; }
    inFlight.current = true; setBusy(true);
    try {
      const ws = await createWorkspace(value);
      if (places) await addSuggestedLocations(ws.id, ws.mode, t);
    } catch (e) {
      AppAlert.error(t(`errors.${e instanceof DomainError ? e.code : 'saveFailed'}`));
      inFlight.current = false; setBusy(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('onboarding.setupTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Section>
          <WorkspaceForm value={value} onChange={v => { setValue(v); setError(undefined); }} nameError={error} />
        </Section>
        <Section>
          <CheckboxRow label={t('onboarding.suggestedPlaces')} checked={places} onToggle={() => setPlaces(x => !x)} />
          <Hint text={t('onboarding.suggestedPlacesHint')} />
        </Section>
        <AppButton label={t('onboarding.create')} onPress={create} loading={busy} disabled={busy} testID="onb-create" />
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
