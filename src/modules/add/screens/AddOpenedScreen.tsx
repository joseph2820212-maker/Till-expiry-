/**
 * E17 Add — opened (§12.2, §9.4). Choose the product and, preferably, the unopened batch being opened; enter the amount
 * opened (never more than is left); the opened time defaults to now; then a saved after-opening rule, a direct
 * deadline, or no separate date. The preview comes from deadlineEngine.openedDeadline — the same function the store
 * uses — and shows the original pack date next to the calculated date and which one controls. Saving is one atomic
 * write (child batch + parent reduced by the amount opened only).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Batch, DateKind, DeadlineValue, Product } from '../../../domain/expiry/expiryTypes';
import { deadlineInstant } from '../../../domain/expiry/datePrecision';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppKeyboardScrollView } from '../../../components/AppKeyboardScrollView';
import { AppButton } from '../../../components/AppButton';
import { RadioRow } from '../../../components/RadioRow';
import { ChoiceChips, ErrorText, Field, Hint, Section } from '../../../components/forms/FormBits';
import { DeadlineInput } from '../../../components/forms/DeadlineInput';
import { newId } from '../../../storage/entityStore';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { listProducts } from '../../products/productStore';
import { listLocations } from '../../locations/locationStore';
import { listRules } from '../../rules/ruleStore';
import { listBatches, openBatch, type OpenResult } from '../../batches/batchStore';
import { deadlineLine, quantityLine } from '../../batches/format';
import { useReminderSettings } from '../../settings/settingsStore';
import {
  OPENED_DIRECT_KINDS, buildOpenInput, createSaveGuard, nowFields, openPreview, type DeadlineSource, type FormErrors, type OpenedForm,
} from '../addForms';
import { LocationField, ProductPickerSheet, ReminderPreview, TimeFields, errorMessage, ruleSummary, s } from '../components/AddBits';

type Nav = NativeStackNavigationProp<TabStackParamList>;
const NO_PARENT = '__noParent';


/** Unopened batches of a product that can be opened, earliest controlling date first (undated last). */
export function openableBatches(batches: Batch[], productId: string | undefined): Batch[] {
  if (!productId) return [];
  const key = (b: Batch) => (b.effective.deadline ? deadlineInstant(b.effective.deadline, b.timeZone) : Number.MAX_SAFE_INTEGER);
  return batches
    .filter(b => b.productId === productId && b.status === 'active' && (b.kind === 'bought_in' || b.kind === 'other') && (b.quantityRemaining === undefined || b.quantityRemaining > 0))
    .sort((a, b) => key(a) - key(b));
}

const initialForm = (tz: string): OpenedForm => {
  const now = nowFields(tz);
  return { amountText: '', openedDate: now.date, openedTime: now.time, source: 'rule', directKind: 'internal_cutoff', notes: '' };
};

