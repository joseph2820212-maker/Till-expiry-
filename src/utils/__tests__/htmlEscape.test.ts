import { escapeHtml } from '../htmlEscape';

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('handles combined special characters', () => {
    expect(escapeHtml('<b>"A & B\'s"</b>')).toBe('&lt;b&gt;&quot;A &amp; B&#39;s&quot;&lt;/b&gt;');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through normal text', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});
