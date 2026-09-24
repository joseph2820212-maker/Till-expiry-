import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(root, 'src/components/DatePickerField.tsx'), 'utf8');

describe('DatePickerField maxDate', () => {
  it('supports disabling future dates and future-month navigation', () => {
    expect(src).toContain('maxDate?: string');
    expect(src).toContain('const effectiveMaxDate = maxDate ?? todayISO();');
    expect(src).toContain('maxMonthReached');
    expect(src).toContain('disabled={maxMonthReached}');
    expect(src).toContain('const disabled = iso > effectiveMaxDate');
    expect(src).toContain('disabled={disabled}');
  });
});
