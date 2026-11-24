import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LOCALES } from '../i18n/locales';

import en from '../messages/en.json';
import pcm from '../messages/pcm.json';
import ha from '../messages/ha.json';
import yo from '../messages/yo.json';
import ig from '../messages/ig.json';

const bundles: Record<string, unknown> = { en, pcm, ha, yo, ig };

const keys = (o: unknown, prefix = ''): string[] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

const enKeys = keys(en).sort();

describe('i18n completeness and parity', () => {
  it('every listed locale in LOCALES has a messages file and an errors file', () => {
    for (const { code } of LOCALES) {
      const msgPath = path.resolve(__dirname, `../messages/${code}.json`);
      const errPath = path.resolve(__dirname, `../messages/errors.${code}.json`);
      expect(fs.existsSync(msgPath), `messages/${code}.json exists`).toBe(true);
      expect(fs.existsSync(errPath), `messages/errors.${code}.json exists`).toBe(true);
    }
  });

  for (const { code, name } of LOCALES) {
    if (code === 'en') continue;

    it(`has the same message keys in English and ${name} (${code})`, () => {
      const a = enKeys;
      const b = keys(bundles[code]).sort();
      expect(a.filter((k) => !b.includes(k)), `missing in ${name}`).toEqual([]);
      expect(b.filter((k) => !a.includes(k)), `missing in English`).toEqual([]);
    });

    it(`uses the same placeholders in English and ${name} (${code})`, () => {
      const ph = (s: string) => [...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort().join(',');
      const m = bundles[code];
      for (const k of enKeys) {
        const get = (obj: unknown) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], obj) as string;
        expect(ph(get(m)), `placeholders in ${code}:${k}`).toBe(ph(get(en)));
      }
    });
  }

  it('has no empty strings in any locale', () => {
    for (const { code } of LOCALES) {
      const m = bundles[code];
      for (const k of keys(m)) {
        const v = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], m);
        expect(String(v).trim(), `${code}:${k}`).not.toBe('');
      }
    }
  });
});

const BANNED = ['seed phrase', 'secret phrase', 'private key', 'mnemonic', 'gas', 'wallet address', 'blockchain', 'smart contract', 'transaction hash'];
// Info sheets and legal documents may name these terms on purpose. Keep the list short and say why in docs/ux-writing.md.
const ALLOWLIST = new Set<string>([
  'help.a1',
  'terms.section2Body',
  'privacy.section3Body',
  'privacy.section5Body',
  'receipt.blockchainRef',
]);

describe('plain-language copy', () => {
  for (const { code } of LOCALES) {
    it(`has no banned crypto terms in ${code}`, () => {
      const hits: string[] = [];
      const m = bundles[code];
      for (const k of keys(m)) {
        if (ALLOWLIST.has(k)) continue;
        const v = String(k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], m));
        for (const term of BANNED) {
          if (new RegExp(`\\b${term}\\b`, 'i').test(v)) hits.push(`${code}:${k} contains "${term}"`);
        }
      }
      expect(hits).toEqual([]);
    });
  }
});
