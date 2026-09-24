import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { ToggleSegment } from '../../../components/ToggleSegment';
import { DocBlocks, type ContentDoc } from '../../../components/DocBlocks';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { getGuideChapters, getFaqChapters } from '../content/helpContent';

type Tab = 'guide' | 'faq';
const TABS: Tab[] = ['guide', 'faq'];

/** Help: the how-to guide and the questions shop owners ask. */
export const HelpScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'SettingsHelp'>>();
  const [tab, setTab] = useState<Tab>(route.params?.tab ?? 'guide');
  const [open, setOpen] = useState<string | null>(route.params?.chapter ?? null);
  const guide = useMemo(() => getGuideChapters(t), [t]);
  const faq = useMemo(() => getFaqChapters(t), [t]);
  const chapters: ContentDoc[] = tab === 'guide' ? guide : faq;
  const tabLabel = (k: Tab) => (k === 'guide' ? t('help.tabGuide') : t('help.tabFaq'));
  const tabIntro = tab === 'guide' ? t('help.guideIntro') : t('help.faqIntro');
  const tabIcon = tab === 'guide' ? 'book-outline' : 'help-circle-outline';

  return (
    <View style={s.root}>
      <ScreenHeader title={t('help.title')} onBack={() => nav.goBack()} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <ToggleSegment options={TABS.map(tabLabel)} selected={tabLabel(tab)} onSelect={v => { setTab(TABS.find(k => tabLabel(k) === v) ?? 'guide'); setOpen(null); }} />
        <Text style={s.intro}>{tabIntro}</Text>
        {chapters.map(ch => {
          const isOpen = open === ch.id;
          return (
            <View key={ch.id} style={s.card}>
              <TouchableOpacity style={s.head} onPress={() => setOpen(isOpen ? null : ch.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <Ionicons name={tabIcon} size={18} color={colors.primaryBlue} />
                <Text style={s.title} numberOfLines={2}>{ch.title}</Text>
                <Text style={s.chev}>{isOpen ? '▾' : I18nManager.isRTL ? '‹' : '›'}</Text>
              </TouchableOpacity>
              {isOpen ? <View style={s.docBody}><DocBlocks doc={ch} /></View> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  intro: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18, marginVertical: spacing.md },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  title: { ...typography.cardTitle, color: colors.textDark, flex: 1 },
  chev: { ...typography.body, color: colors.textFaint },
  docBody: { paddingHorizontal: 14, paddingBottom: 14 },
});
