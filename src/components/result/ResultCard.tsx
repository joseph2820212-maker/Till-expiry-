import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';

// Frozen structure (owner-approved): label + status chip on one line, one
// large number, one sentence of interpretation. Reused by the item screen,
// pricing workspace, safe markdown, the review edit sheet and Quick Margin.
export type ResultTone = 'blue' | 'green' | 'red' | 'neutral';
export type ResultStatus = 'on' | 'below' | 'above' | 'fixed' | 'info';

export interface ResultCardProps {
  label: string;
  value: string;
  meaning?: string;
  tone?: ResultTone;
  status?: ResultStatus;
  statusLabel?: string;
  testID?: string;
}

const TONE_BG: Record<ResultTone, string> = {
  blue: colors.softBlue, green: colors.softGreen, red: colors.softRed, neutral: colors.card,
};
const TONE_FG: Record<ResultTone, string> = {
  blue: colors.primaryBlue, green: colors.successGreen, red: colors.dangerRed, neutral: colors.textDark,
};

export const StatusChip: React.FC<{ status: ResultStatus; label: string }> = ({ status, label }) => {
  const style = status === 'on' ? [c.chip, c.chipOn] : status === 'below' ? [c.chip, c.chipBelow]
    : status === 'above' ? [c.chip, c.chipAbove] : [c.chip, c.chipNeutral];
  const textStyle = status === 'on' ? c.chipOnText : status === 'below' ? c.chipBelowText
    : status === 'above' ? c.chipAboveText : c.chipNeutralText;
  return (
    <View style={style}>
      <Text style={[c.chipText, textStyle]} numberOfLines={1}>{label}</Text>
    </View>
  );
};

export const ResultCard: React.FC<ResultCardProps> = ({ label, value, meaning, tone = 'blue', status, statusLabel, testID }) => {
  const fg = TONE_FG[tone];
  return (
    <View style={[c.card, { backgroundColor: TONE_BG[tone] }, tone === 'neutral' && c.cardBorder]} testID={testID}>
      <View style={c.labelRow}>
        <Text style={[c.label, { color: fg }]} numberOfLines={2}>{label}</Text>
        {status && statusLabel ? <StatusChip status={status} label={statusLabel} /> : null}
      </View>
      <Text style={[c.value, { color: fg }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      {meaning ? <Text style={[c.meaning, { color: fg }]}>{meaning}</Text> : null}
    </View>
  );
};

const c = StyleSheet.create({
  card: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  cardBorder: { borderWidth: 1, borderColor: colors.border },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { ...typography.sectionLabel, flexShrink: 1 },
  value: { ...typography.cardValue, marginTop: 2 },
  meaning: { ...typography.bodySm, marginTop: 2, lineHeight: 18 },
  chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, flexShrink: 0 },
  chipText: { ...typography.micro, fontWeight: '700' },
  chipOn: { backgroundColor: colors.softGreen }, chipOnText: { color: colors.successGreen },
  chipBelow: { backgroundColor: colors.softRed }, chipBelowText: { color: colors.dangerRed },
  chipAbove: { backgroundColor: colors.softBlue }, chipAboveText: { color: colors.primaryBlue },
  chipNeutral: { backgroundColor: colors.inputMuted }, chipNeutralText: { color: colors.textMuted },
});
