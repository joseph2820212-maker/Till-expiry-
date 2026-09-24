import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { DocBlocks } from '../../../components/DocBlocks';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import type { RootStackParamList } from '../../../navigation/AppNavigator';
import { getLegalDoc } from '../content/legalContent';
import { OSS_LICENSE_SUMMARY, OSS_PACKAGES } from '../content/openSourceLicenses';
import { OSS_LICENSE_TEXTS } from '../content/openSourceLicenseTexts';

/** Privacy policy, terms of use, or the generated open-source licence list. */
export const LegalScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'SettingsLegal'>>();
  const doc = useMemo(() => getLegalDoc(t, params.doc), [t, params.doc]);
  // F08.4: the licence text of a package is bundled and shown on tap.
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={s.root}>
      <ScreenHeader title={doc.title} onBack={() => nav.goBack()} />
      <ScrollView style={s.body} contentContainerStyle={s.content}>
        <View style={s.card}><DocBlocks doc={doc} /></View>
        {params.doc === 'licences' ? (
          <View style={s.card}>
            {OSS_LICENSE_SUMMARY.map(x => <Text key={x.license} style={s.sum}>{x.license} — {x.count}</Text>)}
            <View style={s.rule} />
            {OSS_PACKAGES.map(p => {
              const id = `${p.name}@${p.version}`;
              const text = p.textIndex >= 0 ? OSS_LICENSE_TEXTS[p.textIndex] : null;
              const expanded = open === id;
              return (
                <TouchableOpacity key={id} style={s.pkg} onPress={() => setOpen(expanded ? null : id)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded }} testID={`oss-${p.name}`}>
                  <Text style={s.pkgName} numberOfLines={2}>{p.name} <Text style={s.pkgVer}>{p.version}</Text></Text>
                  <Text style={s.pkgLic} numberOfLines={1}>{p.license}{text ? '' : ` · ${t('legal.licences.noText')}`}</Text>
                  {expanded && text ? <Text style={s.pkgText} testID="oss-text" selectable>{text}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom },
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: spacing.md },
  sum: { ...typography.bodySm, color: colors.textMuted, lineHeight: 19 },
  rule: { height: 1, backgroundColor: colors.rule2, marginVertical: 10 },
  pkg: { paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.rule2 },
  pkgName: { ...typography.bodySm, color: colors.textDark, fontWeight: '700' },
  pkgVer: { ...typography.micro, color: colors.textFaint, fontWeight: '500' },
  pkgLic: { ...typography.micro, color: colors.textMuted },
  pkgText: { ...typography.micro, color: colors.textDark, lineHeight: 15, marginTop: 6, fontFamily: undefined },
});
