import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  logError, getErrorLog, clearErrorLog, formatErrorLogForExport,
  installGlobalErrorLogger, __resetGlobalErrorLoggerForTests,
} from '../errorLog';

beforeEach(async () => {
  await clearErrorLog();
  __resetGlobalErrorLoggerForTests();
});

describe('errorLog', () => {
  it('records an Error with message + stack, newest first', async () => {
    await logError('ctxA', new Error('boom A'));
    await logError('ctxB', new Error('boom B'));
    const log = await getErrorLog();
    expect(log).toHaveLength(2);
    expect(log[0].ctx).toBe('ctxB'); // newest first
    expect(log[0].msg).toBe('boom B');
    expect(log[0].stack).toContain('boom B');
  });

  it('handles non-Error values without throwing', async () => {
    await expect(logError('s', 'a string error')).resolves.toBeUndefined();
    await expect(logError('o', { code: 42 })).resolves.toBeUndefined();
    await expect(logError('n', null)).resolves.toBeUndefined();
    const log = await getErrorLog();
    expect(log.map(e => e.msg)).toEqual(expect.arrayContaining(['a string error', '{"code":42}', 'null']));
  });

  it('appends extra context and a fatal flag', async () => {
    await logError('global', new Error('fatal one'), { fatal: true, extra: 'componentStack here' });
    const [e] = await getErrorLog();
    expect(e.fatal).toBe(true);
    expect(e.msg).toBe('fatal one — componentStack here');
  });

  it('caps the ring buffer at 100 entries (drops oldest)', async () => {
    for (let i = 0; i < 130; i++) await logError('loop', new Error(`e${i}`));
    const log = await getErrorLog();
    expect(log).toHaveLength(100);
    expect(log[0].msg).toBe('e129');  // newest kept
    expect(log[99].msg).toBe('e30');  // oldest 30 dropped
  });

  it('never rejects even if AsyncStorage write fails', async () => {
    // Override just the next setItem call (reverts to the mock's base impl after),
    // so we don't disturb the store-writing implementation for later tests.
    (AsyncStorage.setItem as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('disk full')));
    await expect(logError('x', new Error('y'))).resolves.toBeUndefined();
  });

  it('clear empties the log', async () => {
    await logError('x', new Error('y'));
    await clearErrorLog();
    expect(await getErrorLog()).toHaveLength(0);
  });

  it('formats an export string (and a friendly empty message)', async () => {
    expect(await formatErrorLogForExport()).toBe('No errors recorded.');
    await logError('export', new Error('exported error'));
    const out = await formatErrorLogForExport();
    expect(out).toContain('exported error');
    expect(out).toContain('(export)');
  });

  it('installs a global handler that logs then chains the previous one', async () => {
    const previous = jest.fn();
    let registered: ((e: unknown, fatal?: boolean) => void) | undefined;
    (globalThis as unknown as { ErrorUtils: unknown }).ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => { registered = h; },
    };

    installGlobalErrorLogger();
    installGlobalErrorLogger(); // idempotent — must not double-wrap

    expect(registered).toBeDefined();
    const err = new Error('uncaught!');
    registered!(err, true);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(previous).toHaveBeenCalledWith(err, true);

    // allow the async write to flush
    await new Promise(r => setTimeout(r, 0));
    const log = await getErrorLog();
    expect(log[0].msg).toBe('uncaught!');
    expect(log[0].fatal).toBe(true);

    delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
  });

  it('install is a no-op when ErrorUtils is unavailable', () => {
    delete (globalThis as unknown as { ErrorUtils?: unknown }).ErrorUtils;
    expect(() => installGlobalErrorLogger()).not.toThrow();
  });
});
