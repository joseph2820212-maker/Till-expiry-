/**
 * Hands the decoded file and the chosen mapping from the mapping screen (E32) to the preview screen (E33) without
 * putting a 5,000-row file into navigation params (which are serialised into navigation state).
 * Held in memory only: nothing about a picked file is persisted.
 */
import type { DecodedCsv, ImportKind } from './csvDecode';
import type { ImportOptions } from './csvImport';

export interface ImportSession {
  kind: ImportKind;
  workspaceId: string;
  csv: DecodedCsv;
  options: ImportOptions;
}

let current: ImportSession | null = null;

export function setImportSession(s: ImportSession): void { current = s; }

/** The session for this kind and workspace, or null (a session from another workspace is never shown). */
export function getImportSession(kind: ImportKind, workspaceId: string | undefined): ImportSession | null {
  return current && current.kind === kind && current.workspaceId === workspaceId ? current : null;
}

export function clearImportSession(): void { current = null; }
