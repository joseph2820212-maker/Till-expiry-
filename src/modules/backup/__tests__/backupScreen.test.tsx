import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('@react-navigation/native-stack', () => ({}));
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../utils/currency', () => ({ ...require('../../../__tests__/helpers/screenStubs').currency(), initCurrency: async () => {} }));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/BackupPassphraseModal', () => ({ BackupPassphraseModal: (p: any) => (p.visible ? require('react').createElement('PassphraseModal', p) : null) }));
jest.mock('../../reminders/reminderService', () => ({ syncReminders: jest.fn(async () => 0) }));
jest.mock('../../../storage/fileUtils', () => ({ writeAndShare: jest.fn(async (name: string, content: string) => { (global as any).__lastBackup = content; return `file:///cache/${name}`; }) }));

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { navState, flush, texts, button } from '../../../__tests__/helpers/screenStubs';
import { AppAlert } from '../../../components/AppAlert';
import { BackupScreen } from '../screens/BackupScreen';
import { TE_KEYS } from '../../../storage/keys';

const render = (el: React.ReactElement) => { let r: any; act(() => { r = TestRenderer.create(el); }); return r; };
const settle = async () => { await act(async () => { await flush(); await flush(); }); };

beforeEach(() => { (AsyncStorage as any).clear(); jest.clearAllMocks(); navState.navigate.mockClear(); });

describe('BackupScreen', () => {
  it('create: passphrase sheet → encrypted file shared → last-backup line updates; restore: pick → preview → confirm → passphrase → data replaced', async () => {
    await AsyncStorage.setItem(TE_KEYS.products, JSON.stringify([{ id: 'P1', name: 'Milk 1L' }]));
    await AsyncStorage.setItem('settings:shop', '{"name":"Corner Shop"}');
    const success = jest.spyOn(AppAlert, 'success').mockImplementation((_t, _m, buttons) => { buttons?.[0]?.onPress?.(); });
    const alert = jest.spyOn(AppAlert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.find(b => b.style === 'destructive')?.onPress?.(); });
    const r = render(<BackupScreen />);
    await settle();
    expect(texts(r)).toContain('backup.never');
    const createRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.createNow');
    act(() => { createRow.props.onPress(); });
    const sheet = r.root.findByType('PassphraseModal');
    expect(sheet.props.mode).toBe('create');
    await act(async () => { await sheet.props.onConfirm('my backup pass'); });
    await settle();
    expect(success).toHaveBeenCalledWith('backup.createdTitle', expect.stringContaining('TillExpiry_Backup_'));
    expect(texts(r).some(x => x.startsWith('backup.lastBackup'))).toBe(true);
    const file = (global as any).__lastBackup as string;

    // Now restore that file over a changed store.
    await AsyncStorage.setItem('settings:shop', '{"name":"Changed"}');
    (DocumentPicker as any).__setNextPick({ canceled: false, assets: [{ uri: 'file:///picked.json', name: 'TillExpiry_Backup_x.json', size: file.length }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(file);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: file.length });
    const pickRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.chooseFile');
    await act(async () => { await pickRow.props.onPress(); });
    await settle();
    expect(texts(r)).toContain('backup.previewTitle');
    expect(texts(r)).toContain('1'); // one price list in the preview
    act(() => { button(r, 'backup.restoreAction').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('backup.restoreTitle', 'backup.restoreConfirm', expect.any(Array));
    const enter = r.root.findByType('PassphraseModal');
    expect(enter.props.mode).toBe('enter');
    await act(async () => { await enter.props.onConfirm('wrong'); });
    await settle();
    expect(r.root.findByType('PassphraseModal').props.error).toBe('backup.errors.wrong-passphrase');
    await act(async () => { await r.root.findByType('PassphraseModal').props.onConfirm('my backup pass'); });
    await settle();
    expect(await AsyncStorage.getItem('settings:shop')).toBe('{"name":"Corner Shop"}');
    expect(navState.navigate).toHaveBeenCalledWith('Tabs', { screen: 'HomeTab', params: { screen: 'Home', params: undefined } });
    success.mockRestore(); alert.mockRestore();
  });
  it('a foreign file is refused at pick time with a clear message', async () => {
    const err = jest.spyOn(AppAlert, 'error').mockImplementation(() => {});
    const r = render(<BackupScreen />);
    await settle();
    (DocumentPicker as any).__setNextPick({ canceled: false, assets: [{ uri: 'file:///x.json', name: 'x.json', size: 10 }] });
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('{"format":"tillnote","version":2}');
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 10 });
    const pickRow = r.root.findAllByType('TouchableOpacity').find((x: any) => x.props.accessibilityLabel === 'backup.chooseFile');
    await act(async () => { await pickRow.props.onPress(); });
    expect(err).toHaveBeenCalledWith('backup.errors.wrong-format');
    err.mockRestore();
  });
});
