// fileUtils: writes real files and calls the share sheet.

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8' },
  writeAsStringAsync: jest.fn(async () => {}),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { writeTextFile, shareFile, writeAndShare } from '../fileUtils';

beforeEach(() => jest.clearAllMocks());

describe('writeTextFile', () => {
  it('writes to documentDirectory with the given filename', async () => {
    const uri = await writeTextFile('test.txt', 'hello');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/test.txt',
      'hello',
      { encoding: 'utf8' },
    );
    expect(uri).toBe('file:///docs/test.txt');
  });

  it('sanitizes slashes and punctuation before writing to device storage', async () => {
    const uri = await writeTextFile('Report 01/06/2026 - 12/06/2026.csv', 'hello');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/Report_01062026_-_12062026.csv',
      'hello',
      { encoding: 'utf8' },
    );
    expect(uri).toBe('file:///docs/Report_01062026_-_12062026.csv');
  });

});

describe('shareFile', () => {
  it('calls Sharing.shareAsync when sharing is available', async () => {
    const shared = await shareFile('file:///docs/test.txt');
    expect(shared).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///docs/test.txt', expect.any(Object));
  });

  it('returns false when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const shared = await shareFile('file:///docs/test.txt');
    expect(shared).toBe(false);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});

describe('writeAndShare', () => {
  it('writes a file and then shares it', async () => {
    const uri = await writeAndShare('report.txt', 'content here');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(uri).toBe('file:///docs/report.txt');
  });

  it('can require the share sheet to open', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await expect(writeAndShare('backup.json', '{}', true)).rejects.toThrow('Sharing is unavailable');
  });
});
