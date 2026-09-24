import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '../../components/ScreenHeader';
import { AppTextInput } from '../../components/AppTextInput';
import { EmptyState } from '../../components/EmptyState';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useWorkspaceData } from '../../hooks/useWorkspaceData';
import { buildSearchIndex, searchIndex, type SearchHit } from './searchIndex';
import type { TabStackParamList } from '../../navigation/AppNavigator';

const ICON: Record<SearchHit['type'], string> = { product: 'cube-outline', batch: 'calendar-outline', location: 'location-outline', rule: 'timer-outline', supplier: 'business-outline' };

/** E08 — search the active workspace only; each result opens its own screen. */
export const GlobalSearchScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<TabStackParamList>>();
  const [query, setQuery] = useState('');
  const { data: index, workspace } = useWorkspaceData(ws => buildSearchIndex(ws.id));
  const hits = useMemo(() => (index && index.workspaceId === workspace?.id ? searchIndex(index, query) : []), [index, workspace?.id, query]);

  const open = (h: SearchHit) => {
    switch (h.type) {
      case 'product': return nav.navigate('ProductDetail', { id: h.id });
      case 'batch': return nav.navigate('BatchDetail', { id: h.id });
      case 'location': return nav.navigate('LocationDetail', { id: h.id });
      case 'rule': return nav.navigate('RuleEdit', { id: h.id });
      case 'supplier': return nav.navigate('Items', { mode: 'products', text: h.title });
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={t('search.title')} subtitle={workspace?.name} onBack={() => nav.goBack()} />
      <View style={s.box}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <AppTextInput style={s.input} value={query} onChangeText={setQuery} placeholder={t('search.placeholder')} placeholderTextColor={colors.textFaint} autoFocus accessibilityLabel={t('search.title')} testID="search-input" />
      </View>
      <FlatList
        data={hits}
        keyExtractor={h => `${h.type}:${h.id}`}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        ListEmptyComponent={query.trim() && index ? <EmptyState icon="search-outline" title={t('search.noneTitle')} body={t('search.noneBody')} /> : <Text style={s.hint}>{t('search.hint')}</Text>}
        renderItem={({ item: h }) => (
          <TouchableOpacity style={s.row} onPress={() => open(h)} accessibilityRole="button" accessibilityLabel={`${t(`search.type.${h.type}`)}: ${h.title}`} testID={`hit-${h.type}-${h.id}`}>
            <Ionicons name={ICON[h.type] as any} size={20} color={colors.primaryBlue} />
            <View style={s.rowText}>
              <Text style={s.title} numberOfLines={1}>{h.title}</Text>
              <Text style={s.detail} numberOfLines={1}>{[t(`search.type.${h.type}`), 'detail' in h ? h.detail : undefined].filter(Boolean).join(' · ')}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: spacing.screenPadding, marginBottom: 0, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  input: { flex: 1, minHeight: 46, ...typography.body, color: colors.textDark },
  list: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: 6 },
  hint: { ...typography.bodySm, color: colors.textMuted, textAlign: 'center', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1, minWidth: 0 },
  title: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  detail: { ...typography.bodySm, color: colors.textMuted },
});
