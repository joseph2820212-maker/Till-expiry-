/** E35 BackupRestore and E36 RestorePreview: create, pick → preview hand-over, confirmation gate, failure states. */
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/CheckboxRow', () => ({ CheckboxRow: 'CheckboxRow' }));
jest.mock('../../../components/EmptyState', () => ({ EmptyState: 'EmptyState' }));
jest.mock('../../../components/BackupPassphraseModal', () => ({ BackupPassphraseModal: 'BackupPassphraseModal' }));
jest.mock('../../../components/AppKeyboardScrollView', () => ({ AppKeyboardScrollView: require('../../../__tests__/helpers/screenStubs').components.AppKeyboardScrollView }));
jest.mock('../../../components/forms/FormBits', () => {
  const R = require('react');
  return { Section: ({ children, title, hint }: any) => R.createElement('Section', { title, hint }, children) };
});
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
const mockAlert = { alert: jest.fn(), success: jest.fn(), error: jest.fn() };
jest.mock('../../../components/AppAlert', () => ({ get AppAlert() { return mockAlert; } }));
const mockPick: any = { next: { canceled: true, assets: null } };
jest.mock('expo-document-picker', () => ({ getDocumentAsync: async () => mockPick.next }));

const mockApi = {
  createBackup: jest.fn(),
  loadLastBackupAt: jest.fn(async () => null),
  readBackupFile: jest.fn(async (..._a: unknown[]) => '{}'),
  checkBackupHeader: jest.fn((..._a: unknown[]) => ({ createdAt: '2026-09-20T08:00:00.000Z', appVersion: '0.1.0', enc: {} })),
  parseBackup: jest.fn(),
  restoreParsed: jest.fn(),
};
jest.mock('../backupFile', () => {
  class BackupError extends Error { code: string; constructor(c: string) { super(c); this.code = c; this.name = 'BackupError'; } }
  return {
    BackupError,
    createBackup: (...a: unknown[]) => mockApi.createBackup(...a),
    loadLastBackupAt: () => mockApi.loadLastBackupAt(),
    readBackupFile: (...a: unknown[]) => mockApi.readBackupFile(...a),
    checkBackupHeader: (...a: unknown[]) => mockApi.checkBackupHeader(...a),
    parseBackup: (...a: unknown[]) => mockApi.parseBackup(...a),
    restoreParsed: (...a: unknown[]) => mockApi.restoreParsed(...a),
  };
});

import { BackupRestoreScreen } from '../screens/BackupRestoreScreen';
import { RestorePreviewScreen } from '../screens/RestorePreviewScreen';
import { clearRestoreSession, getRestoreSession, setRestoreSession } from '../restoreSession';
import { BackupError } from '../backupFile';
import { __setScopeForTests } from '../../../storage/scope';
import { navState, texts, button, flush } from '../../../__tests__/helpers/screenStubs';

const render = async (el: React.ReactElement) => {
  let r: any;
  await act(async () => { r = TestRenderer.create(el); await flush(); });
  return r;
};
const press = async (fn: () => unknown) => { await act(async () => { await fn(); await new Promise(res => setTimeout(res, 60)); }); };

