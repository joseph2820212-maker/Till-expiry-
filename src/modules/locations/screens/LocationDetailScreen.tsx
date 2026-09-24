/**
 * E23 Location detail — create, edit, hide / bring back a place, with its active item count and a link to the items
 * kept there. Hiding a place keeps its items and history; a date never changes because of where an item is kept.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { LocationKind } from '../../../domain/expiry/expiryTypes';
import { LOCATION_KINDS } from '../../../domain/expiry/expiryTypes';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { typography } from '../../../theme/typography';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listLocations, saveLocation, setLocationHidden } from '../locationStore';
import { listBatches } from '../../batches/batchStore';
import { errorMessage } from '../../add/components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;

export const LocationDetailScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'LocationDetail'>>();
  const id = params?.id;
  const { data, workspace: ws } = useWorkspaceData(async w => {
    if (!id) return { location: null, count: 0 };
    const location = (await listLocations(w.id, { includeHidden: true })).find(l => l.id === id) ?? null;
    const count = (await listBatches(w.id)).filter(b => b.locationId === id).length;
    return { location, count };
  });
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LocationKind>('shelf');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (data?.location && !loaded.current) {
      loaded.current = true;
      setName(data.location.name); setKind(data.location.kind); setNotes(data.location.notes ?? '');
    }
  }, [data]);

  const save = async () => {
    if (!ws || inFlight.current) return;
    if (!name.trim()) { setNameError(t('locations.errors.nameRequired')); return; }
    inFlight.current = true;
    setSaving(true);
    try {
      await saveLocation(ws.id, { name, kind, notes }, id);
      nav.goBack();
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hidden = data?.location?.status === 'hidden';
  const toggleHidden = () => {
    if (!ws || !id) return;
    const run = async () => { try { await setLocationHidden(ws.id, id, !hidden); nav.goBack(); } catch (e) { AppAlert.error(errorMessage(t, e)); } };
    if (hidden) { run(); return; }
    AppAlert.alert(t('locations.hideTitle'), t('locations.hideBody', { count: data?.count ?? 0 }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('locations.hide'), style: 'destructive', onPress: run },
    ]);
  };

  return (
    <View style={s.root}>
      <ScreenHeader title={id ? t('locations.editTitle') : t('locations.newTitle')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        {id && data?.location ? (
          <View style={s.countCard} testID="location-count">
            <Text style={s.count}>{t('locations.activeCount', { count: data.count })}</Text>
            {data.count ? <AppButton label={t('locations.showItems')} onPress={() => nav.navigate('ExpiryQueue', { query: { locationId: id } })} variant="outline" /> : null}
          </View>
        ) : null}
        <Section title={t('locations.nameSection')}>
          <Field label={t('locations.name')} value={name} onChangeText={v => { setName(v); setNameError(undefined); setError(null); }} placeholder={t('locations.namePh')} maxLength={40} error={nameError} testID="location-name" />
        </Section>
        <Section title={t('locations.kindSection')}>
          <ChoiceChips options={LOCATION_KINDS.map(k => ({ value: k, label: t(`locationKind.${k}`) }))} value={kind} onChange={(k: LocationKind) => setKind(k)} />
          <Hint text={t('locations.kindHint')} />
        </Section>
        <Section title={t('locations.notes')}>
          <Field label={t('locations.notes')} value={notes} onChangeText={setNotes} placeholder={t('common.optional')} maxLength={200} multiline />
        </Section>
        <ErrorText text={error} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws || (!!id && !data?.location)} testID="location-save" />
        {id && data?.location ? <AppButton label={hidden ? t('locations.unhide') : t('locations.hide')} onPress={toggleHidden} variant={hidden ? 'outline' : 'dangerLink'} /> : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
  countCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 12, gap: spacing.sm },
  count: { ...typography.cardTitle, color: colors.textDark },
});
