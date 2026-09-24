/**
 * E20 Rules — the business's own after-opening, preparation and review rules. TillExpiry ships none and suggests no
 * durations; each rule shows where its duration comes from. Hidden rules can be shown and brought back.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ExpiryRule, RuleAppliesTo } from '../../../domain/expiry/expiryTypes';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listRules } from '../ruleStore';
import { ruleSummary } from '../../add/components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;
const GROUPS: RuleAppliesTo[] = ['after_opening', 'after_preparation', 'manual_review'];

export const RulesListScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [showHidden, setShowHidden] = useState(false);
  const { data } = useWorkspaceData(w => listRules(w.id, { includeHidden: true }));
  const visible = useMemo(() => (data ?? []).filter(r => showHidden || r.status === 'active'), [data, showHidden]);
  const hiddenCount = (data ?? []).filter(r => r.status === 'hidden').length;

  const row = (r: ExpiryRule) => (
    <TouchableOpacity key={r.id} style={[s.card, r.status === 'hidden' && s.cardHidden]} onPress={() => nav.navigate('RuleEdit', { id: r.id })} accessibilityRole="button" testID={`rule-${r.id}`}>
      <Text style={s.name}>{r.name}</Text>
      <Text style={s.meta}>{ruleSummary(t, r)}</Text>
      <Text style={s.meta}>{t('rules.sourceLine', { source: r.sourceText })}</Text>
      {r.storageInstruction ? <Text style={s.meta}>{t('rules.storageLine', { text: r.storageInstruction })}</Text> : null}
      <Text style={s.faint}>{[t('rules.versionLine', { version: r.version }), r.status === 'hidden' ? t('rules.hiddenTag') : null].filter(Boolean).join(' · ')}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={t('rules.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>{t('rules.intro')}</Text>
        <AppButton label={t('rules.new')} onPress={() => nav.navigate('RuleEdit', undefined)} testID="rule-new" />
        {hiddenCount ? <View style={s.chips}><FilterChip label={t('rules.showHidden', { count: hiddenCount })} active={showHidden} onPress={() => setShowHidden(x => !x)} /></View> : null}
        {data && !visible.length ? <EmptyState icon="time-outline" title={t('rules.emptyTitle')} body={t('rules.emptyBody')} /> : null}
        {GROUPS.map(g => {
          const list = visible.filter(r => r.appliesTo === g);
          if (!list.length) return null;
          return (
            <View key={g} style={s.group}>
              <Text style={s.groupTitle}>{t(`rules.appliesTo.${g}`)}</Text>
              {list.map(row)}
            </View>
          );
        })}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  intro: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  group: { gap: spacing.sm },
  groupTitle: { ...typography.sectionLabel, color: colors.textMuted },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 3 },
  cardHidden: { opacity: 0.7 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  faint: { ...typography.bodySm, color: colors.textFaint },
});
