#!/usr/bin/env node
// Merge a set of dotted keys into all six locale files at once.
// Usage: node scripts/addLocaleKeys.mjs path/to/keys.json
// keys.json shape: { "section.key": { "en": "...", "ar": "...", "tr": "...", "fr": "...", "es": "...", "de": "..." } }
// Existing keys are overwritten only when `--overwrite` is passed.
import fs from 'node:fs';
import path from 'node:path';

const LANGS = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
const file = process.argv[2];
const overwrite = process.argv.includes('--overwrite');
if (!file) { console.error('keys file required'); process.exit(1); }
const keys = JSON.parse(fs.readFileSync(file, 'utf8'));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'locales');

function setPath(obj, dotted, value, allowOverwrite) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (cur[last] !== undefined && !allowOverwrite) return false;
  cur[last] = value;
  return true;
}

let added = 0, skipped = 0;
for (const lang of LANGS) {
  const p = path.join(root, `${lang}.json`);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const [dotted, values] of Object.entries(keys)) {
    if (values[lang] === undefined) throw new Error(`missing ${lang} for ${dotted}`);
    if (setPath(json, dotted, values[lang], overwrite)) added++; else skipped++;
  }
  fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
}
console.log(`locale keys: ${added} written, ${skipped} skipped (already present)`);
