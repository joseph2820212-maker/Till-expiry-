import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Evaluation } from '../../domain/expiry/statusEngine';
import type { DateKind } from '../../domain/expiry/expiryTypes';
import { statusColors, statusLabel } from '../../modules/batches/format';
import { typography } from '../../theme/typography';

/** Status in words with a colour behind it (§35: information is never conveyed by colour alone). */
export const StatusChip: React.FC<{ evaluation: Evaluation; kind: DateKind; testID?: string }> = ({ evaluation, kind, testID }) => {
  const { t } = useTranslation();
  const c = statusColors(evaluation.status);
  const label = statusLabel(t, evaluation, kind);
  return <Text style={[s.chip, { color: c.fg, backgroundColor: c.bg }]} accessibilityLabel={label} testID={testID}>{label}</Text>;
};

const s = StyleSheet.create({
  chip: { ...typography.bodySm, fontWeight: '700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', alignSelf: 'flex-start' },
});
