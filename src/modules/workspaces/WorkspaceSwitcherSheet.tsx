/**
 * Active-business switcher (§5, §21), opened from the header of every tab root. Adapted from Till Note's global shop
 * switcher overlay idea (`6fa6e941` src/components/GlobalShopSwitcher.ts): one registered sheet, any header can open it.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { AppKeyboardBottomSheet } from '../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../components/AppButton';
import { AppAlert } from '../../components/AppAlert';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import type { Workspace } from '../../domain/expiry/expiryTypes';
import { listWorkspaces, setActiveWorkspace, useActiveWorkspace } from './workspaceStore';
import { getScope } from '../../storage/scope';

type ShowFn = () => void;
let show: ShowFn | null = null;
export const WorkspaceSwitcher = { open(): void { show?.(); } };

export const WorkspaceSwitcherSheet: React.FC<{ onManage: () => void }> = ({ onManage }) => {
  const { t } = useTranslation();
  const active = useActiveWorkspace();
  const [visible, setVisible] = useState(false);
  const [list, setList] = useState<Workspace[]>([]);

  useEffect(() => {
    show = () => { setVisible(true); listWorkspaces().then(setList).catch(() => setList([])); };
    return () => { show = null; };
  }, []);

  const choose = async (w: Workspace) => {
    try { await setActiveWorkspace(w.id); setVisible(false); }
    catch { AppAlert.error(t('errors.saveFailed')); }
  };

  return (
    <AppKeyboardBottomSheet visible={visible} onClose={() => setVisible(false)} title={t('workspace.switchTitle')} footer={(
      <View style={{ gap: 8 }}>
        <AppButton label={t('workspace.manage')} onPress={() => { setVisible(false); onManage(); }} variant="secondary" />
        <AppButton label={t('common.cancel')} onPress={() => setVisible(false)} variant="ghost" />
      </View>
    )}>
      {getScope() === 'demo' ? <Text style={s.demo}>{t('demo.banner')}</Text> : null}
      {list.map(w => (
        <TouchableOpacity key={w.id} style={s.row} onPress={() => choose(w)} accessibilityRole="button" accessibilityState={{ selected: w.id === active?.id }} accessibilityLabel={w.name}>
          <Ionicons name={w.id === active?.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primaryBlue} />
          <View style={s.text}>
            <Text style={s.name}>{w.name}</Text>
            <Text style={s.meta}>{t(`mode.${w.mode}`)}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </AppKeyboardBottomSheet>
  );
};

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.rule2, minHeight: 48 },
  text: { flex: 1, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  demo: { ...typography.bodySm, color: '#7A3D08', backgroundColor: '#FBE2C8', borderRadius: 10, padding: 10, marginBottom: 8 },
});
