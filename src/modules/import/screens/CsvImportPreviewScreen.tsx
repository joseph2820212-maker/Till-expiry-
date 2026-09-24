/**
 * E33 CsvImportPreview — steps 4–10 of §19.3. Shows what the import WOULD do (new / updated / skipped / errors),
 * every row problem, duplicate and conflict (virtualised list), and writes nothing until the user confirms (T38).
 * Confirm runs ONE atomic import (all rows or nothing) and records it in the import history, which is listed here.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { AppButton } from '../../../components/AppButton';
import { AppAlert } from '../../../components/AppAlert';
import { EmptyState } from '../../../components/EmptyState';
import { LabelRow } from '../../../components/LabelRow';
import { Section, ErrorText, Hint } from '../../../components/forms/FormBits';
import { colors } from '../../../theme/colors';
import { spacing } from '../../../theme/spacing';
import { typography } from '../../../theme/typography';
import type { TabStackParamList } from '../../../navigation/AppNavigator';
import { useWorkspaceData } from '../../../hooks/useWorkspaceData';
import { newId } from '../../../storage/entityStore';
import { DomainError } from '../../../storage/repoHelpers';
import { localDateTime } from '../../../utils/locale';
import { commitImport, loadImportContext, planImport, type ImportHistoryRecord, type ImportResult, type RowIssue } from '../csvImport';
import { clearImportSession, getImportSession } from '../importSession';

type Nav = NativeStackNavigationProp<TabStackParamList>;
type T = (k: string, o?: Record<string, unknown>) => string;

/** Codes the import itself can fail with (anything else is a generic save error). */
const IMPORT_ERRORS = new Set(['alreadyImported', 'importChanged', 'moneyNoCurrency', 'nothingToImport', 'noWorkspace', 'nameRequired', 'productIdRequired', 'dateRequired']);

export function importErrorMessage(t: T, e: unknown): string {
  if (e instanceof DomainError && IMPORT_ERRORS.has(e.code)) return t(`import.error.${e.code}`);
  return t('import.error.failed');
}

export function issueText(t: T, i: RowIssue): string {
  const params: Record<string, unknown> = { ...(i.params ?? {}), value: i.value ?? '', field: i.field ? t(`import.field.${i.field}`) : '' };
  if (i.code.startsWith('deadline_') && i.params?.kind) params.kind = t(`dateKind.${i.params.kind}`);
  return t(`import.issue.${i.code}`, params);
}

const SEVERITY_COLOR: Record<RowIssue['severity'], string> = { error: colors.dangerRed, skip: colors.textMuted, warning: colors.textDark };

const IssueRow = React.memo(({ issue, t }: { issue: RowIssue; t: T }) => (
  <View style={s.issue}>
    <Text style={[s.issueTag, { color: SEVERITY_COLOR[issue.severity] }]}>{t('import.issueLine', { line: issue.line })} · {t(`import.severity.${issue.severity}`)}</Text>
    <Text style={s.issueText}>{issueText(t, issue)}</Text>
  </View>
));

const HistoryRow: React.FC<{ r: ImportHistoryRecord; t: T }> = ({ r, t }) => (
  <View style={s.history}>
    <Text style={s.historyTitle} numberOfLines={2}>{r.fileName}</Text>
    <Text style={s.historyMeta}>{t(`import.kind.${r.kind}`)} · {localDateTime(r.at)}</Text>
    <Text style={s.historyMeta}>{t('import.historyCounts', { created: r.createdCount, updated: r.updatedCount ?? 0, skipped: r.skippedCount })}</Text>
  </View>
);

