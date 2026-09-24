import { csvCell, toCsv } from '../csv';

describe('csv builder', () => {
  it('leaves plain values unquoted', () => {
    expect(csvCell('Tobacco')).toBe('Tobacco');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell('')).toBe('');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes values containing commas, quotes, or newlines (RFC 4180)', () => {
    expect(csvCell('Smith, John')).toBe('"Smith, John"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises formula-injection in text cells but not in numbers', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
    expect(csvCell('+1+2')).toBe("'+1+2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-cmd')).toBe("'-cmd");
    // Numbers (including negatives) are never prefixed.
    expect(csvCell(-50)).toBe('-50');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('builds CRLF-joined rows', () => {
    const csv = toCsv([
      ['Date', 'Description', 'Amount'],
      ['2026-06-01', 'Sale, big', 100],
      ['2026-06-02', 'Rent', -50],
    ]);
    expect(csv).toBe('Date,Description,Amount\r\n2026-06-01,"Sale, big",100\r\n2026-06-02,Rent,-50');
  });
});
