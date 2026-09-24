/** Master handoff §31 — domain / date acceptance tests (pure engine). */
import { deadlineInstant, endOfLocalDay, isoInZone, localDateOf, monthEndDate, todayIn, zonedIso, zonedTimeToInstant, zoneOffsetMinutes } from '../datePrecision';
import { boughtInDeadline, openedDeadline, preparedDeadline } from '../deadlineEngine';
import { evaluateDeadline, groupOf, priceActionAllowed } from '../statusEngine';
import { validateDeadline, validateRule } from '../expiryValidation';
import { ruleDeadlineAt, snapshotRule } from '../ruleEngine';
import { rankBatches } from '../expirySort';
import { DEFAULT_STATUS_SETTINGS as S, type Batch, type ExpiryRule } from '../expiryTypes';

const LON = 'Europe/London';
const at = (iso: string) => Date.parse(iso);
const rule = (over: Partial<ExpiryRule> = {}): ExpiryRule => ({ id: 'r1', workspaceId: 'w', name: 'Open sauce', appliesTo: 'after_opening', class: 'hard_cutoff', durationMinutes: 3 * 1440, sourceText: 'Manufacturer: use within 3 days of opening', status: 'active', version: 1, createdAt: '', updatedAt: '', ...over });

describe('T02 / T03 / T04 date meanings and precision', () => {
  it('T04 use-by rejects month-only precision; best-before accepts it', () => {
    expect(validateDeadline('use_by', { precision: 'month', month: '2026-10' })).toBe('monthNotAllowed');
    expect(validateDeadline('internal_cutoff', { precision: 'month', month: '2026-10' })).toBe('monthNotAllowed');
    expect(validateDeadline('best_before', { precision: 'month', month: '2026-10' })).toBeNull();
    expect(validateDeadline('use_by', { precision: 'date', date: '2026-10-03' })).toBeNull();
    expect(validateDeadline('use_by', undefined)).toBe('dateRequired');
    expect(validateDeadline('none', { precision: 'date', date: '2026-10-03' })).toBe('noDateAllowed');
    expect(validateDeadline('use_by', { precision: 'date', date: '2026-02-30' })).toBe('invalidDate');
    expect(validateDeadline('use_by', { precision: 'datetime', at: '2026-10-03T10:00:00' })).toBe('invalidDate'); // no offset
  });
  it('T03 month-only best-before keeps month precision and sorts on the last day of that month', () => {
    const info = boughtInDeadline('best_before', { precision: 'month', month: '2026-09' });
    expect(info.deadline).toEqual({ precision: 'month', month: '2026-09' });
    expect(monthEndDate('2026-02')).toBe('2026-02-28');
    const now = at('2026-09-29T12:00:00Z');
    expect(evaluateDeadline(info, LON, now, S).status).toBe('quality_soon');
    expect(evaluateDeadline(info, LON, at('2026-09-30T12:00:00Z'), S).status).toBe('quality_due');
    expect(evaluateDeadline(info, LON, at('2026-10-01T09:00:00Z'), S).status).toBe('quality_past_review');
  });
  it('T02 use-by and best-before on the same day get different statuses and wording classes', () => {
    const now = at('2026-09-26T09:00:00Z');
    const useBy = evaluateDeadline(boughtInDeadline('use_by', { precision: 'date', date: '2026-09-25' }), LON, now, S);
    const bestBefore = evaluateDeadline(boughtInDeadline('best_before', { precision: 'date', date: '2026-09-25' }), LON, now, S);
    expect(useBy).toMatchObject({ status: 'past_deadline', isHard: true });
    expect(bestBefore).toMatchObject({ status: 'quality_past_review', isHard: false });
    expect(groupOf(useBy.status)).toBe('past_hard');
    expect(groupOf(bestBefore.status)).toBe('quality_review');
  });
});

