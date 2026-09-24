/**
 * Jest mock for expo-document-picker. Tests set `__setNextPick` to control the
 * result; the default is a cancelled pick.
 */
export type DocumentPickerAsset = { uri: string; name: string; mimeType?: string; size?: number };
export type DocumentPickerResult =
  | { canceled: true; assets: null }
  | { canceled: false; assets: DocumentPickerAsset[] };

let nextResult: DocumentPickerResult = { canceled: true, assets: null };

export function __setNextPick(result: DocumentPickerResult): void {
  nextResult = result;
}

export async function getDocumentAsync(): Promise<DocumentPickerResult> {
  const result = nextResult;
  nextResult = { canceled: true, assets: null };
  return result;
}

export default { getDocumentAsync };
