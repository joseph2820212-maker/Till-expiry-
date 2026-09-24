import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

describe('PDF generation reliability', () => {
  it('centralises PDF printing/copying through pdfFile helper', () => {
    const helper = read('src/utils/pdfFile.ts');
    expect(helper).toContain('printHtmlToPdfFile');
    expect(helper).toContain('documentDirectory || FileSystem.cacheDirectory');
    expect(helper).toContain('return sourceUri');
  });
});
