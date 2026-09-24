import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

/** Block format shared by help, user guide and legal documents (ported from Till Note). */
export type ContentBlock =
  | { k: 'p'; t: string }
  | { k: 'h'; t: string }
  | { k: 'li'; t: string }
  | { k: 'note'; t: string }
  | { k: 'formula'; t: string };

export interface ContentDoc { id: string; title: string; intro?: string; blocks: ContentBlock[] }

export const DocBlocks: React.FC<{ doc: Pick<ContentDoc, 'intro' | 'blocks'> }> = ({ doc }) => (
  <View>
    {doc.intro ? <Text style={s.intro}>{doc.intro}</Text> : null}
    {doc.blocks.map((b, i) => {
      if (b.k === 'h') return <Text key={i} style={s.h}>{b.t}</Text>;
      if (b.k === 'li') return <View key={i} style={s.liRow}><Text style={s.bullet}>•</Text><Text style={s.li}>{b.t}</Text></View>;
      if (b.k === 'note') return <View key={i} style={s.note}><Text style={s.noteText}>{b.t}</Text></View>;
      if (b.k === 'formula') return <View key={i} style={s.formula}><Text style={s.formulaText}>{b.t}</Text></View>;
      return <Text key={i} style={s.p}>{b.t}</Text>;
    })}
  </View>
);

const s = StyleSheet.create({
  intro: { ...typography.body, color: colors.textMuted, lineHeight: 20, marginBottom: 12, fontStyle: 'italic' },
  h: { ...typography.sectionTitle, color: colors.textDark, marginTop: 14, marginBottom: 6 },
  p: { ...typography.body, color: colors.textMuted, lineHeight: 21, marginBottom: 8 },
  liRow: { flexDirection: 'row', gap: 8, marginBottom: 4, paddingEnd: 8 },
  bullet: { ...typography.body, color: colors.textMuted, lineHeight: 21 },
  li: { ...typography.body, color: colors.textMuted, lineHeight: 21, flex: 1 },
  note: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginVertical: 8, borderStartWidth: 3, borderStartColor: colors.warningOrange },
  noteText: { ...typography.bodySm, color: colors.textDark, lineHeight: 19 },
  formula: { backgroundColor: colors.inputMuted, borderRadius: 10, padding: 10, marginVertical: 6 },
  formulaText: { ...typography.bodySm, color: colors.textDark, lineHeight: 19, fontWeight: '700' },
});
