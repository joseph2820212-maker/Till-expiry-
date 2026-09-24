/** E39 ReminderSettings and E04 ReminderIntro card: visible states (T40, T41), permission flow, persisted dismissal. */
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => ({ ...require('../../../__tests__/helpers/screenStubs').rn, Switch: 'Switch' }));
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/AppSwitch', () => ({ AppSwitch: 'AppSwitch' }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardScrollView }));
jest.mock('../../../components/forms/FormBits', () => {
  const R = require('react');
  return {
    Section: ({ children, title, hint, testID }: any) => R.createElement('Section', { title, hint, testID }, children),
    Field: 'Field', ChoiceChips: 'ChoiceChips',
    ErrorText: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
    Hint: ({ text }: any) => (text ? R.createElement('Text', null, text) : null),
  };
});
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));

const mockState: any = { current: { status: 'permission_required', scheduled: 0, planned: 3, failed: 0 } };
const mockPermission: any = { current: { state: 'undetermined', canAskAgain: true } };
const mockReconcile = jest.fn(async (_r?: string) => mockState.current);
const mockRequest = jest.fn(async () => 'granted');
const mockSave = jest.fn(async (_p: any) => ({}));
jest.mock('../reminderService', () => ({
  useReminderState: () => mockState.current,
  getReminderPermission: async () => mockPermission.current,
  reconcileReminders: (r?: string) => mockReconcile(r),
  requestReminderPermission: () => mockRequest(),
}));
jest.mock('../../settings/settingsStore', () => ({
  useReminderSettings: () => ({ schemaVersion: 1, dailySummary: { enabled: true, hour: 8, minute: 0 }, advanceDays: 1, sameDay: true, exactTime: { enabled: true, leadMinutes: 60 } }),
  saveReminderSettings: (p: any) => mockSave(p),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { ReminderSettingsScreen } from '../screens/ReminderSettingsScreen';
import { ReminderIntroCard, REMINDER_INTRO_DISMISSED_KEY } from '../ReminderIntroCard';
import { texts, button, flush } from '../../../__tests__/helpers/screenStubs';

const render = async (el: React.ReactElement) => {
  let r: any;
  await act(async () => { r = TestRenderer.create(el); await flush(); });
  return r;
};

beforeEach(() => {
  (AsyncStorage as any).clear();
  jest.clearAllMocks();
  mockState.current = { status: 'permission_required', scheduled: 0, planned: 3, failed: 0 };
  mockPermission.current = { state: 'undetermined', canAskAgain: true };
});

describe('ReminderSettingsScreen (E39)', () => {
  it('T40 shows permission_required with an allow button and the Today-is-authority hint', async () => {
    const r = await render(<ReminderSettingsScreen />);
    const all = texts(r);
    expect(all).toContain('reminders.statePermissionRequired');
    expect(all).toContain('reminders.authorityHint');
    expect(all).toContain('reminders.permissionNotAsked');
    await act(async () => { button(r, 'reminders.allow').props.onPress(); await flush(); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('a denied permission offers the phone settings instead', async () => {
    mockPermission.current = { state: 'denied', canAskAgain: false };
    const r = await render(<ReminderSettingsScreen />);
    expect(texts(r)).toContain('reminders.permissionDenied');
    await act(async () => { button(r, 'reminders.openSettings').props.onPress(); await flush(); });
    expect(Linking.openSettings).toHaveBeenCalled();
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('T41 schedule_failed is visible with a retry', async () => {
    mockState.current = { status: 'schedule_failed', scheduled: 4, planned: 6, failed: 2, lastRunIso: '2026-09-24T10:00:00Z' };
    mockPermission.current = { state: 'granted', canAskAgain: true };
    const r = await render(<ReminderSettingsScreen />);
    expect(texts(r)).toContain('reminders.stateFailed|scheduled=4,failed=2');
    await act(async () => { button(r, 'common.retry').props.onPress(); await flush(); });
    expect(mockReconcile).toHaveBeenCalledWith('retry');
  });

  it('saves a setting and reconciles; an invalid time is refused', async () => {
    mockState.current = { status: 'ok', scheduled: 5, planned: 5, failed: 0 };
    const r = await render(<ReminderSettingsScreen />);
    expect(texts(r)).toContain('reminders.stateOk|count=5');
    const sw = r.root.findAllByType('AppSwitch')[1]; // same-day
    await act(async () => { sw.props.onValueChange(false); await flush(); });
    expect(mockSave).toHaveBeenCalledWith({ sameDay: false });
    expect(mockReconcile).toHaveBeenCalledWith('settings');
    const field = r.root.findByType('Field');
    await act(async () => { field.props.onChangeText('25:00'); });
    await act(async () => { button(r, 'reminders.saveTime').props.onPress(); await flush(); });
    expect(r.root.findByType('Field').props.error).toBe('reminders.timeInvalid');
    await act(async () => { r.root.findByType('Field').props.onChangeText('07:30'); });
    await act(async () => { button(r, 'reminders.saveTime').props.onPress(); await flush(); });
    expect(mockSave).toHaveBeenLastCalledWith({ dailySummary: { enabled: true, hour: 7, minute: 30 } });
  });
});

describe('ReminderIntroCard (E04)', () => {
  it('explains first, asks only on tap, and hides once allowed', async () => {
    const r = await render(<ReminderIntroCard />);
    expect(texts(r)).toContain('reminderIntro.body');
    expect(mockRequest).not.toHaveBeenCalled();
    await act(async () => { button(r, 'reminderIntro.turnOn').props.onPress(); await flush(); });
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(r.toJSON()).toBeNull();
    expect(await AsyncStorage.getItem(REMINDER_INTRO_DISMISSED_KEY)).toBe('1');
  });

  it('T39 "Not now" continues without permission and stays dismissed', async () => {
    const r = await render(<ReminderIntroCard />);
    await act(async () => { button(r, 'reminderIntro.notNow').props.onPress(); await flush(); });
    expect(r.toJSON()).toBeNull();
    expect(mockRequest).not.toHaveBeenCalled();
    const again = await render(<ReminderIntroCard />);
    expect(again.toJSON()).toBeNull();
  });

  it('a refusal is explained and can be closed; hidden when already granted', async () => {
    mockRequest.mockResolvedValueOnce('denied');
    const r = await render(<ReminderIntroCard />);
    await act(async () => { button(r, 'reminderIntro.turnOn').props.onPress(); await flush(); });
    expect(texts(r)).toContain('reminderIntro.denied');
    await act(async () => { button(r, 'common.ok').props.onPress(); await flush(); });
    expect(r.toJSON()).toBeNull();
    (AsyncStorage as any).clear();
    mockPermission.current = { state: 'granted', canAskAgain: true };
    expect((await render(<ReminderIntroCard />)).toJSON()).toBeNull();
  });
});
