#!/usr/bin/env node
/**
 * Lists translation keys that code uses but the messages do not define (an error), and keys the messages define
 * that no code uses (a warning).
 *
 *   pnpm i18n:check                 # check this repo
 *   pnpm i18n:check --root <dir>    # check another tree (the tests use a fixture)
 *
 * Usage is found statically: `const t = useTranslations('ns')` (or `await getTranslations('ns')`), then
 * `t('key')`, `t.rich('key')`, `t.markup('key')` and `t.raw('key')`. A key built at run time cannot be checked:
 * `` t(`tier.${name}`) `` marks every key under `ns.tier.` as used, and `t(someVariable)` marks the whole
 * namespace as used, so neither is reported as unused. Dotted string literals such as `'errors.unsafe.what'`
 * count as references too, for keys passed around before they reach `t`. The English catalog is the reference; key parity between
 * languages is checked by `lib/messages.test.ts`.
 *
 * Exit code: 1 when a key is missing, 0 otherwise (unused keys only warn).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_DIRS = ['app', 'components', 'lib'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/;
const SKIP_FILE = /\.(test|spec)\.[jt]sx?$|\.d\.ts$/;

/** Flattens nested messages into dotted keys. Objects are kept too, since `t.raw` and `t.has` may name them. */
export function flattenMessages(messages, prefix = '', out = { leaves: new Set(), groups: new Set() }) {
  for (const [key, value] of Object.entries(messages)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      out.groups.add(full);
      flattenMessages(value, full, out);
    } else {
      out.leaves.add(full);
    }
  }
  return out;
}

/** Loads the reference catalog the way `i18n/request.ts` does: UI messages, with contract errors merged under `errors`. */
export function loadCatalog(root, locale = 'en') {
  const ui = JSON.parse(readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8'));
  let contractErrors = {};
  try {
    contractErrors = JSON.parse(readFileSync(path.join(root, 'messages', `errors.${locale}.json`), 'utf8'));
  } catch {
    // A tree without contract error messages (e.g. a fixture) is fine.
  }
  return { ...ui, errors: { ...(ui.errors ?? {}), ...contractErrors } };
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SOURCE_EXT.test(name) && !SKIP_FILE.test(name)) files.push(full);
  }
  return files;
}

const join = (ns, key) => (ns ? `${ns}.${key}` : key);
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// `const t = useTranslations('ns')`, `const t = await getTranslations('ns')`, `getTranslations({ namespace: 'ns' })`.
const DECLARATION =
  /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*([^)]*?)\s*\)/g;
