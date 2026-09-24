#!/usr/bin/env node
// Removes translation keys that no source file can reach any more, from all six locale files at once.
// A key is kept when it is used literally (t('a.b')), when a template key reaches it (t(`a.${x}`) keeps a.*),
// or when it sits under a namespace whose keys are always built at run time (KEEP_PREFIXES).
// Usage: node scripts/pruneLocaleKeys.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LANGS = ['en', 'ar', 'tr', 'fr', 'es', 'de'];
/** Built from content tables (help chapters, legal documents) or read by copied family components. */
const KEEP_PREFIXES = ['help.', 'legal.', 'common.', 'appName', 'fileCenter.', 'errors.', 'settings.language', 'settings.languageValue'];

function sources(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'locales') sources(p, out); continue; }
    if (/\.(ts|tsx|js|mjs)$/.test(f.name)) out.push(fs.readFileSync(p, 'utf8'));
  }
  return out;
}

const code = [...sources(path.join(root, 'src')), ...sources(path.join(root, 'plugins'))].join('\n');
const literal = new Set([...code.matchAll(/['"`]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"`]/g)].map(m => m[1]));
const prefixes = new Set([...code.matchAll(/`([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*\.)\$\{/g)].map(m => m[1]));
for (const m of code.matchAll(/'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*\.)'\s*\+/g)) prefixes.add(m[1]);

function reachable(key) {
  if (literal.has(key)) return true;
  if (KEEP_PREFIXES.some(p => key === p || key.startsWith(p))) return true;
  for (const p of prefixes) if (key.startsWith(p)) return true;
  // Arrays / objects read with returnObjects (e.g. common.monthsFull) are matched by their own key above.
  return false;
}

function prune(obj, prefix, removed) {
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && !reachable(full)) {
      prune(v, full, removed);
      if (!Object.keys(v).length) delete obj[k];
    } else if (!reachable(full)) {
      removed.push(full);
      delete obj[k];
    }
  }
}

const dry = process.argv.includes('--dry');
let report = null;
for (const lang of LANGS) {
  const p = path.join(root, 'src/locales', `${lang}.json`);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const removed = [];
  prune(json, '', removed);
  if (!report) report = removed;
  if (!dry) fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n', 'utf8');
}
console.log(`${dry ? 'would remove' : 'removed'} ${report.length} keys per language`);
if (dry) console.log(report.join('\n'));