describe('T05 / T06 / T07 time zones', () => {
  it('T05 a date-only value is a calendar day in the workspace zone, never shifted by UTC', () => {
    const info = boughtInDeadline('use_by', { precision: 'date', date: '2026-09-25' });
    // 23:30 on 25 Sep in New York is already 26 Sep in UTC: still "due today" in New York.
    expect(evaluateDeadline(info, 'America/New_York', at('2026-09-26T03:30:00Z'), S).status).toBe('due_today');
    // 00:30 on 26 Sep in Tokyo is still 25 Sep in UTC: already past in Tokyo.
    expect(evaluateDeadline(info, 'Asia/Tokyo', at('2026-09-25T15:30:00Z'), S).status).toBe('past_deadline');
    expect(todayIn('Pacific/Auckland', at('2026-09-25T12:30:00Z'))).toBe('2026-09-26');
  });
  it('T06 an exact prepared deadline is an offset-aware instant in the workspace zone', () => {
    const r = snapshotRule(rule({ appliesTo: 'after_preparation', durationMinutes: 4 * 60 }));
    const d = preparedDeadline({ preparedAt: '2026-07-01T10:00:00+01:00', rule: r, tz: LON });
    expect(d.effective).toEqual({ dateKind: 'internal_cutoff', deadline: { precision: 'datetime', at: '2026-07-01T14:00:00+01:00' }, reason: 'rule' });
    expect(evaluateDeadline(d.effective, LON, at('2026-07-01T12:59:00Z'), S).status).toBe('due_today');
    expect(evaluateDeadline(d.effective, LON, at('2026-07-01T13:00:00Z'), S).status).toBe('past_deadline');
    expect(zonedIso('2026-07-01', '10:00', 'Asia/Kolkata')).toBe('2026-07-01T10:00:00+05:30');
  });
  it('T07 daylight-saving changes: offsets, skipped and repeated hours, and a 24 h rule across the change', () => {
    expect(zoneOffsetMinutes(at('2026-03-29T00:30:00Z'), LON)).toBe(0);
    expect(zoneOffsetMinutes(at('2026-03-29T01:30:00Z'), LON)).toBe(60);
    // 01:30 does not exist in London on 29 Mar 2026: it resolves forward to 02:30 BST.
    expect(isoInZone(zonedTimeToInstant('2026-03-29', '01:30', LON), LON)).toBe('2026-03-29T02:30:00+01:00');
    // 01:30 happens twice on 25 Oct 2026: the first (BST) occurrence is used.
    expect(isoInZone(zonedTimeToInstant('2026-10-25', '01:30', LON), LON)).toBe('2026-10-25T01:30:00+01:00');
    const r = snapshotRule(rule({ durationMinutes: 24 * 60 }));
    expect(ruleDeadlineAt(r, '2026-03-28T12:00:00+00:00', LON)).toBe('2026-03-29T13:00:00+01:00'); // 24 real hours
    expect(localDateOf(endOfLocalDay('2026-03-29', LON), LON)).toBe('2026-03-29');
    expect(localDateOf(endOfLocalDay('2026-10-25', LON) + 1, LON)).toBe('2026-10-26');
  });
});

describe('T08 / T19 missing dates', () => {
  it('no date → needs checking, never an "okay" state', () => {
    const e = evaluateDeadline(boughtInDeadline('none', undefined), LON, Date.now(), S);
    expect(e.status).toBe('unknown');
    expect(groupOf(e.status)).toBe('needs_checking');
    const prepared = preparedDeadline({ preparedAt: '2026-09-24T09:00:00+01:00', tz: LON });
    expect(evaluateDeadline(prepared.effective, LON, Date.now(), S).status).toBe('unknown');
  });
});

describe('T13 / T14 opened items', () => {
  const tz = LON;
  it('T13 an earlier original hard use-by wins over the after-opening hard rule', () => {
    const parent = { effective: boughtInDeadline('use_by', { precision: 'date', date: '2026-09-26' }) };
    const d = openedDeadline({ parent, openedAt: '2026-09-25T09:00:00+01:00', rule: snapshotRule(rule()), tz });
    expect(d.effective).toEqual({ dateKind: 'use_by', deadline: { precision: 'date', date: '2026-09-26' }, reason: 'original_hard' });
    expect(d.own.deadline).toEqual({ precision: 'datetime', at: '2026-09-28T09:00:00+01:00' });
    const later = openedDeadline({ parent: { effective: boughtInDeadline('use_by', { precision: 'date', date: '2026-10-30' }) }, openedAt: '2026-09-25T09:00:00+01:00', rule: snapshotRule(rule()), tz });
    expect(later.effective.reason).toBe('rule');
    expect(later.effective.dateKind).toBe('internal_cutoff');
  });
  it('T14 an original best-before stays visible as a quality date and never becomes the hard cutoff', () => {
    const parent = { effective: boughtInDeadline('best_before', { precision: 'month', month: '2027-03' }) };
    const d = openedDeadline({ parent, openedAt: '2026-09-25T09:00:00+01:00', rule: snapshotRule(rule()), tz });
    expect(d.effective).toMatchObject({ dateKind: 'internal_cutoff', reason: 'rule' });
    expect(d.secondary).toEqual({ dateKind: 'best_before', deadline: { precision: 'month', month: '2027-03' }, reason: 'original_quality' });
    const qualityRule = openedDeadline({ parent, openedAt: '2026-09-25T09:00:00+01:00', rule: snapshotRule(rule({ class: 'quality_review' })), tz });
    expect(qualityRule.effective.dateKind).toBe('quality_review');
    expect(qualityRule.secondary?.dateKind).toBe('best_before');
    // A best-before earlier than a quality rule result: both remain quality dates.
    const early = openedDeadline({ parent: { effective: boughtInDeadline('best_before', { precision: 'date', date: '2026-09-26' }) }, openedAt: '2026-09-25T09:00:00+01:00', rule: snapshotRule(rule({ class: 'quality_review' })), tz });
    expect(early.effective).toMatchObject({ dateKind: 'best_before', reason: 'original_quality' });
    expect(evaluateDeadline(early.effective, tz, at('2026-09-27T09:00:00Z'), S).status).toBe('quality_past_review');
  });
  it('a direct deadline is compared with the original hard date the same way', () => {
    const parent = { effective: boughtInDeadline('use_by', { precision: 'date', date: '2026-09-26' }) };
    const d = openedDeadline({ parent, openedAt: '2026-09-25T09:00:00+01:00', direct: { kind: 'use_by', deadline: { precision: 'date', date: '2026-09-25' } }, tz });
    expect(d.effective.reason).toBe('direct');
  });
});