const STRING_ARG = /^(['"`])([^'"`]*)\1$/;
const NAMESPACE_OPTION = /namespace\s*:\s*(['"`])([^'"`]*)\1/;

function namespaceOf(arg) {
  if (arg === '') return { ns: '' };
  const literal = arg.match(STRING_ARG);
  if (literal && !literal[2].includes('${')) return { ns: literal[2] };
  const option = arg.match(NAMESPACE_OPTION);
  if (option) return { ns: option[2] };
  if (arg.startsWith('{') && !arg.includes('namespace')) return { ns: '' };
  return { ns: null }; // computed namespace: its calls cannot be checked
}

/**
 * Finds every translation call in one file. Each call binds to the closest earlier declaration of that name,
 * which matches how components in this repo declare `t` once per function.
 */
export function scanSource(source, file = '<source>') {
  const declarations = [];
  for (const m of source.matchAll(DECLARATION)) {
    declarations.push({ name: m[1], index: m.index, ...namespaceOf(m[2]) });
  }
  const used = [];
  const dynamic = [];
  const names = [...new Set(declarations.map((d) => d.name))];
  for (const name of names) {
    const call = new RegExp(`(?<![\\w.$])${name}(?:\\.(rich|markup|raw|has))?\\(\\s*([^)\\s,][^,)]*)?`, 'g');
    for (const m of source.matchAll(call)) {
      const decl = declarations.filter((d) => d.name === name && d.index < m.index).at(-1);
      if (!decl || decl.ns === null) continue;
      const method = m[1] ?? '';
      const arg = (m[2] ?? '').trim();
      const line = lineOf(source, m.index);
      const literal = arg.match(/^(['"])(.*?)\1$/) ?? arg.match(/^(`)([^`]*)`$/);
      if (literal && !literal[2].includes('${')) {
        if (method !== 'has') used.push({ key: join(decl.ns, literal[2]), method, file, line });
      } else if (literal) {
        dynamic.push({ prefix: join(decl.ns, literal[2].slice(0, literal[2].indexOf('${'))), file, line });
      } else if (arg && decl.ns) {
        dynamic.push({ prefix: `${decl.ns}.`, file, line });
      }
      // A computed key on the root translator (`useTranslations()`) is covered by `references` below.
    }
  }
  // A computed key often comes from a full key written elsewhere, e.g. `{ what: 'errors.unsafe.what' }` passed to
  // `t(what)`. Dotted string literals and `` `errors.${code}` `` templates count as references for the unused list.
  const references = [...source.matchAll(/(['"])([A-Za-z][\w-]*(?:\.[\w-]+)+)\1/g)].map((m) => m[2]);
  const referencePrefixes = [...source.matchAll(/`([A-Za-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g)].map((m) => m[1]);
  return { used, dynamic, references, referencePrefixes };
}

/** Checks a tree. Returns the missing usages and the unused keys, both sorted. */
export function checkI18n({ root = process.cwd(), dirs = SOURCE_DIRS, locale = 'en' } = {}) {
  const { leaves, groups } = flattenMessages(loadCatalog(root, locale));
  const used = [];
  const dynamic = [];
  const references = new Set();
  const referencePrefixes = new Set();
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const result = scanSource(readFileSync(file, 'utf8'), path.relative(root, file));
      used.push(...result.used);
      dynamic.push(...result.dynamic);
      result.references.forEach((r) => references.add(r));
      result.referencePrefixes.forEach((p) => referencePrefixes.add(p));
    }
  }

  const missing = used
    .filter(({ key, method }) => !leaves.has(key) && !(method === 'raw' && groups.has(key)))
    .sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file) || a.line - b.line);

  const usedKeys = new Set([...used.map((u) => u.key), ...references]);
  const prefixes = [...new Set(dynamic.map((d) => d.prefix))];
  const allPrefixes = [...prefixes, ...referencePrefixes];
  const covered = (key) =>
    usedKeys.has(key) ||
    [...usedKeys].some((u) => groups.has(u) && key.startsWith(`${u}.`)) || // t.raw('group') reads its children
    allPrefixes.some((p) => key.startsWith(p));
  const unused = [...leaves].filter((key) => !covered(key)).sort();

  return { missing, unused, dynamicPrefixes: prefixes.sort() };
}

export function formatReport({ missing, unused, dynamicPrefixes }) {
  const lines = [];
  if (missing.length) {
    lines.push(`✖ ${missing.length} translation key(s) used in code but missing from the messages:`);
    for (const m of missing) lines.push(`  ${m.key}  (${m.file}:${m.line})`);
  } else {
    lines.push('✔ Every translation key used in code exists in the messages.');
  }
  if (unused.length) {
    lines.push('', `⚠ ${unused.length} key(s) in the messages are never used in code (warning):`);
    for (const key of unused) lines.push(`  ${key}`);
  }
  if (dynamicPrefixes.length) {
    lines.push('', `ℹ Keys built at run time were not checked under: ${dynamicPrefixes.join(', ')}`);
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const rootFlag = argv.indexOf('--root');
  return { root: rootFlag !== -1 && argv[rootFlag + 1] ? path.resolve(argv[rootFlag + 1]) : process.cwd() };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const report = checkI18n(parseArgs(process.argv.slice(2)));
  console.log(formatReport(report));
  process.exitCode = report.missing.length ? 1 : 0;
}
