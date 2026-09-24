import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Batch } from '../../domain/expiry/expiryTypes';
import type { Evaluation } from '../../domain/expiry/statusEngine';
import { deadlineLine, kindLabel, quantityLine, statusColors } from '../../modules/batches/format';
import { StatusChip } from './StatusChip';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

interface Props {
  batch: Batch;
  evaluation: Evaluation;
  locationName?: string;
  onPress?: () => void;
  /** One clear primary action (§13). */
  action?: { label: string; onPress: () => void; disabled?: boolean };
  testID?: string;
}

/** A dated batch: product, lot, what is left, date meaning, deadline, place and status, plus one primary action. */
export const BatchCard: React.FC<Props> = ({ batch, evaluation, locationName, onPress, action, testID }) => {
  const { t } = useTranslation();
  const stripe = statusColors(evaluation.status).bg;
  const meta = [kindLabel(t, batch), batch.lotNumber ? t('batch.lotShort', { lot: batch.lotNumber }) : null, quantityLine(t, batch), locationName].filter(Boolean).join(' · ');
  return (
    <View style={s.card} testID={testID}>
      <TouchableOpacity style={s.main} onPress={onPress} disabled={!onPress} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${batch.productName}, ${deadlineLine(t, batch.effective, batch.timeZone)}`}>
        <View style={[s.stripe, { backgroundColor: evaluation.status === 'past_deadline' ? colors.dangerRed : stripe }]} />
        <View style={s.body}>
          <Text style={s.name} numberOfLines={2}>{batch.productName}</Text>
          <Text style={s.deadline}>{deadlineLine(t, batch.effective, batch.timeZone)}</Text>
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
          <StatusChip evaluation={evaluation} kind={batch.effective.dateKind} />
        </View>
      </TouchableOpacity>
      {action ? (
        <TouchableOpacity style={[s.action, action.disabled && s.actionDisabled]} onPress={action.onPress} disabled={action.disabled} accessibilityRole="button" accessibilityLabel={`${action.label}: ${batch.productName}`}>
          <Text style={s.actionText} numberOfLines={2}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  main: { flexDirection: 'row', padding: 12, gap: 10 },
  stripe: { width: 5, borderRadius: 3, alignSelf: 'stretch' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { ...typography.cardTitle, color: colors.textDark },
  deadline: { ...typography.body, color: colors.textDark, fontWeight: '600' },
  meta: { ...typography.bodySm, color: colors.textMuted },
  action: { borderTopWidth: 1, borderTopColor: colors.rule2, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  actionDisabled: { opacity: 0.5 },
  actionText: { ...typography.body, color: colors.primaryBlue, fontWeight: '700', textAlign: 'center' },
});
