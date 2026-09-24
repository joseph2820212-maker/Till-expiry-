/**
 * E21 Rule edit. Name, what it applies to, hard cutoff or quality review, the duration the business uses, and — always
 * required — where that duration comes from. No duration is ever prefilled or suggested. Saving an edit makes a new
 * version; batches already created keep the snapshot of the version they used.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RuleAppliesTo, RuleClass } from '../../../domain/expiry/expiryTypes';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { getRule, saveRule, setRuleHidden } from '../ruleStore';
import { emptyRuleForm, ruleFormToDraft, ruleToForm, type DurationUnit, type RuleForm } from './ruleForm';
import { errorMessage } from '../../add/components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;
const APPLIES: RuleAppliesTo[] = ['after_opening', 'after_preparation', 'manual_review'];
const CLASSES: RuleClass[] = ['hard_cutoff', 'quality_review'];
const UNITS: DurationUnit[] = ['minutes', 'hours', 'days'];

export const RuleEditScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'RuleEdit'>>();
  const id = params?.id;
  const { data, workspace: ws } = useWorkspaceData(async w => (id ? getRule(w.id, id) : null));
  const [form, setForm] = useState<RuleForm>(() => emptyRuleForm(params?.appliesTo));
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (data && !loaded.current) { loaded.current = true; setForm(ruleToForm(data)); }
  }, [data]);

  const patch = (p: Partial<RuleForm>) => { setForm(f => ({ ...f, ...p })); setErrors({}); setFormError(null); };

  const save = async () => {
    if (!ws || inFlight.current) return;
    const built = ruleFormToDraft(form);
    if (!built.ok) { setErrors(built.errors); return; }
    inFlight.current = true;
    setSaving(true);
    try {
      await saveRule(ws.id, built.draft, id);
      nav.goBack();
    } catch (e) {
      setFormError(errorMessage(t, e));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const hidden = data?.status === 'hidden';
  const toggleHidden = () => {
    if (!ws || !id) return;
    const run = async () => { try { await setRuleHidden(ws.id, id, !hidden); nav.goBack(); } catch (e) { AppAlert.error(errorMessage(t, e)); } };
    if (hidden) { run(); return; }
    AppAlert.alert(t('rules.hideTitle'), t('rules.hideBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('rules.hide'), style: 'destructive', onPress: run },
    ]);
  };

  const errText = (code?: string) => (code ? t(`rules.errors.${code}`) : undefined);

  return (
    <View style={s.root}>
      <ScreenHeader title={id ? t('rules.editTitle') : t('rules.newTitle')} subtitle={data ? t('rules.versionLine', { version: data.version }) : undefined} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Hint text={t('rules.ownRulesHint')} />
        <Section title={t('rules.nameSection')}>
          <Field label={t('rules.name')} value={form.name} onChangeText={v => patch({ name: v })} placeholder={t('rules.namePh')} maxLength={60} error={errText(errors.name)} testID="rule-name" />
        </Section>

        <Section title={t('rules.appliesSection')}>
          <ChoiceChips options={APPLIES.map(a => ({ value: a, label: t(`rules.appliesTo.${a}`) }))} value={form.appliesTo} onChange={(a: RuleAppliesTo) => patch({ appliesTo: a })} />
          <Hint text={t(`rules.appliesHint.${form.appliesTo}`)} />
        </Section>

        <Section title={t('rules.classSection')}>
          <ChoiceChips options={CLASSES.map(c => ({ value: c, label: t(`rules.class.${c}`) }))} value={form.class} onChange={(c: RuleClass) => patch({ class: c })} />
          <Hint text={t(`rules.classHint.${form.class}`)} />
        </Section>

        <Section title={t('rules.durationSection')} hint={form.appliesTo === 'manual_review' ? t('rules.durationOptional') : t('rules.durationHint')}>
          <Field label={t('rules.duration')} value={form.durationText} onChangeText={v => patch({ durationText: v })} keyboardType="number-pad" maxLength={7} error={errText(errors.duration)} ltr testID="rule-duration" />
          <ChoiceChips options={UNITS.map(u => ({ value: u, label: t(`rules.unit.${u}`) }))} value={form.durationUnit} onChange={(u: DurationUnit) => patch({ durationUnit: u })} />
        </Section>

        <Section title={t('rules.sourceSection')} hint={t('rules.sourceHint')}>
          <Field label={t('rules.source')} value={form.sourceText} onChangeText={v => patch({ sourceText: v })} placeholder={t('rules.sourcePh')} maxLength={200} multiline error={errText(errors.source)} testID="rule-source" />
        </Section>

        <Section title={t('rules.storageSection')}>
          <Field label={t('rules.storage')} value={form.storageInstruction} onChangeText={v => patch({ storageInstruction: v })} placeholder={t('common.optional')} maxLength={120} />
        </Section>

        <Hint text={id ? t('rules.versionHint', { next: (data?.version ?? 1) + 1 }) : t('rules.snapshotHint')} />
        <ErrorText text={formError} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws || (!!id && !data)} testID="rule-save" />
        {id && data ? <AppButton label={hidden ? t('rules.unhide') : t('rules.hide')} onPress={toggleHidden} variant={hidden ? 'outline' : 'dangerLink'} /> : null}
      </AppKeyboardScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.md },
});
