/**
 * fileUtils.ts — write real text files and share them via expo-sharing.
 * All functions here produce actual on-device files; nothing is mocked.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function safePathFileName(fileName: string): string {
  const trimmed = fileName.trim() || `file_${Date.now()}.txt`;
  const dot = trimmed.lastIndexOf('.');
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot) : '';
  const safeStem = stem
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 100) || 'file';
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
  return `${safeStem}${safeExt}`;
}

export async function writeTextFile(fileName: string, content: string): Promise<string> {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error('Document directory not available on this platform.');
  const uri = `${dir}${safePathFileName(fileName)}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

export async function shareFile(uri: string, mimeType = 'text/plain'): Promise<boolean> {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return false;
  await Sharing.shareAsync(uri, { mimeType, UTI: 'public.plain-text' });
  return true;
}

/**
 * Write a text file to the CACHE directory then open the system share sheet.
 * Returns the local URI. Cache (vs the Documents directory) is excluded from
 * iCloud/iTunes device backups and is OS-evictable, so a sensitive export such
 * as a data backup does not leave a permanent copy in a cloud-synced location.
 */
export async function writeAndShare(fileName: string, content: string, requireShare = false): Promise<string> {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('No writable directory available on this platform.');
  const uri = `${dir}${safePathFileName(fileName)}`;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  const shared = await shareFile(uri);
  if (requireShare && !shared) throw new Error('Sharing is unavailable on this device.');
  return uri;
}
