import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Batch, Product } from '../../domain/expiry/expiryTypes';
import { AppKeyboardBottomSheet } from '../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../components/AppButton';
import { AppAlert } from '../../components/AppAlert';
import { Field } from '../../components/forms/FormBits';
import { getProduct } from '../products/productStore';
import { useGeneralSettings } from '../settings/settingsStore';
import { moneyText } from '../batches/format';
import { normalizeArabicNumerals } from '../../utils/locale';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { markdownStep, markdownSuggestion, type MarkdownStep } from './markdownHelper';

/**
 * Markdown helper sheet (§17). It only calculates and shows prices; it never changes the product's price, never says
 * an item is suitable ("safe") to sell, and is not available after a hard deadline or without a known date, cost
 * and price. Prices below cost appear only after the user explicitly confirms.
 */
export const MarkdownHelperSheet: React.FC<{ batch: Batch; visible: boolean; onClose: () => void }> = ({ batch, visible, onClose }) => {
  const { t } = useTranslation();
  const settings = useGeneralSettings();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [showBelow, setShowBelow] = useState(false);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setShowBelow(false);
    setCustom('');
    getProduct(batch.workspaceId, batch.productId).then(p => { if (live) setProduct(p); }).catch(() => { if (live) setProduct(null); });
    return () => { live = false; };
  }, [visible, batch.workspaceId, batch.productId]);

  const suggestion = useMemo(
    () => (product === undefined ? undefined : markdownSuggestion(batch, product, Date.now(), settings)),
    [batch, product, settings],
  );

  const customPct = /^\d{1,2}$/.test(normalizeArabicNumerals(custom.trim())) ? Number(normalizeArabicNumerals(custom.trim())) : null;
  const customStep: MarkdownStep | null = suggestion && suggestion.available && customPct && customPct >= 1 && customPct <= 99
    ? markdownStep(suggestion.sellingPrice, suggestion.cost, customPct) : null;

  const confirmBelow = () => {
    AppAlert.alert(t('markdown.belowCostTitle'), t('markdown.belowCostConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('markdown.showBelowCost'), style: 'destructive', onPress: () => setShowBelow(true) },
    ]);
  };

  const stepRow = (s: MarkdownStep) => (
    <View key={s.percentOff} style={[st.step, s.belowCost && st.stepBelow]} testID={`markdown-step-${s.percentOff}`}>
      <Text style={st.stepPct}>{t('markdown.percentOff', { percent: s.percentOff })}</Text>
      <Text style={st.stepPrice}>{moneyText(s.price)}</Text>
      <Text style={s.belowCost ? st.stepLoss : st.stepMeta}>
        {s.belowCost
          ? t('markdown.belowCostBy', { amount: moneyText({ minor: -s.overCostMinor, currency: s.price.currency }) })
          : t('markdown.overCost', { amount: moneyText({ minor: s.overCostMinor, currency: s.price.currency }) })}
      </Text>
    </View>
  );

  let body: React.ReactNode;
  if (suggestion === undefined) {
    body = <Text style={st.hint}>{t('common.loading')}</Text>;
  } else if (suggestion === null) {
    body = <Text style={st.blocked} testID="markdown-blocked">{t('markdown.notAvailableDeadline')}</Text>;
  } else if (!suggestion.available) {
    body = <Text style={st.blocked} testID="markdown-unavailable">{t(`markdown.unavailable.${suggestion.reason}`)}</Text>;
  } else {
    const customHidden = customStep?.belowCost && !showBelow;
    body = (
      <View style={st.body}>
        {suggestion.qualityDate ? <Text style={st.warn}>{t('markdown.qualityFirst')}</Text> : null}
        <Text style={st.line}>{t('markdown.currentPrice', { price: moneyText(suggestion.sellingPrice) })}</Text>
        <Text style={st.line}>{t('markdown.cost', { cost: moneyText(suggestion.cost) })}</Text>
        {suggestion.steps.length ? suggestion.steps.map(stepRow) : <Text style={st.hint}>{t('markdown.noStepsAboveCost')}</Text>}
        {suggestion.belowCostSteps.length && !showBelow ? (
          <AppButton label={t('markdown.showBelowCost')} variant="secondary" onPress={confirmBelow} testID="markdown-show-below" />
        ) : null}
        {showBelow ? suggestion.belowCostSteps.map(stepRow) : null}
        <Field label={t('markdown.customPercent')} value={custom} onChangeText={setCustom} keyboardType="number-pad" maxLength={2} hint={t('markdown.customHint')} ltr testID="markdown-custom" />
        {customStep && !customHidden ? stepRow(customStep) : null}
        {customHidden ? (
          <AppButton label={t('markdown.showBelowCost')} variant="secondary" onPress={confirmBelow} />
        ) : null}
      </View>
    );
  }

  return (
    <AppKeyboardBottomSheet
      visible={visible}
      onClose={onClose}
      title={t('markdown.title')}
      footer={<AppButton label={t('common.close')} variant="secondary" onPress={onClose} testID="markdown-close" />}
    >
      <Text style={st.disclaimer}>{t('markdown.disclaimer')}</Text>
      {body}
    </AppKeyboardBottomSheet>
  );
};

const st = StyleSheet.create({
  body: { gap: spacing.sm },
  disclaimer: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
  warn: { ...typography.bodySm, color: '#7A3D08', backgroundColor: '#FBE2C8', borderRadius: 10, padding: 10, fontWeight: '700', overflow: 'hidden' },
  blocked: { ...typography.body, color: colors.dangerRed, fontWeight: '700' },
  hint: { ...typography.bodySm, color: colors.textMuted },
  line: { ...typography.body, color: colors.textDark },
  step: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 2 },
  stepBelow: { borderColor: colors.dangerRed, backgroundColor: colors.softRed },
  stepPct: { ...typography.bodySm, color: colors.textMuted, fontWeight: '700' },
  stepPrice: { ...typography.cardTitle, color: colors.textDark },
  stepMeta: { ...typography.bodySm, color: colors.textMuted },
  stepLoss: { ...typography.bodySm, color: colors.dangerRed, fontWeight: '700' },
});
