import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';
import { HeaderTopBleed } from './HeaderTopBleed';
import { useActiveWorkspace } from '../modules/workspaces/workspaceStore';
import { WorkspaceSwitcher } from '../modules/workspaces/WorkspaceSwitcherSheet';
import { getScope } from '../storage/scope';

/**
 * Navy header of every tab root (TillCalc TabRootHeader look): screen title, the active business (tap to switch) and
 * search. No settings icon here — settings live in More only.
 */
export const WorkspaceHeader: React.FC<{ title: string; onSearch?: () => void }> = ({ title, onSearch }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ws = useActiveWorkspace();
  const demo = getScope() === 'demo';
  return (
    <>
      <HeaderTopBleed color={colors.primaryBlue} />
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryBlue} />
      <View style={[s.header, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={s.row}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {onSearch ? (
            <TouchableOpacity onPress={onSearch} style={s.icon} accessibilityRole="button" accessibilityLabel={t('search.title')} testID="header-search">
              <Ionicons name="search" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={() => WorkspaceSwitcher.open()} style={s.ws} accessibilityRole="button" accessibilityLabel={t('workspace.switchA11y', { name: ws?.name ?? '' })} testID="header-workspace">
          {demo ? <Text style={s.demo}>{t('demo.tag')}</Text> : null}
          <Text style={s.wsName} numberOfLines={1}>{ws?.name ?? ''}</Text>
          <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>
      </View>
    </>
  );
};

const s = StyleSheet.create({
  header: { backgroundColor: colors.primaryBlue, paddingHorizontal: spacing.screenPadding, paddingBottom: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typography.screenTitle, color: '#fff', flex: 1 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ws: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 },
  wsName: { ...typography.bodySm, color: 'rgba(255,255,255,0.85)', fontWeight: '600', flexShrink: 1 },
  demo: { ...typography.micro, color: '#1A2540', backgroundColor: colors.warningOrange, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', fontWeight: '800' },
});
