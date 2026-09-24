/** REV-04 blocking recovery screen and the startup decision function. */
import React from 'react';
const TestRenderer = require('react-test-renderer');
const { act } = TestRenderer;

jest.mock('react-native', () => require('../../../__tests__/helpers/screenStubs').rn);
jest.mock('react-i18next', () => require('../../../__tests__/helpers/screenStubs').i18n());

import { RecoveryRequiredScreen } from '../RecoveryRequiredScreen';
import { runStartupRecovery, recoveryBlockReason } from '../startupRecovery';
import { BackupError } from '../backupFile';
import { texts } from '../../../__tests__/helpers/screenStubs';

describe('REV-04 RecoveryRequiredScreen', () => {
  it('explains that business data is hidden until recovery completes; Retry re-runs recovery', async () => {
    const onRetry = jest.fn();
    let r: any;
    await act(async () => { r = TestRenderer.create(<RecoveryRequiredScreen reason="rollbackFailed" onRetry={onRetry} />); });
    expect(texts(r)).toEqual(expect.arrayContaining(['recovery.title', 'recovery.body', 'recovery.dataHidden', 'recovery.retry']));
    await act(async () => { r.root.findByProps({ testID: 'recovery-retry' }).props.onPress(); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('an unreadable journal has its own explanation', async () => {
    let r: any;
    await act(async () => { r = TestRenderer.create(<RecoveryRequiredScreen reason="journalUnreadable" onRetry={() => undefined} />); });
    expect(texts(r)).toContain('recovery.bodyUnreadable');
  });
});

describe('REV-04 runStartupRecovery decision', () => {
  it('ready when recovery resolves; blocked (never thrown) when it fails', async () => {
    await expect(runStartupRecovery(async () => 'rolledBack')).resolves.toEqual({ status: 'ready', outcome: 'rolledBack' });
    await expect(runStartupRecovery(async () => { throw new BackupError('recoveryRequired', 'rollbackFailed: disk'); }))
      .resolves.toEqual({ status: 'recoveryRequired', reason: 'rollbackFailed' });
    await expect(runStartupRecovery(async () => { throw new BackupError('recoveryRequired', 'journalUnreadable'); }))
      .resolves.toEqual({ status: 'recoveryRequired', reason: 'journalUnreadable' });
    await expect(runStartupRecovery(async () => { throw new Error('boom'); }))
      .resolves.toEqual({ status: 'recoveryRequired', reason: 'storageUnavailable' });
    expect(recoveryBlockReason(undefined)).toBe('storageUnavailable');
  });

  it('retry: blocked first, then ready once recovery succeeds', async () => {
    const recover = jest.fn()
      .mockRejectedValueOnce(new BackupError('recoveryRequired', 'rollbackFailed: io'))
      .mockResolvedValueOnce('rolledBack');
    expect((await runStartupRecovery(recover)).status).toBe('recoveryRequired');
    expect(await runStartupRecovery(recover)).toEqual({ status: 'ready', outcome: 'rolledBack' });
  });
});