const PARSED = {
  header: { createdAt: '2026-09-20T08:00:00.000Z', appVersion: '0.1.0' },
  data: {},
  keyCount: 12,
  workspaces: [{ id: 'ws_a', name: 'Corner Shop', hidden: false, products: 4, batches: 7, events: 9, rules: 1, locations: 2, lists: 0, imports: 0 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  clearRestoreSession();
  __setScopeForTests('real');
  mockPick.next = { canceled: true, assets: null };
});

describe('E35 BackupRestore', () => {
  it('creates a backup with the passphrase from the modal and reports the file', async () => {
    mockApi.createBackup.mockResolvedValueOnce({ fileName: 'TillExpiry-backup-2026-09-24-0905.tillexpiry', shared: true, createdAt: '2026-09-24T08:05:00.000Z', skipped: [] });
    const r = await render(<BackupRestoreScreen />);
    await press(() => button(r, 'backup.createNow').props.onPress());
    const modal = r.root.findByType('BackupPassphraseModal');
    expect(modal.props.visible).toBe(true);
    expect(modal.props.mode).toBe('create');
    await press(() => modal.props.onConfirm('a long passphrase'));
    expect(mockApi.createBackup).toHaveBeenCalledWith('a long passphrase');
    expect(mockAlert.success).toHaveBeenCalledWith('backup.createdTitle', expect.stringContaining('backup.createdShared'));
  });

  it('a picked TillExpiry file is handed to RestorePreview through the session, not nav params', async () => {
    mockPick.next = { canceled: false, assets: [{ uri: 'file:///x.tillexpiry', name: 'x.tillexpiry', size: 1000 }] };
    const r = await render(<BackupRestoreScreen />);
    await press(() => button(r, 'backup.chooseFile').props.onPress());
    expect(navState.navigate).toHaveBeenCalledWith('RestorePreview');
    expect(getRestoreSession()).toMatchObject({ file: { uri: 'file:///x.tillexpiry', name: 'x.tillexpiry' }, appVersion: '0.1.0' });
  });

  it('T50 a file from another app is refused on the spot with its own message', async () => {
    mockPick.next = { canceled: false, assets: [{ uri: 'file:///calc.json', name: 'calc.json' }] };
    mockApi.checkBackupHeader.mockImplementationOnce(() => { throw new BackupError('tillCalcBackup'); });
    const r = await render(<BackupRestoreScreen />);
    await press(() => button(r, 'backup.chooseFile').props.onPress());
    expect(navState.navigate).not.toHaveBeenCalled();
    expect(texts(r)).toContain('backup.err.tillCalcBackup');
    expect(getRestoreSession()).toBeNull();
  });

  it('in the demo both actions are disabled and explained', async () => {
    __setScopeForTests('demo');
    const r = await render(<BackupRestoreScreen />);
    expect(texts(r)).toContain('backup.demoNotice');
    expect(button(r, 'backup.createNow').props.disabled).toBe(true);
    expect(button(r, 'backup.chooseFile').props.disabled).toBe(true);
  });
});

describe('E36 RestorePreview', () => {
  const start = () => setRestoreSession({ file: { uri: 'file:///x.tillexpiry', name: 'x.tillexpiry' }, createdAt: '2026-09-20T08:00:00.000Z', appVersion: '0.1.0' });

  it('without a picked file it explains instead of crashing', async () => {
    const r = await render(<RestorePreviewScreen />);
    expect(r.root.findByType('EmptyState').props.title).toBe('backup.preview.noFileTitle');
  });

  it('password → counts → replace-all confirmation → restore', async () => {
    start();
    mockApi.parseBackup.mockReturnValueOnce(PARSED);
    mockApi.restoreParsed.mockResolvedValueOnce({ workspaces: PARSED.workspaces, keyCount: 12, remindersOk: true });
    const r = await render(<RestorePreviewScreen />);
    expect(r.root.findAllByProps({ testID: 'restore-warning' })).toHaveLength(0); // nothing shown before the password
    await press(() => button(r, 'backup.preview.enterPassword').props.onPress());
    await press(() => r.root.findByType('BackupPassphraseModal').props.onConfirm('pw'));
    expect(texts(r)).toEqual(expect.arrayContaining(['Corner Shop', 'backup.preview.products', '4', 'backup.preview.batches', '7', 'backup.preview.replaceTitle']));
    const replace = () => button(r, 'backup.preview.replaceAction');
    expect(replace().props.disabled).toBe(true); // must tick "I understand" first
    await press(() => r.root.findByType('CheckboxRow').props.onToggle());
    expect(replace().props.disabled).toBe(false);
    await press(() => replace().props.onPress());
    expect(mockAlert.alert).toHaveBeenCalledWith('backup.preview.confirmTitle', 'backup.preview.confirmBody', expect.any(Array));
    expect(mockApi.restoreParsed).not.toHaveBeenCalled();
    const destructive = mockAlert.alert.mock.calls[0][2].find((b: any) => b.style === 'destructive');
    await press(() => destructive.onPress());
    expect(mockApi.restoreParsed).toHaveBeenCalledWith(PARSED);
    expect(r.root.findAllByProps({ testID: 'restore-done' }).length).toBeGreaterThan(0);
    expect(getRestoreSession()).toBeNull();
  });

  it('a wrong password stays in the modal; a failed restore shows the rollback result', async () => {
    start();
    mockApi.parseBackup.mockImplementationOnce(() => { throw new BackupError('wrongPassphrase'); }).mockReturnValueOnce(PARSED);
    mockApi.restoreParsed.mockRejectedValueOnce(new BackupError('restoreRolledBack'));
    const r = await render(<RestorePreviewScreen />);
    await press(() => button(r, 'backup.preview.enterPassword').props.onPress());
    await press(() => r.root.findByType('BackupPassphraseModal').props.onConfirm('bad'));
    const modal = r.root.findByType('BackupPassphraseModal');
    expect(modal.props.visible).toBe(true);
    expect(modal.props.error).toBe('backup.err.wrongPassphrase');
    await press(() => modal.props.onConfirm('good'));
    await press(() => r.root.findByType('CheckboxRow').props.onToggle());
    await press(() => button(r, 'backup.preview.replaceAction').props.onPress());
    await press(() => mockAlert.alert.mock.calls[0][2].find((b: any) => b.style === 'destructive').onPress());
    expect(texts(r)).toContain('backup.err.restoreRolledBack');
  });
});
