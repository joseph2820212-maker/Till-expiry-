/**
 * EXP-REV-07 (Option B, documented in docs/STATE.md D9): reminders are best effort. The app declares neither
 * SCHEDULE_EXACT_ALARM nor USE_EXACT_ALARM; on Android 12+ expo-notifications then schedules inexact alarms
 * (setAndAllowWhileIdle), which Android may deliver a few minutes late. No user-facing text promises an exact time;
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
  it('reminder texts say best effort and never promise an exact time', () => {
    const r = (en as any).reminders;
    expect(r.exactHint).toMatch(/few minutes late/);
    expect(r.exactHint).toMatch(/Today screen/);
    const reminderTexts = [r.exactSection, r.exactToggle, (en as any).help.guide.reminders.l1];
    for (const s of reminderTexts) expect(s).not.toMatch(/exact(ly)? (time|minute)|on the dot|guaranteed/i);
  });
});
