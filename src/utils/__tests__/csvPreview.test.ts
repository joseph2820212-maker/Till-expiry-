import { isCsv, csvToHtml } from '../csvPreview';

describe('csvPreview — detection + table rendering', () => {
  it('detects CSV by mime type and by .csv extension', () => {
    expect(isCsv('text/csv', undefined)).toBe(true);
    expect(isCsv('application/csv', undefined)).toBe(true);
    expect(isCsv(undefined, 'file:///docs/export.csv')).toBe(true);
    expect(isCsv(undefined, 'file:///docs/export.CSV?x=1')).toBe(true);
    expect(isCsv(undefined, 'file:///docs/photo.jpg')).toBe(false);
    expect(isCsv('application/pdf', 'file:///docs/x.pdf')).toBe(false);
  });

  it('renders a header row as <th> and data rows as <td>', () => {
    const html = csvToHtml('Name,Total\nAlice,100\nBob,200');
    expect(html).toContain('<th>Name</th><th>Total</th>');
    expect(html).toContain('<td>Alice</td><td>100</td>');
    expect(html).toContain('<td>Bob</td><td>200</td>');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('escapes HTML so CSV content cannot inject markup', () => {
    const html = csvToHtml('a,<script>alert(1)</script>\n"&",x');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('handles CRLF line endings and skips blank lines', () => {
    const html = csvToHtml('h1,h2\r\nv1,v2\r\n\r\n');
    expect(html).toContain('<th>h1</th><th>h2</th>');
    expect(html).toContain('<td>v1</td><td>v2</td>');
  });

  it('caps very large CSVs to keep the preview bounded', () => {
    const lines = ['h'];
    for (let i = 0; i < 2000; i++) lines.push(`r${i}`);
    const html = csvToHtml(lines.join('\n'));
    expect((html.match(/<tr>/g) || []).length).toBe(1000); // first 1000 rows only
  });
});
