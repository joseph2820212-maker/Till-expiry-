import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, I18nManager } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { WorkspaceHeader } from '../../../components/WorkspaceHeader';
import { SettingsSection } from '../../../components/settings/SettingsSection';
import { SettingsRow } from '../../../components/settings/SettingsRow';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';

type Nav = NativeStackNavigationProp<TabStackParamList>;

const Tile: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; body: string; onPress: () => void; testID: string }> = ({ icon, title, body, onPress, testID }) => (
  <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title} testID={testID}>
    <View style={s.tileIcon}><Ionicons name={icon} size={22} color={colors.primaryBlue} /></View>
    <View style={s.tileText}>
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.tileBody}>{body}</Text>
    </View>
    <Ionicons name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textFaint} />
  </TouchableOpacity>
);

/** E27 Reports tab root: the expiry and waste reports, plus the data import / export entry points. */
export const ReportsHomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  return (
    <View style={s.root}>
      <WorkspaceHeader title={t('reports.title')} onSearch={() => nav.navigate('GlobalSearch')} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.tiles}>
          <Tile icon="calendar-outline" title={t('reports.expiryTitle')} body={t('reports.expiryTileBody')} onPress={() => nav.navigate('ExpiryReport')} testID="reports-expiry" />
          <Tile icon="trash-outline" title={t('reports.wasteTitle')} body={t('reports.wasteTileBody')} onPress={() => nav.navigate('WasteReport')} testID="reports-waste" />
        </View>
        <SettingsSection title={t('reports.dataGroup')} footer={t('reports.dataFooter')}>
          <SettingsRow iconNode={<Ionicons name="download-outline" size={18} color={colors.primaryBlue} />} label={t('reports.dataExport')} subtitle={t('reports.dataExportSub')} onPress={() => nav.navigate('DataExport')} testID="reports-data-export" />
          <SettingsRow iconNode={<Ionicons name="pricetags-outline" size={18} color={colors.primaryBlue} />} label={t('reports.importProducts')} subtitle={t('reports.importProductsSub')} onPress={() => nav.navigate('CsvImport', { kind: 'products' })} testID="reports-import-products" />
          <SettingsRow iconNode={<Ionicons name="layers-outline" size={18} color={colors.primaryBlue} />} label={t('reports.importBatches')} subtitle={t('reports.importBatchesSub')} onPress={() => nav.navigate('CsvImport', { kind: 'batches' })} testID="reports-import-batches" isLast />
        </SettingsSection>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.lg },
  tiles: { gap: spacing.cardGap },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: spacing.cardPadding, minHeight: 64 },
  tileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  tileText: { flex: 1, minWidth: 0, gap: 3 },
  tileTitle: { ...typography.cardTitle, color: colors.textDark },
  tileBody: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
});
