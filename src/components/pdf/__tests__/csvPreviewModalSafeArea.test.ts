// Regression: the CSV preview Modal must seed its SafeAreaProvider with
// initialWindowMetrics. RN <Modal> is a separate native root, and a
// SafeAreaProvider with no initial metrics renders NOTHING until it measures —
// inside a Modal that measurement is unreliable, leaving the WebView blank
// ("CSV loads and does nothing" on every per-module preview). Mirrors the
// proven FileViewerModal pattern.
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('CsvPreviewModal — SafeAreaProvider is seeded inside the Modal', () => {
  const src = read('src/components/pdf/CsvPreviewModal.tsx');

  it('imports initialWindowMetrics', () => {
    expect(src).toMatch(/import\s*\{[^}]*initialWindowMetrics[^}]*\}\s*from\s*'react-native-safe-area-context'/);
  });

  it('passes initialMetrics to the in-Modal SafeAreaProvider', () => {
    expect(src).toContain('<SafeAreaProvider initialMetrics={initialWindowMetrics}>');
  });
});