export const CsvImportPreviewScreen: React.FC = () => {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const { params } = useRoute<RouteProp<TabStackParamList, 'CsvImportPreview'>>();
  const kind = params?.kind === 'batches' ? 'batches' : 'products';
  const { data: ctx, error, workspace } = useWorkspaceData(w => loadImportContext(w));
  const session = getImportSession(kind, workspace?.id);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const requestId = useRef(newId('req'));

  // The plan is recomputed against the live workspace data (it reloads after any change elsewhere).
  const plan = useMemo(() => (session && ctx && ctx.workspace.id === session.workspaceId ? planImport(kind, session.csv, session.options, ctx) : null), [session, ctx, kind]);
  useEffect(() => () => { if (result) clearImportSession(); }, [result]);

  const confirm = async () => {
    if (!plan || inFlight.current || plan.blockers.length) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await commitImport(plan, requestId.current);
      setResult(r);
    } catch (e) {
      AppAlert.error(importErrorMessage(t, e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const history = ctx?.history.slice(0, 10) ?? [];
  const historySection = history.length ? (
    <Section title={t('import.history')}>
      {history.map(r => <HistoryRow key={r.id} r={r} t={t} />)}
    </Section>
  ) : null;

  if (result) {
    const r = result.record;
    return (
      <View style={s.root}>
        <ScreenHeader title={t(`import.title.${kind}`)} subtitle={r.fileName} onBack={() => nav.goBack()} />
        <FlatList
          data={[]}
          renderItem={null}
          contentContainerStyle={s.content}
          ListHeaderComponent={(
            <View style={s.stack}>
              <Section title={t('import.result.title')} testID="import-result">
                <LabelRow label={t('import.count.created')} value={String(r.createdCount)} tone="success" />
                {kind === 'products' ? <LabelRow label={t('import.count.updated')} value={String(r.updatedCount)} /> : null}
                {kind === 'batches' ? <LabelRow label={t('import.count.newProducts')} value={String(r.newProductCount ?? 0)} /> : null}
                <LabelRow label={t('import.count.notImported')} value={String(r.skippedCount)} tone={r.errorCount ? 'danger' : 'muted'} />
                <Hint text={t('import.result.hint')} />
              </Section>
              <AppButton label={t('common.done')} onPress={() => nav.goBack()} />
              {historySection}
            </View>
          )}
        />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={s.root}>
        <ScreenHeader title={t(`import.title.${kind}`)} onBack={() => nav.goBack()} />
        <View style={s.content}>
          <EmptyState icon="document-text-outline" title={t('import.noSession.title')} body={t('import.noSession.body')} />
          <AppButton label={t('common.back')} onPress={() => nav.goBack()} variant="secondary" />
        </View>
      </View>
    );
  }

  const c = plan?.counts;
  const writes = c ? c.new + c.updated : 0;
  const header = (
    <View style={s.stack}>
      {error ? <ErrorText text={t('errors.loadFailed')} /> : null}
      {plan && c ? (
        <>
          <Section title={t('import.summary')} testID="import-summary">
            <LabelRow label={t('import.count.rows')} value={String(c.rows)} />
            <LabelRow label={t(kind === 'products' ? 'import.count.newProductsRows' : 'import.count.newBatches')} value={String(c.new)} tone="success" />
            {kind === 'products' ? <LabelRow label={t('import.count.updated')} value={String(c.updated)} /> : null}
            {kind === 'batches' ? <LabelRow label={t('import.count.newProducts')} value={String(c.newProducts)} /> : null}
            {c.newLocations ? <LabelRow label={t('import.count.newLocations')} value={String(c.newLocations)} /> : null}
            <LabelRow label={t('import.count.skipped')} value={String(c.skipped)} tone="muted" />
            <LabelRow label={t('import.count.errors')} value={String(c.errors)} tone={c.errors ? 'danger' : 'default'} />
            {c.conflicts ? <LabelRow label={t('import.count.conflicts')} value={String(c.conflicts)} /> : null}
            {c.warnings ? <LabelRow label={t('import.count.warnings')} value={String(c.warnings)} /> : null}
            {plan.blockers.map(b => <ErrorText key={b} text={t(`import.blocker.${b}`)} />)}
            {c.errors && !plan.blockers.length ? <Hint text={t('import.errorsNotImported')} /> : null}
            <Hint text={t('import.atomicHint')} />
          </Section>
          <AppButton
            label={writes ? t('import.confirm', { count: writes }) : t('import.confirmNothing')}
            onPress={confirm}
            loading={busy}
            disabled={busy || !!plan.blockers.length || writes === 0}
            testID="import-confirm"
          />
          <AppButton label={t('import.changeMapping')} onPress={() => nav.goBack()} variant="secondary" disabled={busy} />
          {plan.issues.length ? <Text style={s.listTitle}>{t('import.issues', { count: plan.issues.length })}</Text> : <Hint text={t('import.noIssues')} />}
        </>
      ) : (
        <Hint text={t('common.loading')} />
      )}
    </View>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title={t(`import.title.${kind}`)} subtitle={session.csv.fileName} onBack={() => nav.goBack()} />
      <FlatList
        data={plan?.issues ?? []}
        keyExtractor={(i, n) => `${i.line}:${i.code}:${n}`}
        renderItem={({ item }) => <IssueRow issue={item} t={t} />}
        ListHeaderComponent={header}
        ListFooterComponent={historySection ? <View style={s.footer}>{historySection}</View> : null}
        contentContainerStyle={s.content}
        initialNumToRender={20}
        windowSize={7}
        removeClippedSubviews
        testID="import-issues"
      />
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenPadding, paddingBottom: spacing.scrollBottom, gap: spacing.sm },
  stack: { gap: spacing.md, marginBottom: spacing.sm },
  footer: { marginTop: spacing.md },
  listTitle: { ...typography.sectionLabel, color: colors.textMuted, marginTop: spacing.sm },
  issue: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 2 },
  issueTag: { ...typography.bodySm, fontWeight: '700' },
  issueText: { ...typography.body, color: colors.textDark, lineHeight: 20 },
  history: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 2 },
  historyTitle: { ...typography.body, color: colors.textDark, fontWeight: '700' },
  historyMeta: { ...typography.bodySm, color: colors.textMuted },
});
