/**
 * E14 — Add tab root. The same five ways to add in every workspace mode; the mode only changes the order and which
 * choice is emphasised (§6: modes change suggestions, never the data model).
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { WorkspaceHeader } from '../../../components/WorkspaceHeader';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { useActiveWorkspace } from '../../workspaces/workspaceStore';
import { choiceOrder, type AddChoice } from '../addForms';

type Nav = NativeStackNavigationProp<TabStackParamList>;

const ICONS: Record<AddChoice, string> = {
  scan: 'barcode-outline',
  bought_in: 'cube-outline',
  opened: 'beaker-outline',
  prepared: 'restaurant-outline',
  other: 'calendar-outline',
};

export const AddChoiceScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const ws = useActiveWorkspace();
  const order = choiceOrder(ws?.mode);

  const go = (c: AddChoice) => {
    switch (c) {
      case 'scan': nav.navigate('BarcodeScanner', { purpose: 'add' }); break;
      case 'bought_in': nav.navigate('AddBoughtIn', undefined); break;
      case 'opened': nav.navigate('AddOpened', undefined); break;
      case 'prepared': nav.navigate('AddPrepared', undefined); break;
      case 'other': nav.navigate('AddOtherDated', undefined); break;
    }
  };

  return (
    <View style={s.root}>
      <WorkspaceHeader title={t('add.title')} onSearch={() => nav.navigate('GlobalSearch')} />
      <ScrollView contentContainerStyle={s.content} testID="add-choice-list">
        <Text style={s.intro}>{t(`add.intro.${ws?.mode ?? 'mixed'}`)}</Text>
        {order.map((c, i) => {
          const primary = i === 0;
          return (
            <TouchableOpacity key={c} style={[s.card, primary && s.cardPrimary]} onPress={() => go(c)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`${t(`add.choice.${c}.title`)}. ${t(`add.choice.${c}.body`)}`} testID={`add-choice-${c}`}>
              <View style={[s.icon, primary && s.iconPrimary]}>
                <Ionicons name={ICONS[c] as React.ComponentProps<typeof Ionicons>['name']} size={24} color={primary ? '#fff' : colors.primaryBlue} />
              </View>
              <View style={s.text}>
                <Text style={[s.title, primary && s.titlePrimary]}>{t(`add.choice.${c}.title`)}</Text>
                <Text style={[s.body, primary && s.bodyPrimary]}>{t(`add.choice.${c}.body`)}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={s.links}>
          <TouchableOpacity style={s.link} onPress={() => nav.navigate('RulesList')} accessibilityRole="button" testID="add-link-rules">
            <Ionicons name="time-outline" size={18} color={colors.primaryBlue} />
            <Text style={s.linkText}>{t('add.manageRules')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.link} onPress={() => nav.navigate('LocationsList')} accessibilityRole="button" testID="add-link-locations">
            <Ionicons name="location-outline" size={18} color={colors.primaryBlue} />
            <Text style={s.linkText}>{t('add.manageLocations')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  intro: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, minHeight: 64 },
  cardPrimary: { backgroundColor: colors.primaryBlue, borderColor: colors.primaryBlue },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  iconPrimary: { backgroundColor: colors.warningOrange },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.cardTitle, color: colors.textDark },
  titlePrimary: { color: '#fff' },
  body: { ...typography.bodySm, color: colors.textMuted, lineHeight: 17 },
  bodyPrimary: { color: 'rgba(255,255,255,0.85)' },
  links: { gap: spacing.sm, marginTop: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 4 },
  linkText: { ...typography.body, fontWeight: '600', color: colors.primaryBlue },
});