describe('rules', () => {
  it('every rule needs a name, a source and (for opening / preparation) a duration; no built-in durations', () => {
    expect(validateRule({ name: 'x', sourceText: '', appliesTo: 'after_opening', durationMinutes: 60 })).toBe('sourceRequired');
    expect(validateRule({ name: 'x', sourceText: 'Our HACCP plan', appliesTo: 'after_opening' })).toBe('durationRequired');
    expect(validateRule({ name: 'x', sourceText: 'Our HACCP plan', appliesTo: 'after_opening', durationMinutes: 0 })).toBe('badDuration');
    expect(validateRule({ name: 'x', sourceText: 'Our HACCP plan', appliesTo: 'manual_review' })).toBeNull();
  });
});

describe('status bands, sorting and the price action', () => {
  const base = (id: string, info: Batch['effective']): Batch => ({ id, workspaceId: 'w', productId: 'p', productName: id, kind: 'bought_in', dateKind: info.dateKind, datePrecision: 'date', timeZone: LON, effective: info, status: 'active', createdAt: '', updatedAt: '', schemaVersion: 1 });
  const now = at('2026-09-24T09:00:00Z');
  it('urgent = tomorrow for dates / within 24 h for exact times; soon within soonDays', () => {
    expect(evaluateDeadline(boughtInDeadline('use_by', { precision: 'date', date: '2026-09-25' }), LON, now, S).status).toBe('urgent');
    expect(evaluateDeadline(boughtInDeadline('use_by', { precision: 'date', date: '2026-09-27' }), LON, now, S).status).toBe('soon');
    expect(evaluateDeadline(boughtInDeadline('use_by', { precision: 'date', date: '2026-09-28' }), LON, now, S).status).toBe('later');
    expect(evaluateDeadline(boughtInDeadline('internal_cutoff', { precision: 'datetime', at: '2026-09-25T08:00:00+01:00' }), LON, now, S).status).toBe('urgent');
  });
  it('queue order: past hard, today, urgent, needs checking, quality past review, soon…', () => {
    const list = [
      base('later', boughtInDeadline('use_by', { precision: 'date', date: '2026-12-01' })),
      base('qpast', boughtInDeadline('best_before', { precision: 'date', date: '2026-09-01' })),
      base('unknown', boughtInDeadline('none', undefined)),
      base('past', boughtInDeadline('use_by', { precision: 'date', date: '2026-09-20' })),
      base('today', boughtInDeadline('use_by', { precision: 'date', date: '2026-09-24' })),
    ];
    expect(rankBatches(list, now, S).map(r => r.batch.id)).toEqual(['past', 'today', 'unknown', 'qpast', 'later']);
  });
  it('T57 (engine) no price action after a hard use-by; allowed for a past best-before', () => {
    expect(priceActionAllowed(base('a', boughtInDeadline('use_by', { precision: 'date', date: '2026-09-20' })), now, S)).toBe(false);
    expect(priceActionAllowed(base('b', boughtInDeadline('best_before', { precision: 'date', date: '2026-09-20' })), now, S)).toBe(true);
  });
  it('deadlineInstant orders month, date and exact values consistently', () => {
    expect(deadlineInstant({ precision: 'month', month: '2026-09' }, LON)).toBe(deadlineInstant({ precision: 'date', date: '2026-09-30' }, LON));
    expect(deadlineInstant({ precision: 'datetime', at: '2026-09-30T23:00:00+01:00' }, LON)).toBeLessThan(deadlineInstant({ precision: 'date', date: '2026-09-30' }, LON));
  });
});
