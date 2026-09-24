/**
 * E22 Locations — the business's fridges, freezers, shelves… with how many active items each holds. Hidden places
 * can be shown and brought back. Moving an item between places never changes its date.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { EmptyState } from '../../../components/EmptyState';
import { FilterChip } from '../../../components/FilterChip';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listLocations } from '../locationStore';
import { listBatches } from '../../batches/batchStore';
import { countByLocation } from './locationCounts';

type Nav = NativeStackNavigationProp<TabStackParamList>;


export const LocationsListScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const [showHidden, setShowHidden] = useState(false);
  const { data } = useWorkspaceData(async w => ({ locations: await listLocations(w.id, { includeHidden: true }), counts: countByLocation(await listBatches(w.id)) }));
  const visible = useMemo(() => (data?.locations ?? []).filter(l => showHidden || l.status === 'active'), [data, showHidden]);
  const hiddenCount = (data?.locations ?? []).filter(l => l.status === 'hidden').length;

  return (
    <View style={s.root}>
      <ScreenHeader title={t('locations.title')} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>{t('locations.intro')}</Text>
        <AppButton label={t('locations.new')} onPress={() => nav.navigate('LocationDetail', undefined)} testID="location-new" />
        {hiddenCount ? <View style={s.chips}><FilterChip label={t('locations.showHidden', { count: hiddenCount })} active={showHidden} onPress={() => setShowHidden(x => !x)} /></View> : null}
        {data && !visible.length ? <EmptyState icon="location-outline" title={t('locations.emptyTitle')} body={t('locations.emptyBody')} /> : null}
        {visible.map(l => (
          <TouchableOpacity key={l.id} style={[s.card, l.status === 'hidden' && s.cardHidden]} onPress={() => nav.navigate('LocationDetail', { id: l.id })} accessibilityRole="button" testID={`location-${l.id}`}>
            <View style={s.text}>
              <Text style={s.name}>{l.name}</Text>
              <Text style={s.meta}>{[t(`locationKind.${l.kind}`), l.status === 'hidden' ? t('locations.hiddenTag') : null].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={s.count}>{t('locations.activeCount', { count: data?.counts.get(l.id) ?? 0 })}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  intro: { ...typography.body, color: colors.textMuted, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  cardHidden: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.cardTitle, color: colors.textDark },
  meta: { ...typography.bodySm, color: colors.textMuted },
  count: { ...typography.bodySm, fontWeight: '700', color: colors.primaryBlue, flexShrink: 0, maxWidth: '40%', textAlign: 'right' },
});