export const AddOpenedScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'AddOpened'>>();
  const { data, workspace: ws } = useWorkspaceData(async w => ({
    products: await listProducts(w.id),
    batches: await listBatches(w.id),
    rules: await listRules(w.id, { appliesTo: 'after_opening' }),
    locations: await listLocations(w.id),
  }));
  const reminders = useReminderSettings();
  const tz = ws?.timeZone ?? 'UTC';
  const [form, setForm] = useState<OpenedForm>(() => initialForm(tz));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<OpenResult | null>(null);
  const [picker, setPicker] = useState(false);
  const [dlKey, setDlKey] = useState(0);
  const guard = useRef(createSaveGuard(() => newId('req'))).current;
  const applied = useRef<string | null>(null);

  const products = data?.products ?? [];
  const rules = data?.rules ?? [];
  const product = useMemo(() => products.find(p => p.id === form.productId) ?? null, [products, form.productId]);
  const candidates = useMemo(() => openableBatches(data?.batches ?? [], form.productId), [data, form.productId]);
  const parent = useMemo(() => candidates.find(b => b.id === form.parentBatchId) ?? (data?.batches ?? []).find(b => b.id === form.parentBatchId) ?? null, [candidates, data, form.parentBatchId]);
  const rule = useMemo(() => rules.find(r => r.id === form.ruleId) ?? null, [rules, form.ruleId]);

  const patch = useCallback((p: Partial<OpenedForm>) => { setForm(f => ({ ...f, ...p })); setErrors({}); setFormError(null); }, []);

  const chooseProduct = useCallback((p: Product, parentId?: string) => {
    const list = openableBatches(data?.batches ?? [], p.id);
    const preferred = parentId ?? list[0]?.id;
    const defRule = rules.find(r => r.id === p.defaultRuleId);
    setForm(f => ({
      ...f,
      productId: p.id,
      parentBatchId: preferred,
      ruleId: defRule ? defRule.id : f.ruleId && rules.some(r => r.id === f.ruleId) ? f.ruleId : undefined,
      source: rules.length ? 'rule' : 'direct',
      locationId: undefined,
    }));
    setErrors({});
  }, [data, rules]);

  useEffect(() => {
    if (!data) return;
    const key = JSON.stringify(params ?? {});
    if (applied.current === key) return;
    applied.current = key;
    if (!rules.length) setForm(f => ({ ...f, source: 'direct' }));
    if (params?.parentBatchId) {
      const b = data.batches.find(x => x.id === params.parentBatchId);
      const p = b ? data.products.find(x => x.id === b.productId) : undefined;
      if (b && p) chooseProduct(p, b.id);
    } else if (params?.productId) {
      const p = data.products.find(x => x.id === params.productId);
      if (p) chooseProduct(p);
    }
  }, [data, params, rules, chooseProduct]);

  const reset = () => { setForm(initialForm(tz)); setSaved(null); setErrors({}); setFormError(null); setDlKey(k => k + 1); applied.current = null; };

  const preview = useMemo(() => openPreview(form, { tz, parent, rule }), [form, tz, parent, rule]);

  const save = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      await guard.run(async requestId => {
        const built = buildOpenInput(form, { workspaceId: ws.id, tz, parent, rule, requestId });
        if (!built.ok) { setErrors(built.errors); return; }
        try {
          setSaved(await openBatch(built.input));
        } catch (e) { setFormError(errorMessage(t, e)); throw e; }
      });
    } catch { /* shown */ } finally { setSaving(false); }
  };

  const errText = (code?: string) => (code ? t(`add.errors.${code}`) : undefined);

  if (saved) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t('add.opened.title')} onBack={() => nav.goBack()} />
        <AppKeyboardScrollView contentContainerStyle={s.content}>
          <View style={s.success} testID="opened-saved">
            <Text style={s.title}>{t('add.opened.saved', { name: saved.child.productName })}</Text>
            <Text style={s.strong}>{deadlineLine(t, saved.child.effective, saved.child.timeZone)}</Text>
            <Text style={s.meta}>{t(`add.controls.${saved.child.effective.reason}`)}</Text>
            {saved.parent && quantityLine(t, saved.parent) ? <Text style={s.meta}>{t('add.opened.parentLeft', { left: quantityLine(t, saved.parent) })}</Text> : null}
          </View>
          <AppButton label={t('add.saved.view')} onPress={() => nav.navigate('BatchDetail', { id: saved.child.id })} testID="opened-view" />
          <AppButton label={t('add.printLabel')} onPress={() => nav.navigate('InternalLabelPreview', { batchIds: [saved.child.id] })} variant="secondary" />
          <AppButton label={t('add.opened.another')} onPress={reset} variant="outline" />
        </AppKeyboardScrollView>
      </View>
    );
  }

  const parentChoice = form.parentBatchId ?? NO_PARENT;

  return (
    <View style={s.root}>
      <ScreenHeader title={t('add.opened.title')} onBack={() => nav.goBack()} />
      <AppKeyboardScrollView contentContainerStyle={s.content}>
        <Section title={t('add.product.section')}>
          {product ? (
            <View style={s.selected}>
              <Text style={s.title}>{product.name}</Text>
              <AppButton label={t('add.product.change')} onPress={() => setPicker(true)} variant="outline" />
            </View>
          ) : (
            <View style={s.gap}>
              <AppButton label={t('add.product.choose')} onPress={() => setPicker(true)} variant="secondary" testID="choose-product" />
              <AppButton label={t('add.product.scan')} onPress={() => nav.navigate('BarcodeScanner', { purpose: 'open' })} variant="outline" />
            </View>
          )}
          <ErrorText text={errText(errors.product)} />
        </Section>

        {product ? (
          <Section title={t('add.opened.which')} hint={t('add.opened.whichHint')}>
            {candidates.map(b => (
              <RadioRow
                key={b.id}
                label={deadlineLine(t, b.effective, b.timeZone)}
                subtitle={[b.lotNumber ? t('add.lotShort', { lot: b.lotNumber }) : null, quantityLine(t, b), b.locationId ? data?.locations.find(l => l.id === b.locationId)?.name : null].filter(Boolean).join(' · ') || undefined}
                selected={parentChoice === b.id}
                onSelect={() => patch({ parentBatchId: b.id })}
              />
            ))}
            <RadioRow label={t('add.opened.noParent')} subtitle={t('add.opened.noParentHint')} selected={parentChoice === NO_PARENT} onSelect={() => patch({ parentBatchId: undefined })} />
          </Section>
        ) : null}

        <Section title={t('add.opened.amount')} hint={parent?.quantityRemaining !== undefined ? t('add.opened.amountLeft', { left: quantityLine(t, parent) ?? '' }) : t('add.opened.amountOptional')}>
          <Field label={t('add.opened.amountLabel')} value={form.amountText} onChangeText={v => patch({ amountText: v })} keyboardType="decimal-pad" error={errText(errors.amount)} ltr testID="amount" />
        </Section>

        <Section title={t('add.opened.when')}>
          <TimeFields label={t('add.opened.date')} date={form.openedDate} time={form.openedTime} onDate={d => patch({ openedDate: d })} onTime={v => patch({ openedTime: v })} onNow={() => { const n = nowFields(tz); patch({ openedDate: n.date, openedTime: n.time }); }} tz={tz} error={errText(errors.openedAt)} />
        </Section>

        <Section title={t('add.opened.deadline')} hint={t('add.opened.deadlineHint')}>
          <RadioRow label={t('add.source.rule')} subtitle={rules.length ? undefined : t('add.source.noRules')} selected={form.source === 'rule'} onSelect={() => patch({ source: 'rule' })}>
            <View style={s.gap}>
              {rules.map(r => (
                <RadioRow key={r.id} label={r.name} subtitle={`${ruleSummary(t, r)}\n${t('rules.sourceLine', { source: r.sourceText })}`} selected={form.ruleId === r.id} onSelect={() => patch({ ruleId: r.id, source: 'rule' })} />
              ))}
              <AppButton label={t('add.source.newRule')} onPress={() => nav.navigate('RuleEdit', { appliesTo: 'after_opening' })} variant="outline" />
              <ErrorText text={errText(errors.rule)} />
            </View>
          </RadioRow>
          <RadioRow label={t('add.source.direct')} selected={form.source === 'direct'} onSelect={() => patch({ source: 'direct' })}>
            <View style={s.gap}>
              <ChoiceChips options={OPENED_DIRECT_KINDS.map(k => ({ value: k, label: t(`dateKind.${k}`) }))} value={form.directKind} onChange={(k: DateKind) => patch({ directKind: k })} />
              <DeadlineInput key={`d${dlKey}`} kind={form.directKind} value={form.directDeadline} onChange={(d: DeadlineValue | undefined) => setForm(f => ({ ...f, directDeadline: d }))} tz={tz} allowTime error={errText(errors.deadline)} />
            </View>
          </RadioRow>
          <RadioRow label={t('add.source.original')} subtitle={t('add.source.originalHint')} selected={form.source === 'original'} onSelect={() => patch({ source: 'original' as DeadlineSource })} />
        </Section>

        <Section title={t('add.opened.preview')} testID="opened-preview">
          <Text style={s.meta}>{t('add.opened.original')}</Text>
          <Text style={s.strong}>{parent ? deadlineLine(t, parent.effective, parent.timeZone) : t('add.opened.noOriginal')}</Text>
          {parent?.secondary ? <Text style={s.meta}>{deadlineLine(t, parent.secondary, parent.timeZone)}</Text> : null}
          {preview ? (
            <>
              <Text style={s.meta}>{t('add.opened.calculated')}</Text>
              <Text style={s.strong}>{preview.own.deadline ? deadlineLine(t, { dateKind: preview.own.kind, deadline: preview.own.deadline, reason: form.source === 'rule' ? 'rule' : 'direct' }, tz) : t('add.opened.noCalculated')}</Text>
              {form.source === 'rule' && rule ? <Text style={s.meta}>{t('add.ruleUsed', { name: rule.name, version: rule.version, source: rule.sourceText })}</Text> : null}
              <Text style={s.meta}>{t('add.opened.controls')}</Text>
              <Text style={s.strong} testID="opened-controls">{deadlineLine(t, preview.effective, tz)}</Text>
              <Text style={s.meta}>{t(`add.controls.${preview.effective.reason}`)}</Text>
              {preview.secondary ? <Text style={s.meta}>{t('add.opened.qualityAlso', { line: deadlineLine(t, preview.secondary, tz) })}</Text> : null}
              <ReminderPreview info={preview.effective} tz={tz} settings={reminders} />
            </>
          ) : <Hint text={t('add.opened.previewIncomplete')} />}
        </Section>

        <Section title={t('add.lotPlace.section')}>
          <LocationField locations={data?.locations ?? []} value={form.locationId ?? parent?.locationId} onChange={id => patch({ locationId: id })} />
          <Field label={t('add.notes')} value={form.notes} onChangeText={v => patch({ notes: v })} placeholder={t('common.optional')} maxLength={300} multiline />
        </Section>

        <ErrorText text={formError} />
        <AppButton label={t('common.save')} onPress={save} loading={saving} disabled={saving || !ws} testID="opened-save" />
      </AppKeyboardScrollView>
      <ProductPickerSheet visible={picker} onClose={() => setPicker(false)} products={products} onPick={p => { setPicker(false); chooseProduct(p); }} />
    </View>
  );
};
