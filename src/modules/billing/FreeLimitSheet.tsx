import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppKeyboardBottomSheet } from '../../components/AppKeyboardBottomSheet';
import { AppButton } from '../../components/AppButton';
import { AppAlert } from '../../components/AppAlert';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { useBilling } from './BillingProvider';
import { BILLING_PACKAGE_IDS, isLifetimeProductId } from './billingConfig';
import { LIMIT_CAPS, type LimitKind } from './limits';
import { APP_NAME } from '../../appMeta';

export type FreeLimitReason = LimitKind;

// Shown at the exact moment a free limit is hit — never on app open. Says what
// keeps working before it says what Pro adds. Existing data is never locked.
export const FreeLimitSheet: React.FC<{ reason: FreeLimitReason | null; onClose: () => void }> = ({ reason, onClose }) => {
  const { t } = useTranslation();
  const billing = useBilling();
  const [busy, setBusy] = useState<'purchase' | 'restore' | null>(null);

  // F07: purchase ONLY the lifetime package — never "whatever came first".
  // Same rule as billingService: the $rc_lifetime slot OR the exact configured product id.
  const lifetime = billing.entitlement.packages.find(p => p.key === 'lifetime' && (p.identifier === BILLING_PACKAGE_IDS.lifetime || isLifetimeProductId(p.productIdentifier))) ?? null;
  const priceLabel = lifetime?.priceString ?? t('billing.lifetimePlaceholderPrice');
  const recoveryPending = billing.purchaseRecoveryPending;
  const storeMissing = !lifetime;

  const purchase = async () => {
    if (!lifetime) { AppAlert.error(t('billing.storeUnavailable')); return; }
    setBusy('purchase');
    try {
      const r = await billing.purchase(lifetime);
      if (r.success) { AppAlert.success(t('billing.unlocked')); onClose(); }
      else if (!r.cancelled) AppAlert.error(t('billing.purchaseFailed'));
    } finally { setBusy(null); }
  };
  const retry = async () => {
    setBusy('purchase');
    try { await billing.retry(); } finally { setBusy(null); }
  };
  const restore = async () => {
    setBusy('restore');
    try {
      const r = await billing.restore();
      if (r.success) { AppAlert.success(t('billing.unlocked')); onClose(); }
      else AppAlert.alert(t('billing.restoreTitle'), t('billing.nothingToRestore'));
    } finally { setBusy(null); }
  };


  return (
    <AppKeyboardBottomSheet
      visible={!!reason}
      onClose={onClose}
      dismissOnBackdrop={!busy}
      footer={(
        <View style={s.footer}>
          {recoveryPending ? (
            <>
              <Text style={s.recovery} testID="billing-recovery-pending">{t('billing.purchaseEntitlementMissing')}</Text>
              <AppButton label={t('billing.retry')} onPress={retry} loading={busy === 'purchase'} disabled={!!busy} />
            </>
          ) : storeMissing ? (
            <>
              <Text style={s.recovery} testID="billing-store-unavailable">{t('billing.storeUnavailable')}</Text>
              <AppButton label={t('billing.retry')} onPress={retry} loading={busy === 'purchase'} disabled={!!busy} />
            </>
          ) : (
            <AppButton label={t('billing.unlockPro', { price: priceLabel })} onPress={purchase} loading={busy === 'purchase'} disabled={!!busy} />
          )}
          <AppButton label={t('billing.notNow')} onPress={onClose} variant="secondary" disabled={!!busy} />
          <AppButton label={t('billing.restorePurchase')} onPress={restore} variant="ghost" loading={busy === 'restore'} disabled={!!busy} />
        </View>
      )}
    >
      {reason ? (
        <View style={s.body}>
          <Text style={s.eyebrow}>{t(`billing.limit.${reason}.eyebrow`, { n: LIMIT_CAPS[reason] ?? '' })}</Text>
          <Text style={s.title}>{t(`billing.limit.${reason}.title`, { n: LIMIT_CAPS[reason] ?? '' })}</Text>
          <Text style={s.copy}>{t(`billing.limit.${reason}.keepsWorking`)}</Text>
          <View style={s.proCard}>
            <View style={s.proRow}><Text style={s.proName}>{t('billing.proName', { app: APP_NAME })}</Text><Text style={s.proPrice}>{t('billing.oncePrice', { price: priceLabel })}</Text></View>
            <Text style={s.proCopy}>{t('billing.proSummary')}</Text>
          </View>
        </View>
      ) : null}
    </AppKeyboardBottomSheet>
  );
};

const s = StyleSheet.create({
  body: { gap: spacing.sm },
  eyebrow: { ...typography.sectionLabel, color: colors.warningOrange },
  title: { ...typography.sectionTitle, color: colors.textDark },
  copy: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18 },
  proCard: { backgroundColor: colors.softBlue, borderRadius: 14, padding: 12, gap: 3, marginTop: spacing.xs },
  proRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  proName: { ...typography.bodySm, color: colors.primaryBlue },
  proPrice: { ...typography.cardTitle, color: colors.primaryBlue },
  proCopy: { ...typography.micro, color: colors.primaryBlue, lineHeight: 14 },
  footer: { gap: spacing.sm },
  recovery: { ...typography.bodySm, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
});
