/** §22 reminder planner: the four types, bounds, DST, month precision, past items and snoozes (pure). */
import type { Batch, DeadlineValue, DateKind, Workspace } from '../../../domain/expiry/expiryTypes';
import { DEFAULT_STATUS_SETTINGS } from '../../../domain/expiry/expiryTypes';
import { DEFAULT_REMINDERS, type ReminderSettings } from '../../settings/settingsStore';
import { MAX_PLANNED, planReminders, REMINDER_ID_PREFIX, type PlanInput } from '../reminderPlan';

const t = (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}|${Object.entries(o).map(([a, b]) => `${a}=${b}`).join(',')}` : k);
const TZ = 'Europe/London';
const ws: Pick<Workspace, 'id' | 'name' | 'timeZone' | 'status'> = { id: 'ws1', name: 'Corner Shop', timeZone: TZ, status: 'active' };
let seq = 0;
function batch(kind: DateKind, deadline: DeadlineValue | undefined, extra: Partial<Batch> = {}): Batch {
  seq++;
  return {
    id: `b${seq}`, workspaceId: 'ws1', productId: 'p1', productName: `Item ${seq}`, kind: 'bought_in', dateKind: kind,
    datePrecision: deadline?.precision ?? 'date', timeZone: TZ, effective: { dateKind: kind, deadline, reason: deadline ? 'printed' : 'none' },
    status: 'active', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', schemaVersion: 1, ...extra,
  } as Batch;
}
const NOW = Date.parse('2026-09-24T09:00:00Z'); // 10:00 BST
function plan(batches: Batch[], over: Partial<PlanInput> = {}, settings: Partial<ReminderSettings> = {}) {
  return planReminders({ workspaces: [{ workspace: ws, batches }], settings: { ...DEFAULT_REMINDERS, ...settings }, status: DEFAULT_STATUS_SETTINGS, now: NOW, deviceTimeZone: TZ, t, ...over });
}
const iso = (ms: number) => new Date(ms).toISOString();
const noSummary = { dailySummary: { enabled: false, hour: 8, minute: 0 } };

describe('reminder planner', () => {
  it('plans the four types at the right instants', () => {
    const milk = batch('use_by', { precision: 'date', date: '2026-09-27' });
    const sandwich = batch('internal_cutoff', { precision: 'datetime', at: '2026-09-24T18:00:00+01:00' }, { kind: 'prepared' });
    const p = plan([milk, sandwich]);
    const ind = p.filter(r => r.type !== 'summary').map(r => [r.type, r.data.batchId, iso(r.at)]);
    expect(ind).toEqual([
      ['exact', sandwich.id, '2026-09-24T16:00:00.000Z'],   // 17:00 BST, 60 min before 18:00
      ['advance', milk.id, '2026-09-26T07:00:00.000Z'],     // 08:00 BST the day before
      ['same_day', milk.id, '2026-09-27T07:00:00.000Z'],    // 08:00 BST on the day
    ]);
    const summaries = p.filter(r => r.type === 'summary');
    // Today's 08:00 has passed: the next six mornings only.
    expect(summaries.map(r => iso(r.at))[0]).toBe('2026-09-25T07:00:00.000Z');
    expect(summaries.length).toBe(6);
    expect(summaries[0].body).toContain('reminders.summaryPastHard|count=1'); // the sandwich cutoff has passed by then
    expect(summaries[0].body).toContain('reminders.summaryDueSoon|count=1');
    expect(p.find(r => r.type === 'advance')!.title).toBe('reminders.advanceHardTitle|kind=dateKind.use_by,days=1');
    expect(p.every(r => r.identifier.startsWith(REMINDER_ID_PREFIX))).toBe(true);
  });

  it('is bounded, nearest first, and deterministic', () => {
    const many = Array.from({ length: 200 }, (_, i) => batch('use_by', { precision: 'date', date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}` }));
    const p = plan(many);
    expect(p.length).toBe(MAX_PLANNED);
    for (let i = 1; i < p.length; i++) expect(p[i].at).toBeGreaterThanOrEqual(p[i - 1].at);
    expect(plan(many).map(r => r.identifier)).toEqual(p.map(r => r.identifier));
    expect(new Set(p.map(r => r.identifier)).size).toBe(p.length);
    expect(plan(many, { max: 5 }).length).toBe(5);
  });

  it('only future triggers; a past item is never announced as a coming one (but the summary counts it)', () => {
    const past = batch('use_by', { precision: 'date', date: '2026-09-20' });
    const pastBb = batch('best_before', { precision: 'date', date: '2026-09-23' });
    const p = plan([past, pastBb]);
    expect(p.filter(r => r.type !== 'summary')).toEqual([]);
    expect(p.every(r => r.at > NOW)).toBe(true);
    expect(p[0].body).toBe('reminders.summaryPastHard|count=1 · reminders.summaryQualityReview|count=1');
  });

  it('a same-day morning after an exact cutoff is not planned', () => {
    const early = batch('internal_cutoff', { precision: 'datetime', at: '2026-09-26T07:30:00+01:00' });
    const p = plan([early], {}, noSummary);
    expect(p.map(r => r.type)).toEqual(['advance', 'exact']);
  });

  it('T07 exact times and mornings are correct across daylight-saving changes', () => {
    // Autumn: clocks go back 25 Oct 2026 02:00 BST → 01:00 GMT.
    const autumn = batch('internal_cutoff', { precision: 'datetime', at: '2026-10-25T10:00:00+00:00' });
    let p = plan([autumn], { now: Date.parse('2026-10-20T12:00:00Z') }, noSummary);
    expect(p.map(r => [r.type, iso(r.at)])).toEqual([
      ['advance', '2026-10-24T07:00:00.000Z'],   // 08:00 BST
      ['same_day', '2026-10-25T08:00:00.000Z'],  // 08:00 GMT
      ['exact', '2026-10-25T09:00:00.000Z'],     // 60 real minutes before 10:00 GMT
    ]);
    // A same-day morning that would coincide with the exact reminder is not repeated.
    const coincide = batch('internal_cutoff', { precision: 'datetime', at: '2026-10-25T09:00:00+00:00' });
    p = plan([coincide], { now: Date.parse('2026-10-20T12:00:00Z') }, noSummary);
    expect(p.map(r => [r.type, iso(r.at)])).toEqual([['advance', '2026-10-24T07:00:00.000Z'], ['exact', '2026-10-25T08:00:00.000Z']]);
    // Spring: clocks go forward 29 Mar 2026 01:00 GMT → 02:00 BST. A 90-minute lead crosses the gap in real time.
    const spring = batch('internal_cutoff', { precision: 'datetime', at: '2026-03-29T03:00:00+01:00' });
    p = plan([spring], { now: Date.parse('2026-03-25T12:00:00Z') }, { ...noSummary, advanceDays: 0, sameDay: false, exactTime: { enabled: true, leadMinutes: 90 } });
    expect(p.map(r => iso(r.at))).toEqual(['2026-03-29T00:30:00.000Z']); // 00:30 GMT = 90 min before 02:00Z
    const springDay = batch('use_by', { precision: 'date', date: '2026-03-29' });
    p = plan([springDay], { now: Date.parse('2026-03-25T12:00:00Z') }, noSummary);
    expect(p.map(r => iso(r.at))).toEqual(['2026-03-28T08:00:00.000Z', '2026-03-29T07:00:00.000Z']);
  });

  it('T03 month-only best-before uses the end of the month and keeps month wording', () => {
    const b = batch('best_before', { precision: 'month', month: '2026-10' });
    const p = plan([b], { now: Date.parse('2026-10-20T12:00:00Z') }, noSummary);
    expect(p.map(r => [r.type, iso(r.at)])).toEqual([['advance', '2026-10-30T08:00:00.000Z'], ['same_day', '2026-10-31T08:00:00.000Z']]);
    expect(p[0].title).toBe('reminders.advanceQualityTitle|kind=dateKind.best_before,days=1');
    expect(p[1].title).toBe('reminders.sameDayQualityTitle|kind=dateKind.best_before');
    expect(p[0].body).toContain('deadline.monthLine');
  });

  it('T09 a snooze silences individual warnings before it ends and never changes the deadline', () => {
    const b = batch('use_by', { precision: 'date', date: '2026-09-27' });
    const before = JSON.stringify(b);
    const p = plan([b], { snoozes: { [b.id]: '2026-09-27T00:00:00Z' } }, noSummary);
    expect(p.map(r => r.type)).toEqual(['same_day']);
    expect(JSON.stringify(b)).toBe(before);
    // An expired snooze has no effect.
    expect(plan([b], { snoozes: { [b.id]: '2026-09-01T00:00:00Z' } }, noSummary).map(r => r.type)).toEqual(['advance', 'same_day']);
  });

  it('skips completed / archived batches and hidden workspaces; undated items only count in the summary', () => {
    const done = batch('use_by', { precision: 'date', date: '2026-09-27' }, { status: 'completed' });
    const undated = batch('none', undefined);
    const p = plan([done, undated]);
    expect(p.filter(r => r.type !== 'summary')).toEqual([]);
    expect(p[0].body).toBe('reminders.summaryNeedsChecking|count=1');
    const hidden = planReminders({ workspaces: [{ workspace: { ...ws, status: 'hidden' }, batches: [batch('use_by', { precision: 'date', date: '2026-09-27' })] }], settings: DEFAULT_REMINDERS, status: DEFAULT_STATUS_SETTINGS, now: NOW, deviceTimeZone: TZ, t });
    expect(hidden).toEqual([]);
  });

  it('every type can be switched off; nothing to report means no summary', () => {
    const b = batch('use_by', { precision: 'date', date: '2026-09-27' });
    expect(plan([b], {}, { ...noSummary, advanceDays: 0, sameDay: false, exactTime: { enabled: false, leadMinutes: 60 } })).toEqual([]);
    expect(plan([])).toEqual([]);
  });

  it('names the workspace when several businesses are planned', () => {
    const a = batch('use_by', { precision: 'date', date: '2026-09-27' });
    const b = batch('use_by', { precision: 'date', date: '2026-09-28' }, { workspaceId: 'ws2' });
    const p = planReminders({ workspaces: [{ workspace: ws, batches: [a] }, { workspace: { ...ws, id: 'ws2', name: 'Kitchen' }, batches: [b] }], settings: { ...DEFAULT_REMINDERS, ...noSummary }, status: DEFAULT_STATUS_SETTINGS, now: NOW, deviceTimeZone: TZ, t });
    expect(p.find(r => r.data.batchId === b.id)!.body).toContain('reminders.bodyWithWorkspace|workspace=Kitchen');
  });
});
