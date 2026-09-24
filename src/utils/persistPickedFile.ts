import * as FileSystem from 'expo-file-system/legacy';

export type PersistPickedFileNamespace =
  | 'calculator';

export type PersistablePickedFile = {
  uri: string;
  name?: string;
  mimeType?: string;
};

const PREFIX_BY_NAMESPACE: Record<PersistPickedFileNamespace, string> = {
  calculator: 'calc',
};

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'text/plain': 'txt',
};

function documentRoot(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('Document directory is not available.');
  return root.endsWith('/') ? root : `${root}/`;
}

function maybeDocumentRoot(): string | null {
  const root = FileSystem.documentDirectory;
  if (!root) return null;
  return root.endsWith('/') ? root : `${root}/`;
}

function cleanId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, '_') || `${Date.now()}`;
}

function extensionFromText(value?: string): string | null {
  if (!value) return null;
  const withoutQuery = value.split(/[?#]/)[0] || '';
  const base = withoutQuery.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext && ext.length <= 12 ? ext : null;
}

export function extensionForPickedFile(file: PersistablePickedFile): string {
  return extensionFromText(file.name)
    ?? extensionFromText(file.uri)
    ?? (file.mimeType ? EXT_BY_MIME[file.mimeType.toLowerCase()] : undefined)
    ?? 'bin';
}

export function isPersistedFileUri(uri: string): boolean {
  const root = maybeDocumentRoot();
  if (!root) return false;
  return uri.startsWith(root);
}

export async function persistPickedFile(
  file: PersistablePickedFile,
  namespace: PersistPickedFileNamespace,
  id: string,
): Promise<string> {
  if (!file.uri) throw new Error('No file URI was provided.');
  const root = documentRoot();
  if (file.uri.startsWith(root)) return file.uri;

  const prefix = PREFIX_BY_NAMESPACE[namespace];
  const ext = extensionForPickedFile(file);
  const dest = `${root}${prefix}_${cleanId(id)}.${ext}`;
  await FileSystem.copyAsync({ from: file.uri, to: dest });
  return dest;
}

export async function deleteCopiedPickedFile(persistedUri: string | undefined, originalUri: string | undefined): Promise<void> {
  if (!persistedUri || !originalUri || persistedUri === originalUri) return;
  if (!isPersistedFileUri(persistedUri)) return;
  await FileSystem.deleteAsync(persistedUri, { idempotent: true });
}
