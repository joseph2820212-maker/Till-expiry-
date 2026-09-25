/**
 * EXP-REV-07 (Option B, documented in docs/STATE.md D9): reminders are best effort. The app declares neither
 * SCHEDULE_EXACT_ALARM nor USE_EXACT_ALARM; on Android 12+ expo-notifications then schedules inexact alarms
 * (setAndAllowWhileIdle), which Android may deliver later than the selected time, with no fixed maximum delay. No
 * user-facing text promises an exact time or a delay window (P2-02);
 * the Today screen, computed from stored dates, stays authoritative (T45).
 */
import appJson from '../../app.json';
import en from '../locales/en.json';

describe('reminder delivery policy', () => {
  it('exact-alarm permissions are blocked, notification permission is declared', () => {
    const android = (appJson as any).expo.android;
    expect(android.permissions).toContain('android.permission.POST_NOTIFICATIONS');
    expect(android.permissions ?? []).not.toContain('android.permission.SCHEDULE_EXACT_ALARM');
    expect(android.permissions ?? []).not.toContain('android.permission.USE_EXACT_ALARM');
    expect(android.blockedPermissions).toEqual(expect.arrayContaining(['android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_EXACT_ALARM']));
  });
  it('reminder texts say best effort, point to Today, and promise neither an exact time nor a maximum delay', () => {
    const r = (en as any).reminders;
    const l1 = (en as any).help.guide.reminders.l1;
    expect(r.exactHint).toMatch(/later than the selected time/);
    expect(r.exactHint).toMatch(/Open Today/);
    expect(l1).toMatch(/best effort/);
    expect(l1).toMatch(/no guaranteed time/);
    for (const s of [r.exactSection, r.exactToggle, r.exactHint, l1]) {
      expect(s).not.toMatch(/exact(ly)? (time|minute)|on the dot/i);
      expect(s).not.toMatch(/\b(few|\d+) (seconds?|minutes?|hours?) (late|later|delay)/i); // no promised delay window
    }
  });
});
