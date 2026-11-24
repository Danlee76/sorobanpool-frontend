// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkI18n, formatReport, scanSource } from './i18n-check.mjs';

const fixture = fileURLToPath(new URL('../tests/fixtures/i18n-check', import.meta.url));
const script = fileURLToPath(new URL('./i18n-check.mjs', import.meta.url));

describe('i18n-check (#50)', () => {
  it('finds the missing and the unused key in the fixture', () => {
    const report = checkI18n({ root: fixture });
    expect(report.missing.map((m) => m.key)).toEqual(['greeting.missing']);
    expect(report.missing[0]).toMatchObject({ file: 'app/page.tsx', line: 10 });
    expect(report.unused).toEqual(['greeting.unused']);
  });

  it('exits non-zero on missing keys and lists unused keys as a warning', () => {
    let status = 0;
    let stdout = '';
    try {
      execFileSync(process.execPath, [script, '--root', fixture], { encoding: 'utf8' });
    } catch (e) {
      ({ status, stdout } = e as { status: number; stdout: string });
    }
    expect(status).toBe(1);
    expect(stdout).toMatch(/missing from the messages:\n {2}greeting\.missing/);
    expect(stdout).toMatch(/never used in code \(warning\):\n {2}greeting\.unused/);
  });

  it('exits zero when only unused keys remain', () => {
    const report = { missing: [], unused: ['a.b'], dynamicPrefixes: [] };
    expect(formatReport(report)).toContain('✔ Every translation key used in code exists');
  });

  it('parses namespaces, rich/raw calls, getTranslations and template prefixes', () => {
    const source = `
      const t = useTranslations('pool');
      t('price'); t.rich('terms', { b: (c) => c }); t.raw('tiers'); t.has('maybe');
      t(\`state.\${s}\`);
      async function Server() {
        const t = await getTranslations({ locale, namespace: 'home' });
        return t("title");
      }
      t(key);
    `;
    const { used, dynamic } = scanSource(source);
    expect(used.map((u) => u.key)).toEqual(['pool.price', 'pool.terms', 'pool.tiers', 'home.title']);
    expect(dynamic.map((d) => d.prefix)).toEqual(['pool.state.', 'home.']);
  });
});
