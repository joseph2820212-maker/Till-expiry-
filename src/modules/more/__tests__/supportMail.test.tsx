/** The About screen's support email is prefilled with app + device details only (Till Note contact guidance). */
jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('@react-navigation/native', () => require('../../../__tests__/helpers/screenStubs').navigation());
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../../../theme/responsive', () => ({ fs: (v: number) => v, rs: (v: number) => v }));
jest.mock('../../../components/ScreenHeader', () => ({ ScreenHeader: 'ScreenHeader' }));
jest.mock('../../../components/settings/SettingsSection', () => ({ SettingsSection: 'SettingsSection' }));
jest.mock('../../../components/settings/SettingsRow', () => ({ SettingsRow: 'SettingsRow' }));
jest.mock('../../../components/AppButton', () => ({ AppButton: 'AppButton' }));
jest.mock('../../../components/AppAlert', () => ({ AppAlert: { alert: jest.fn(), success: jest.fn() } }));

import React from 'react';
const { act, create } = require('react-test-renderer');
import { Linking } from 'react-native';
import { AboutScreen, supportMailBody, supportMailUrl } from '../screens/AboutScreen';
import { APP_VERSION, EMAILS } from '../../../appMeta';
import { navState } from '../../../__tests__/helpers/screenStubs';

const t = (k: string, o?: Record<string, unknown>) => (o && Object.keys(o).length ? `${k}|${Object.entries(o).map(([a, b]) => `${a}=${b}`).join(',')}` : k);

describe('support email', () => {
  it('prefills the app version and platform in the body and nothing else', () => {
    const body = supportMailBody(t);
    expect(body).toContain(`version=${APP_VERSION}`);
    expect(body).toContain('platform=Android');
    expect(body).toContain('app=TillExpiry');
    const url = supportMailUrl(t);
    expect(url.startsWith(`mailto:${EMAILS.support}?subject=TillExpiry%20${APP_VERSION}&body=`)).toBe(true);
    expect(decodeURIComponent(url.split('&body=')[1])).toBe(body);
  });

  it('the About screen lists the contact guidance, the email button and the legal documents', async () => {
    (Linking as any).canOpenURL = jest.fn(async () => true);
    let r: any;
    await act(async () => { r = create(<AboutScreen />); });
    const texts = r.root.findAllByType('Text').map((n: any) => String(n.props.children));
    expect(texts.some((x: string) => x.startsWith('legal.contact.body|'))).toBe(true);
    expect(texts).toContain('legal.contact.never');
    expect(texts.some((x: string) => x.startsWith('about.description|'))).toBe(true);
    const button = r.root.findAllByType('AppButton').find((b: any) => b.props.label === 'legal.contact.emailButton');
    expect(button).toBeTruthy();
    await act(async () => { await button.props.onPress(); });
    expect((Linking.openURL as jest.Mock).mock.calls[0][0]).toBe(supportMailUrl(t));
    const docs = r.root.findAllByType('SettingsRow').map((row: any) => { row.props.onPress?.(); return null; });
    expect(docs.length).toBeGreaterThan(0);
    const legalCalls = navState.navigate.mock.calls.filter(c => c[0] === 'SettingsLegal').map(c => c[1].doc);
    expect(legalCalls).toEqual(['privacy', 'terms', 'dataStorage', 'licences']);
  });
});
