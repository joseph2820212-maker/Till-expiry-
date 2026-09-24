/**
 * E18 Add — prepared (§12.3, §9.5). A prepared product (or a new one), prepared time (defaults to now, editable),
 * optional quantity, place, a saved preparation rule (the batch keeps a snapshot of the exact rule version) or a
 * direct deadline, optional source batch links (traceability only — no stock is consumed). The preview comes from
 * deadlineEngine.preparedDeadline. After saving, Print label is offered. No built-in shelf lives, nothing suggested.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Batch, DateKind, DeadlineValue, Product, TrackingUnit } from '../../../domain/expiry/expiryTypes';
import { TRACKING_UNITS } from '../../../domain/expiry/expiryTypes';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppKeyboardBottomSheet } from '../../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../../components/AppButton';
import { RadioRow } from '../../../components/RadioRow';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { DeadlineInput } from '../../../components/forms/DeadlineInput';
import { newId } from '../../../storage/entityStore';
import { foldText } from '../../../storage/repoHelpers';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listProducts } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { listRules } from '../../rules/ruleStore';
import { listBatches, prepareBatch } from '../../batches/batchStore';
import { deadlineLine } from '../../batches/format';
import { useReminderSettings } from '../../settings/settingsStore';
import {
  PREPARED_DIRECT_KINDS, buildPrepareInput, createSaveGuard, nowFields, preparePreview, type FormErrors, type PreparedForm,
} from '../addForms';
import { LocationField, ProductPickerSheet, ReminderPreview, TimeFields, errorMessage, ruleSummary, s } from '../components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;

const initialForm = (tz: string): PreparedForm => {
  const now = nowFields(tz);
  return { newName: '', preparedDate: now.date, preparedTime: now.time, quantityText: '', source: 'rule', directKind: 'internal_cutoff', sourceBatchIds: [], lot: '', notes: '' };
};

export const AddPreparedScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'AddPrepared'>>();
  const { data, workspace: ws } = useWorkspaceData(async w => ({
    products: await listProducts(w.id),
    batches: await listBatches(w.id),
    rules: await listRules(w.id, { appliesTo: 'after_preparation' }),
    locations: await listLocations(w.id),
  }));
  const reminders = useReminderSettings();
  const tz = ws?.timeZone ?? 'UTC';
  const [form, setForm] = useState<PreparedForm>(() => initialForm(tz));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Batch | null>(null);
  const [picker, setPicker] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sources, setSources] = useState(false);
  const [sourceQuery, setSourceQuery] = useState('');
  const [dlKey, setDlKey] = useState(0);
  const guard = useRef(createSaveGuard(() => newId('req'))).current;
  const applied = useRef<string | null>(null);

  const products = data?.products ?? [];
  const rules = data?.rules ?? [];
  const prepared = useMemo(() => products.filter(p => p.isPrepared), [products]);
  const product = useMemo(() => products.find(p => p.id === form.productId) ?? null, [products, form.productId]);
  const rule = useMemo(() => rules.find(r => r.id === form.ruleId) ?? null, [rules, form.ruleId]);
  const sourceCandidates = useMemo(() => {
    const q = foldText(sourceQuery.trim());
    return (data?.batches ?? [])
      .filter(b => b.kind !== 'prepared' && (!q || foldText(`${b.productName} ${b.lotNumber ?? ''}`).includes(q)))
      .sort((a, b) => a.productName.localeCompare(b.productName))
      .slice(0, 80);
  }, [data, sourceQuery]);

  const patch = useCallback((p: Partial<PreparedForm>) => { setForm(f => ({ ...f, ...p })); setErrors({}); setFormError(null); }, []);

  const chooseProduct = useCallback((p: Product) => {
    const defRule = rules.find(r => r.id === p.defaultRuleId);
    setForm(f => ({
      ...f, productId: p.id, newName: '',
      ruleId: defRule?.id ?? (f.ruleId && rules.some(r => r.id === f.ruleId) ? f.ruleId : undefined),
      locationId: f.locationId ?? p.defaultLocationId,
      unit: p.trackingUnit, customUnit: p.customUnitLabel,
    }));
    setErrors({});
  }, [rules]);

  useEffect(() => {
    if (!data) return;
    const key = JSON.stringify(params ?? {});
    if (applied.current === key) return;
    applied.current = key;
    if (!rules.length) setForm(f => ({ ...f, source: 'direct' }));
    if (params?.productId) {
      const p = data.products.find(x => x.id === params.productId);
      if (p) chooseProduct(p);
    }
  }, [data, params, rules, chooseProduct]);

  const preview = useMemo(() => preparePreview(form, { tz, rule }), [form, tz, rule]);

  const reset = () => { setForm(f => ({ ...initialForm(tz), locationId: f.locationId })); setSaved(null); setErrors({}); setFormError(null); setDlKey(k => k + 1); applied.current = null; };

  const save = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      await guard.run(async requestId => {
        const built = buildPrepareInput(form, { workspaceId: ws.id, tz, rule, requestId });
        if (!built.ok) { setErrors(built.errors); return; }
        try { setSaved(await prepareBatch(built.input)); } catch (e) { setFormError(errorMessage(t, e)); throw e; }
      });
    } catch { /* shown */ } finally { setSaving(false); }
  };

  const errText = (code?: string) => (code ? t(`add.errors.${code}`) : undefined);

  if (saved) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t('add.prepared.title')} onBack={() => nav.goBack()} />
        <AppKeyboardScrollView contentContainerStyle={s.content}>
          <View style={s.success} testID="prepared-saved">
            <Text style={s.title}>{t('add.saved.title', { name: saved.productName })}</Text>
            <Text style={s.strong}>{deadlineLine(t, saved.effective, saved.timeZone)}</Text>
            {saved.appliedRule ? <Text style={s.meta}>{t('add.ruleUsed', { name: saved.appliedRule.ruleName, version: saved.appliedRule.ruleVersion, source: saved.appliedRule.sourceText ?? '' })}</Text> : null}
          </View>
          <AppButton label={t('add.printLabel')} onPress={() => nav.navigate('InternalLabelPreview', { batchIds: [saved.id] })} testID="prepared-print" />
          <AppButton label={t('add.saved.view')} onPress={() => nav.navigate('BatchDetail', { id: saved.id })} variant="secondary" />
          <AppButton label={t('add.saved.addAnother')} onPress={reset} variant="outline" />
        </AppKeyboardScrollView>
      </View>
    );
  }

  const chosenSources = (data?.batches ?? []).filter(b => form.sourceBatchIds.includes(b.id));

  return (
    <View style={s.root}>
      <ScreenHeader title={t('add.prepared.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Section title={t('add.prepared.what')} hint={t('add.prepared.whatHint')}>
          {product ? (
            <View style={s.selected}>
              <Text style={s.title}>{product.name}</Text>
              <AppButton label={t('add.product.change')} onPress={() => setPicker(true)} variant="outline" />
            </View>
          ) : (
            <View style={s.gap}>
              <AppButton label={t('add.prepared.choose')} onPress={() => { setShowAll(false); setPicker(true); }} variant="secondary" testID="choose-product" />
              {prepared.length !== products.length ? <AppButton label={t('add.prepared.chooseAny')} onPress={() => { setShowAll(true); setPicker(true); }} variant="outline" /> : null}
              <Field label={t('add.prepared.newName')} value={form.newName} onChangeText={v => patch({ newName: v })} placeholder={t('add.prepared.newNamePh')} maxLength={120} testID="new-prepared-name" />
            </View>
          )}
          <ErrorText text={errText(errors.product)} />
        </Section>

        <Section title={t('add.prepared.when')}>
          <TimeFields label={t('add.prepared.date')} date={form.preparedDate} time={form.preparedTime} onDate={d => patch({ preparedDate: d })} onTime={v => patch({ preparedTime: v })} onNow={() => { const n = nowFields(tz); patch({ preparedDate: n.date, preparedTime: n.time }); }} tz={tz} error={errText(errors.preparedAt)} />
        </Section>

        <Section title={t('add.prepared.deadline')} hint={t('add.prepared.deadlineHint')}>
          <RadioRow label={t('add.source.rule')} subtitle={rules.length ? undefined : t('add.source.noRules')} selected={form.source === 'rule'} onSelect={() => patch({ source: 'rule' })}>
            <View style={s.gap}>
              {rules.map(r => (
                <RadioRow key={r.id} label={r.name} subtitle={`${ruleSummary(t, r)}\n${t('rules.sourceLine', { source: r.sourceText })}`} selected={form.ruleId === r.id} onSelect={() => patch({ ruleId: r.id, source: 'rule' })} />
              ))}
              <AppButton label={t('add.source.newRule')} onPress={() => nav.navigate('RuleEdit', { appliesTo: 'after_preparation' })} variant="outline" />
              <ErrorText text={errText(errors.rule)} />
            </View>
          </RadioRow>
          <RadioRow label={t('add.source.direct')} selected={form.source === 'direct'} onSelect={() => patch({ source: 'direct' })}>
            <View style={s.gap}>
              <ChoiceChips options={PREPARED_DIRECT_KINDS.map(k => ({ value: k, label: t(`dateKind.${k}`) }))} value={form.directKind} onChange={(k: DateKind) => patch({ directKind: k })} />
              <DeadlineInput key={`d${dlKey}`} kind={form.directKind} value={form.directDeadline} onChange={(d: DeadlineValue | undefined) => setForm(f => ({ ...f, directDeadline: d }))} tz={tz} allowTime error={errText(errors.deadline)} />
            </View>
          </RadioRow>
        </Section>

        <Section title={t('add.prepared.preview')} testID="prepared-preview">
          {preview ? (
            <>
              <Text style={s.strong}>{deadlineLine(t, preview.effective, tz)}</Text>
              <Text style={s.meta}>{t(`add.controls.${preview.effective.reason}`)}</Text>
              {form.source === 'rule' && rule ? <Text style={s.meta}>{t('add.ruleUsed', { name: rule.name, version: rule.version, source: rule.sourceText })}</Text> : null}
              {form.source === 'rule' && rule?.storageInstruction ? <Text style={s.meta}>{t('add.storage', { text: rule.storageInstruction })}</Text> : null}
              <ReminderPreview info={preview.effective} tz={tz} settings={reminders} />
            </>
          ) : <Hint text={t('add.prepared.previewIncomplete')} />}
        </Section>

        <Section title={t('add.quantity.section')} hint={t('add.quantity.hint')}>
          <Field label={t('add.quantity.label')} value={form.quantityText} onChangeText={v => patch({ quantityText: v })} keyboardType="decimal-pad" placeholder={t('common.optional')} error={errText(errors.quantity)} ltr testID="quantity" />
          <ChoiceChips label={t('add.unit')} options={TRACKING_UNITS.map(u => ({ value: u, label: t(`unit.${u}`) }))} value={form.unit ?? 'each'} onChange={(u: TrackingUnit) => patch({ unit: u })} />
          {form.unit === 'custom' ? <Field label={t('add.customUnit')} value={form.customUnit ?? ''} onChangeText={v => patch({ customUnit: v })} maxLength={20} error={errText(errors.unit)} /> : null}
        </Section>

        <Section title={t('add.lotPlace.section')}>
          <LocationField locations={data?.locations ?? []} value={form.locationId} onChange={id => patch({ locationId: id })} />
          <Field label={t('add.lot')} value={form.lot} onChangeText={v => patch({ lot: v })} placeholder={t('common.optional')} maxLength={40} ltr />
        </Section>

        <Section title={t('add.prepared.sources')} hint={t('add.prepared.sourcesHint')}>
          {chosenSources.map(b => <Text key={b.id} style={s.meta}>{`${b.productName}${b.lotNumber ? ` · ${t('add.lotShort', { lot: b.lotNumber })}` : ''}`}</Text>)}
          <AppButton label={t('add.prepared.linkSources')} onPress={() => setSources(true)} variant="outline" />
        </Section>

        <Section title={t('add.notes')}>
          <Field label={t('add.notes')} value={form.notes} onChangeText={v => patch({ notes: v })} placeholder={t('common.optional')} maxLength={300} multiline />
        </Section>

        <ErrorText text={formError} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws} testID="prepared-save" />
      </AppKeyboardScrollView>
      <ProductPickerSheet
        visible={picker}
        onClose={() => setPicker(false)}
        products={showAll ? products : prepared}
        onPick={p => { setPicker(false); chooseProduct(p); }}
        onCreate={name => { setPicker(false); setForm(f => ({ ...f, productId: undefined, newName: name })); }}
      />
      <AppKeyboardBottomSheet visible={sources} onClose={() => setSources(false)} title={t('add.prepared.sources')} footer={<AppButton label={t('common.done')} onPress={() => setSources(false)} />}>
        <Field label={t('common.search')} value={sourceQuery} onChangeText={setSourceQuery} />
        <View style={s.list}>
          {sourceCandidates.map(b => {
            const on = form.sourceBatchIds.includes(b.id);
            return (
              <TouchableOpacity key={b.id} style={s.row} onPress={() => patch({ sourceBatchIds: on ? form.sourceBatchIds.filter(x => x !== b.id) : [...form.sourceBatchIds, b.id] })} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <Text style={on ? s.create : s.name}>{`${on ? '✓ ' : ''}${b.productName}`}</Text>
                <Text style={s.meta}>{[b.lotNumber ? t('add.lotShort', { lot: b.lotNumber }) : null, deadlineLine(t, b.effective, b.timeZone)].filter(Boolean).join(' · ')}</Text>
              </TouchableOpacity>
            );
          })}
          {!sourceCandidates.length ? <Text style={s.meta}>{t('add.prepared.noSources')}</Text> : null}
        </View>
      </AppKeyboardBottomSheet>
    </View>
  );
};
