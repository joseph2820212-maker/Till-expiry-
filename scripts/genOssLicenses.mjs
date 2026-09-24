#!/usr/bin/env node
/**
 * genOssLicenses.mjs — regenerate the open-source licence inventory for TillExpiry.
 * Scans the production dependency closure (npm ls --omit=dev --all) and reads each
 * package's licence + version from node_modules, writing
 *   src/modules/more/content/openSourceLicenses.ts
 * Run before each release: node scripts/genOssLicenses.mjs   (no network needed)
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const OUT = 'src/modules/more/content/openSourceLicenses.ts';
const OUT_TEXTS = 'src/modules/more/content/openSourceLicenseTexts.ts';
let tree;
try { tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { maxBuffer: 1e8 })); }
catch (e) { tree = e.stdout ? JSON.parse(e.stdout.toString()) : null; }

const names = new Set();
(function walk(node) { if (!node || !node.dependencies) return; for (const [n, d] of Object.entries(node.dependencies)) { names.add(n); walk(d); } })(tree);

const pkgs = [];
for (const name of names) {
  const pj = path.join('node_modules', name, 'package.json');
  if (!fs.existsSync(pj)) continue;
  try {
    const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
    let lic = j.license || (j.licenses && j.licenses.map(l => l.type || l).join(', ')) || 'See package';
    if (typeof lic === 'object') lic = lic.type || 'See package';
    // F08.4 (audit): bundle the licence / NOTICE text itself, not just the identifier.
    const dir = path.join('node_modules', name);
    const files = fs.readdirSync(dir);
    const licFile = files.find(f => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const noticeFile = files.find(f => /^notice(\.|$)/i.test(f));
    let text = '';
    if (licFile) text += fs.readFileSync(path.join(dir, licFile), 'utf8');
    if (noticeFile) text += (text ? '\n\n--- NOTICE ---\n' : '') + fs.readFileSync(path.join(dir, noticeFile), 'utf8');
    text = text.replace(/\r\n/g, '\n').trim();
    // Never truncated: a required licence / NOTICE text is shipped in full (audit closure).
    pkgs.push({ name, version: j.version || '', license: lic, text });
  } catch { /* skip */ }
}
pkgs.sort((a, b) => a.name.localeCompare(b.name));
// Identical texts (most MIT files) are stored once; each package points at its text.
const textIndex = new Map();
const texts = [];
for (const p of pkgs) {
  if (!p.text) { p.textIndex = -1; continue; }
  const key = p.text.replace(/\s+/g, ' ');
  if (!textIndex.has(key)) { textIndex.set(key, texts.length); texts.push(p.text); }
  p.textIndex = textIndex.get(key);
}
const summary = {};
pkgs.forEach(p => { summary[p.license] = (summary[p.license] || 0) + 1; });
const sumArr = Object.entries(summary).sort((a, b) => b[1] - a[1]);
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const today = new Date().toISOString().slice(0, 10);
const out = `// AUTO-GENERATED — open-source licence inventory for TillExpiry.
// Regenerate with: node scripts/genOssLicenses.mjs  — do not hand-edit.
export interface OssPackage { name: string; version: string; license: string; textIndex: number }
export const OSS_GENERATED_AT = '${today}';
export const OSS_COUNT = ${pkgs.length};
export const OSS_LICENSE_SUMMARY: { license: string; count: number }[] = [
${sumArr.map(([l, c]) => `  { license: '${esc(l)}', count: ${c} },`).join('\n')}
];
export const OSS_PACKAGES: OssPackage[] = [
${pkgs.map(p => `  { name: '${esc(p.name)}', version: '${esc(p.version)}', license: '${esc(p.license)}', textIndex: ${p.textIndex} },`).join('\n')}
];
`;
fs.writeFileSync(OUT, out);
const escT = t => JSON.stringify(t);
fs.writeFileSync(OUT_TEXTS, `// AUTO-GENERATED — licence / NOTICE texts for TillExpiry's open-source packages (deduplicated).
// Regenerate with: node scripts/genOssLicenses.mjs  — do not hand-edit.
export const OSS_LICENSE_TEXTS: string[] = [
${texts.map(t => `  ${escT(t)},`).join('\n')}
];
`);
console.log(`wrote ${OUT}: ${pkgs.length} packages; ${OUT_TEXTS}: ${texts.length} unique texts`);
