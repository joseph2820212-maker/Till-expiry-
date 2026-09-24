import * as fs from 'fs';
import * as path from 'path';

/**
 * PDF-VIEWER-01 - AppPdfPreviewScreen must keep Android PDF preview stable.
 *
 * Live claude-fix-apk shell (blob a68a202d): clear pdfUri on every document
 * change so the outer <Pdf> unmounts fully, show a spinner while the next file
 * generates, then mount one clean native instance. Do NOT keep <Pdf> mounted
 * across source.uri swaps — react-native-pdf remounts PdfCustom internally on
 * uri change, which overlaps native teardowns and crashes Android pdfium.
 * Unique generated filenames + document-height framing remain required.
 */
const root = path.resolve(__dirname, '../../../..');
const src = fs.readFileSync(path.join(root, 'src/components/pdf/AppPdfPreviewScreen.tsx'), 'utf8');

describe('AppPdfPreviewScreen Android PDF stability', () => {
  it('measures the body via onLayout', () => {
    expect(src).toContain('onLayout');
    expect(src).toMatch(/setBody\(/);
  });

  it('clears pdfUri before regen (live clean-mount) instead of key-remounting or source-swapping', () => {
    expect(src).toContain('onLoadComplete');
    expect(src).toMatch(/setPdfError\(false\);\s*setPdfUri\(null\);\s*setDoc\(null\);/);
    expect(src).not.toContain('nativePdfUri');
    expect(src).not.toContain('PDFIUM_REMOUNT_SETTLE_MS');
    expect(src).not.toContain('RAPID-SWITCH');
    expect(src).not.toContain('key={pdfKey}');
    expect(src).not.toContain('const pdfKey =');
    expect(src).not.toContain(':probe:');
    expect(src).not.toContain('pdfProbe');
    expect(src).not.toContain('probeLoading');
  });

  it('reads page count + aspect without remounting the native Pdf', () => {
    expect(src).toContain('const [doc, setDoc]');
    expect(src).toContain('pages: numberOfPages');
    expect(src).toContain('ratio');
    expect(src).toContain('setDoc(prev =>');
    expect(src).not.toMatch(/pdfKey[\s\S]{0,140}doc\.pages/);
    expect(src).not.toMatch(/pdfKey[\s\S]{0,140}doc\.ratio/);
  });

  it('sizes the Pdf with an explicit height (no flex:1 centring)', () => {
    // The <Pdf> style must carry an explicit height, and the pdf StyleSheet entry
    // must NOT use flex:1 (which would fill the frame and re-trigger centring).
    expect(src).toMatch(/style=\{\[st\.pdf,\s*\{\s*width:\s*body\.w,\s*height:\s*pdfHeight/);
    expect(src).toMatch(/pdf:\s*\{\s*backgroundColor:\s*'#fff'\s*\}/);
  });

  it('fills the visible preview viewport without resizing the native Pdf page', () => {
    expect(src).toContain('const stageHeight = availH');
    expect(src).toContain('style={[st.pdfStage, { width: body.w, height: stageHeight }]}');
    expect(src).toMatch(/pdfStage:\s*\{\s*backgroundColor:\s*'#fff'/);
    expect(src).toContain("justifyContent: 'flex-start'");
  });

  it('does not insert a native white gap between PDF pages', () => {
    expect(src).toContain('spacing={0}');
    expect(src).not.toContain('PAGE_GAP');
  });

  it('uses document-height framing for the native Pdf when the PDF fits the visible area', () => {
    expect(src).toContain('const pageRatio = doc?.ratio ?? PAGE_RATIO_A4');
    expect(src).toContain('const pageCount = doc?.pages ?? 1');
    expect(src).toContain('const contentH = Math.max(1, pageCount * body.w * pageRatio)');
    expect(src).toContain('Math.min(contentH, availH)');
  });

  it('uses a unique preview filename for generated HTML previews', () => {
    expect(src).toContain('uniquePreviewName');
    expect(src).toContain('preview-${Date.now()}-${Math.round(Math.random() * 1_000_000)}.pdf');
    expect(src).toContain('pruneTemporaryPreviewPdfs');
    expect(src).toContain('printHtmlToPdfFile(html, uniquePreviewName, PAGE_SIZES.a4, { temporary: true })');
  });

  it('keeps the store-stable generation debounce', () => {
    expect(src).toMatch(/const timer = setTimeout\(\(\) => \{[\s\S]*?printHtmlToPdfFile[\s\S]*?\}, 220\);/);
  });

  it('keeps dark preview chrome around a white PDF page', () => {
    expect(src).toMatch(/body:\s*\{\s*flex:\s*1,\s*backgroundColor:\s*DARK_BODY/);
    expect(src).toMatch(/pdf:\s*\{\s*backgroundColor:\s*'#fff'/);
  });
});
