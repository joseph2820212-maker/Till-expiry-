/**
 * csvPreview.ts — CSV detection + a read-only HTML table renderer for the file
 * viewer. Kept out of the FileViewerModal so the component stays minimal and
 * these pure helpers are unit-testable without the WebView.
 */

export function isCsv(mimeType?: string, uri?: string | null): boolean {
  if (mimeType === 'text/csv' || mimeType === 'application/csv') return true;
  if (!uri) return false;
  return uri.toLowerCase().split('?')[0].endsWith('.csv');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Build a styled, escaped HTML table from CSV text (preview only; first 1000 rows). */
export function csvToHtml(content: string): string {
  const rows = (content || '').replace(/\r\n?/g, '\n').split('\n').filter(r => r.length > 0).slice(0, 1000);
  const body = rows.map((line, i) => {
    const tag = i === 0 ? 'th' : 'td';
    const cells = line.split(',').map(c => `<${tag}>${escapeHtml(c.trim())}</${tag}>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<style>body{margin:0;padding:8px;font-family:-apple-system,'DM Sans',sans-serif;font-size:13px;color:#1A2540;}`
    + `table{border-collapse:collapse;width:100%;}`
    + `th,td{border:1px solid #E0D9C7;padding:6px 8px;text-align:left;white-space:nowrap;}`
    + `th{background:#FAEAD5;font-weight:700;}tr:nth-child(even) td{background:#FBF7EC;}`
    + `</style></head><body><table>${body}</table></body></html>`;
}
