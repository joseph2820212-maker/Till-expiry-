#!/usr/bin/env node
// Lists translation keys used in src/ (literal t('a.b') calls) that are missing from en.json.
// Usage: node scripts/usedLocaleKeys.mjs [--all]   (--all prints every used key, not just missing ones)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8'));

export function has(obj, dotted) {
  let cur = obj;
  for (const p of dotted.split('.')) { if (cur == null || typeof cur !== 'object' || !(p in cur)) return false; cur = cur[p]; }
  return true;
}

export function collect(dir, out = new Map()) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== '__tests__' && f.name !== 'locales') collect(p, out); continue; }
    if (!/\.(ts|tsx)$/.test(f.name)) continue;
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) {
      if (!out.has(m[1])) out.set(m[1], new Set());
      out.get(m[1]).add(path.relative(root, p));
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const used = collect(path.join(root, 'src'));
  const all = process.argv.includes('--all');
  for (const [k, files] of [...used].sort()) if (all || !has(en, k)) console.log(`${k}\t${[...files].join(',')}`);
}
