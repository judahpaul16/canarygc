// Locale parity gate. Every non-base catalog must carry the same keys as the
// base, keep each message's {params} and inline markup, hold no empty values,
// and not be a near-copy of English (a sign the key was cloned, not translated).
// A no-op while only the base locale exists, so it passes cleanly through the
// migration phases and turns strict automatically once locales are filled.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const BASE = 'en';

// Keys whose value legitimately matches English in another locale (brand names,
// protocol tokens, symbols). Extend as real cases appear during the fill phase.
const SAME_OK = new Set(['common_app_name']);

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'for', 'on',
  'with', 'no', 'not', 'this', 'that', 'you', 'your', 'at', 'by', 'from'
]);

function load(locale) {
  const raw = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'));
  delete raw['$schema'];
  return raw;
}

function params(value) {
  return new Set([...String(value).matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));
}

function tags(value) {
  return [...String(value).matchAll(/<[^>]+>/g)].map((m) => m[0]).sort();
}

function looksEnglish(value) {
  const words = String(value).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const stop = words.filter((w) => STOPWORDS.has(w)).length;
  return stop / words.length > 0.2;
}

const locales = readdirSync(MESSAGES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((l) => l !== BASE);

if (locales.length === 0) {
  console.log('locale parity: base only, nothing to check');
  process.exit(0);
}

const base = load(BASE);
const baseKeys = new Set(Object.keys(base));
const errors = [];

for (const locale of locales) {
  const cat = load(locale);
  const keys = new Set(Object.keys(cat));

  for (const k of baseKeys) if (!keys.has(k)) errors.push(`${locale}: missing key ${k}`);
  for (const k of keys) if (!baseKeys.has(k)) errors.push(`${locale}: unknown key ${k}`);

  for (const k of baseKeys) {
    if (!keys.has(k)) continue;
    const value = cat[k];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${locale}: empty value for ${k}`);
      continue;
    }
    const bp = params(base[k]);
    const lp = params(value);
    if (bp.size !== lp.size || [...bp].some((p) => !lp.has(p))) {
      errors.push(`${locale}: ${k} placeholders differ`);
    }
    if (JSON.stringify(tags(base[k])) !== JSON.stringify(tags(value))) {
      errors.push(`${locale}: ${k} inline markup differs`);
    }
    if (!SAME_OK.has(k) && value === base[k] && looksEnglish(value)) {
      errors.push(`${locale}: ${k} is still English`);
    }
  }
}

if (errors.length > 0) {
  console.error('locale parity failed:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`locale parity: ${locales.length} locale(s) match the base`);
