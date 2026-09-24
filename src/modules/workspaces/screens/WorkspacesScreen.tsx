import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { Workspace } from '../../../domain/expiry/expiryTypes';
import { listWorkspaces, restoreWorkspace, setActiveWorkspace, useActiveWorkspace } from '../workspaceStore';
import type { TabStackParamList } from '../../../navigation/AppNavigator';

/** E38 list — every business on this phone. Exactly one is active; hidden ones keep their data and can be restored. */
export const WorkspacesScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const active = useActiveWorkspace();
  const [all, setAll] = React.useState<Workspace[]>([]);
  const inFlight = useRef(false);
  const load = React.useCallback(() => { listWorkspaces({ includeHidden: true }).then(setAll).catch(() => AppAlert.error(t('errors.loadFailed'))); }, [t]);
  useFocusEffect(load);
  React.useEffect(load, [active?.id, load]);

  const act = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { await fn(); load(); } catch { AppAlert.error(t('errors.saveFailed')); } finally { inFlight.current = false; }
  };

  const visible = all.filter(w => w.status === 'active');
  const hidden = all.filter(w => w.status === 'hidden');
  return (
    <View style={s.root}>
      <ScreenHeader title={t('workspace.listTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Text style={s.hint}>{t('workspace.listHint')}</Text>
        {visible.map(w => (
          <View key={w.id} style={[s.card, w.id === active?.id && s.cardOn]}>
            <TouchableOpacity style={s.main} onPress={() => { void act(() => setActiveWorkspace(w.id)); }} accessibilityRole="radio" accessibilityState={{ selected: w.id === active?.id }} accessibilityLabel={w.name} testID={`ws-${w.id}`}>
              <Ionicons name={w.id === active?.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primaryBlue} />
              <View style={s.text}>
                <Text style={s.name}>{w.name}</Text>
                <Text style={s.meta}>{[t(`mode.${w.mode}`), w.currency || t('workspace.currencyNone'), w.timeZone].join(' · ')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.edit} onPress={() => nav.navigate('WorkspaceSettings', { id: w.id })} accessibilityRole="button" accessibilityLabel={t('workspace.editA11y', { name: w.name })}>
              <Ionicons name="create-outline" size={20} color={colors.primaryBlue} />
            </TouchableOpacity>
          </View>
        ))}
        <AppButton label={t('workspace.add')} icon="add" variant="outline" onPress={() => nav.navigate('WorkspaceSettings', { create: true })} testID="ws-add" />
        {hidden.length ? (
          <>
            <Text style={s.section}>{t('workspace.hiddenTitle')}</Text>
            {hidden.map(w => (
              <View key={w.id} style={s.card}>
                <View style={[s.main, s.text]}><Text style={s.name}>{w.name}</Text></View>
                <AppButton label={t('workspace.restore')} variant="ghost" onPress={() => { void act(() => restoreWorkspace(w.id)); }} />
              </View>
            ))}
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
  section: { ...typography.cardTitle, color: colors.textDark, marginTop: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  cardOn: { borderColor: colors.primaryBlue, borderWidth: 1.5 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: 56 },
  text: { flex: 1, minWidth: 0 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  edit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
