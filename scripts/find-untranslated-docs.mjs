import fs from 'fs';

const path = new URL('../shared/documentation/translations.ts', import.meta.url);
const src = fs.readFileSync(path, 'utf8');
const docStart = src.indexOf('export const documentationTranslations');
const docSrc = src.slice(docStart);

const locales = ['en', 'pt', 'de', 'fr', 'ru', 'es', 'cn', 'ja'];

function parseEntries(block) {
  const entries = {};
  const re = /'([^']+)':\s*\{\s*name:\s*'((?:\\'|[^'])*)',\s*content:\s*`((?:\\.|[^`])*)`/g;
  let m;
  while ((m = re.exec(block))) {
    entries[m[1]] = {
      name: m[2].replace(/\\'/g, "'"),
      content: m[3],
    };
  }
  const uiMatch = block.match(/\bui:\s*\{\s*name:\s*'((?:\\'|[^'])*)',\s*content:\s*`((?:\\.|[^`])*)`/);
  if (uiMatch) {
    entries.ui = {
      name: uiMatch[1].replace(/\\'/g, "'"),
      content: uiMatch[2],
    };
  }
  return entries;
}

const localeBlocks = {};
for (let i = 0; i < locales.length; i++) {
  const loc = locales[i];
  const next = locales[i + 1];
  const startRe = new RegExp(`\\b${loc}:\\s*\\{`);
  const start = docSrc.search(startRe);
  if (start < 0) {
    console.log('missing start', loc);
    continue;
  }
  let end;
  if (next) {
    const endRe = new RegExp(`\\n\\s*${next}:\\s*\\{`);
    end = docSrc.search(endRe, start + 1);
  } else {
    end = docSrc.indexOf('\n};', start);
  }
  const block = docSrc.slice(start, end);
  localeBlocks[loc] = parseEntries(block);
}

const en = localeBlocks.en;
for (const loc of ['pt', 'de', 'fr', 'es', 'cn', 'ja']) {
  const untranslated = [];
  for (const key of Object.keys(en)) {
    const e = en[key];
    const l = localeBlocks[loc][key];
    if (!l) {
      untranslated.push({ key, reason: 'missing' });
      continue;
    }
    if (l.content === e.content) {
      untranslated.push({ key, name: l.name });
    }
  }
  console.log(`\n=== ${loc}: ${untranslated.length} untranslated ===`);
  for (const u of untranslated) {
    console.log(u.key);
  }
}
