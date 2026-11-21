import { describe, expect, it } from 'vitest';
import {
  calculateMedian,
  evaluateMetrics,
  formatSummary,
  parseBudgets,
  parseConfig,
} from './lighthouse-budget.mjs';

describe('calculateMedian', () => {
  it('calculates the median of an odd number of sorted elements', () => {
    expect(calculateMedian([1, 2, 3])).toBe(2);
    expect(calculateMedian([10, 20, 30, 40, 50])).toBe(30);
  });

  it('calculates the median of an odd number of unsorted elements', () => {
    expect(calculateMedian([3, 1, 2])).toBe(2);
    expect(calculateMedian([50, 10, 40, 20, 30])).toBe(30);
  });

  it('calculates the median of a single element', () => {
    expect(calculateMedian([42])).toBe(42);
  });

  it('handles duplicate numbers', () => {
    expect(calculateMedian([1, 2, 2])).toBe(2);
    expect(calculateMedian([2, 2, 2])).toBe(2);
  });

  it('calculates the average of the two middle elements for even counts', () => {
    expect(calculateMedian([1, 3])).toBe(2);
    expect(calculateMedian([10, 20, 30, 40])).toBe(25);
  });

  it('throws an error for an empty array', () => {
    expect(() => calculateMedian([])).toThrow('Cannot calculate median of an empty array');
  });
});

describe('parseConfig', () => {
  it('returns default configuration when no environment variables are set', () => {
    const config = parseConfig({});
    expect(config).toEqual({
      runs: 3,
      perfThreshold: 0.9,
      perfTolerance: 0.05,
      lcpThreshold: 2.5,
      lcpTolerance: 0.5,
    });
  });

  it('correctly parses valid custom environment variables', () => {
    const config = parseConfig({
      LIGHTHOUSE_RUNS: '5',
      LIGHTHOUSE_PERF_THRESHOLD: '0.95',
      LIGHTHOUSE_PERF_TOLERANCE: '0.02',
      LIGHTHOUSE_LCP_THRESHOLD: '2.0',
      LIGHTHOUSE_LCP_TOLERANCE: '0.3',
    });
    expect(config).toEqual({
      runs: 5,
      perfThreshold: 0.95,
      perfTolerance: 0.02,
      lcpThreshold: 2.0,
      lcpTolerance: 0.3,
    });
  });

  it('throws for even number of runs', () => {
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: '4' })).toThrow(/must be an odd positive integer/);
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: '2' })).toThrow(/must be an odd positive integer/);
  });

  it('throws for non-integer or non-positive runs', () => {
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: '0' })).toThrow(/must be an odd positive integer/);
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: '-3' })).toThrow(/must be an odd positive integer/);
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: 'three' })).toThrow(/must be an odd positive integer/);
    expect(() => parseConfig({ LIGHTHOUSE_RUNS: '3.5' })).toThrow(/must be an odd positive integer/);
  });

  it('throws for invalid perf threshold or tolerance', () => {
    expect(() => parseConfig({ LIGHTHOUSE_PERF_THRESHOLD: '-0.1' })).toThrow(/must be between 0 and 1/);
    expect(() => parseConfig({ LIGHTHOUSE_PERF_THRESHOLD: '1.2' })).toThrow(/must be between 0 and 1/);
    expect(() => parseConfig({ LIGHTHOUSE_PERF_THRESHOLD: 'abc' })).toThrow(/must be between 0 and 1/);

    expect(() => parseConfig({ LIGHTHOUSE_PERF_TOLERANCE: '-0.01' })).toThrow(/must be between 0 and 1/);
    expect(() => parseConfig({ LIGHTHOUSE_PERF_TOLERANCE: '1.5' })).toThrow(/must be between 0 and 1/);
  });

  it('throws for invalid LCP threshold or tolerance', () => {
    expect(() => parseConfig({ LIGHTHOUSE_LCP_THRESHOLD: '0' })).toThrow(/must be a positive number/);
    expect(() => parseConfig({ LIGHTHOUSE_LCP_THRESHOLD: '-1' })).toThrow(/must be a positive number/);
    expect(() => parseConfig({ LIGHTHOUSE_LCP_THRESHOLD: 'xyz' })).toThrow(/must be a positive number/);

    expect(() => parseConfig({ LIGHTHOUSE_LCP_TOLERANCE: '-0.5' })).toThrow(/must be a non-negative number/);
  });
});

describe('parseBudgets', () => {
  it('parses default budget when no arguments provided', () => {
    const { base, budgets } = parseBudgets([]);
    expect(base).toBe('http://localhost:3000');
    expect(budgets).toEqual([{ path: '/', maxKb: 170 }]);
  });

  it('parses custom base URL and multiple budgets', () => {
    const { base, budgets } = parseBudgets(['http://localhost:3010', '/:170', '/onboarding:400', '/offline:170']);
    expect(base).toBe('http://localhost:3010');
    expect(budgets).toEqual([
      { path: '/', maxKb: 170 },
      { path: '/onboarding', maxKb: 400 },
      { path: '/offline', maxKb: 170 },
    ]);
  });

  it('throws for invalid budget format or non-positive sizes', () => {
    expect(() => parseBudgets(['http://localhost:3000', 'invalid-budget'])).toThrow(/Invalid budget specifier/);
    expect(() => parseBudgets(['http://localhost:3000', '/:abc'])).toThrow(/Invalid budget size/);
    expect(() => parseBudgets(['http://localhost:3000', '/:0'])).toThrow(/Invalid budget size/);
  });
});

describe('evaluateMetrics', () => {
  const config = {
    perfThreshold: 0.9,
    perfTolerance: 0.05,
    lcpThreshold: 2.5,
    lcpTolerance: 0.5,
  };

  it('passes cleanly when all metrics are within strict thresholds', () => {
    const res = evaluateMetrics({ score: 0.95, lcp: 1.8, jsKb: 150, maxKb: 170 }, config);
    expect(res.passed).toBe(true);
    expect(res.jsPass).toBe(true);
    expect(res.perfPass).toBe(true);
    expect(res.perfWithinTolerance).toBe(false);
    expect(res.lcpPass).toBe(true);
    expect(res.lcpWithinTolerance).toBe(false);
  });

  it('passes when performance score is within tolerance', () => {
    // threshold is 0.90, tolerance is 0.05 -> min allowed is 0.85
    const res = evaluateMetrics({ score: 0.88, lcp: 2.0, jsKb: 160, maxKb: 170 }, config);
    expect(res.passed).toBe(true);
    expect(res.perfPass).toBe(true);
    expect(res.perfWithinTolerance).toBe(true);
  });

  it('fails when performance score is below tolerance limit', () => {
    const res = evaluateMetrics({ score: 0.84, lcp: 2.0, jsKb: 160, maxKb: 170 }, config);
    expect(res.passed).toBe(false);
    expect(res.perfPass).toBe(false);
    expect(res.perfWithinTolerance).toBe(false);
  });

  it('evaluates exactly at the performance limits', () => {
    // Exactly at threshold: clean pass
    const exactThreshold = evaluateMetrics({ score: 0.9, lcp: 2.5, jsKb: 170, maxKb: 170 }, config);
    expect(exactThreshold.perfPass).toBe(true);
    expect(exactThreshold.perfWithinTolerance).toBe(false);

    // Exactly at threshold - tolerance (0.85): pass within tolerance
    const exactTolerance = evaluateMetrics({ score: 0.85, lcp: 2.5, jsKb: 170, maxKb: 170 }, config);
    expect(exactTolerance.perfPass).toBe(true);
    expect(exactTolerance.perfWithinTolerance).toBe(true);
  });

  it('passes when LCP is within tolerance', () => {
    // threshold is 2.5s, tolerance is 0.5s -> max allowed is 3.0s
    const res = evaluateMetrics({ score: 0.95, lcp: 2.8, jsKb: 160, maxKb: 170 }, config);
    expect(res.passed).toBe(true);
    expect(res.lcpPass).toBe(true);
    expect(res.lcpWithinTolerance).toBe(true);
  });

  it('fails when LCP is above tolerance limit', () => {
    const res = evaluateMetrics({ score: 0.95, lcp: 3.1, jsKb: 160, maxKb: 170 }, config);
    expect(res.passed).toBe(false);
    expect(res.lcpPass).toBe(false);
    expect(res.lcpWithinTolerance).toBe(false);
  });

  it('evaluates exactly at LCP limits', () => {
    // Exactly at LCP threshold (2.5s): clean pass
    const exactThreshold = evaluateMetrics({ score: 0.95, lcp: 2.5, jsKb: 150, maxKb: 170 }, config);
    expect(exactThreshold.lcpPass).toBe(true);
    expect(exactThreshold.lcpWithinTolerance).toBe(false);

    // Exactly at threshold + tolerance (3.0s): pass within tolerance
    const exactTolerance = evaluateMetrics({ score: 0.95, lcp: 3.0, jsKb: 150, maxKb: 170 }, config);
    expect(exactTolerance.lcpPass).toBe(true);
    expect(exactTolerance.lcpWithinTolerance).toBe(true);
  });

  it('fails when JS size exceeds budget even if perf and LCP pass', () => {
    const res = evaluateMetrics({ score: 0.98, lcp: 1.5, jsKb: 175, maxKb: 170 }, config);
    expect(res.passed).toBe(false);
    expect(res.jsPass).toBe(false);
    expect(res.perfPass).toBe(true);
    expect(res.lcpPass).toBe(true);
  });

  it('passes when JS size is exactly at budget limit', () => {
    const res = evaluateMetrics({ score: 0.98, lcp: 1.5, jsKb: 170, maxKb: 170 }, config);
    expect(res.passed).toBe(true);
    expect(res.jsPass).toBe(true);
  });
});

describe('formatSummary', () => {
  it('formats readable summary displaying runs, medians, tolerances, and pass/fail statuses', () => {
    const config = {
      runs: 3,
      perfThreshold: 0.9,
      perfTolerance: 0.05,
      lcpThreshold: 2.5,
      lcpTolerance: 0.5,
    };

    const results = [
      {
        path: '/',
        maxKb: 170,
        runs: [
          { score: 0.92, lcp: 1.8, jsKb: 160 },
          { score: 0.95, lcp: 1.7, jsKb: 162 },
          { score: 0.94, lcp: 1.9, jsKb: 161 },
        ],
        median: { score: 0.94, lcp: 1.8, jsKb: 161 },
        evaluation: {
          passed: true,
          jsPass: true,
          perfPass: true,
          perfWithinTolerance: false,
          lcpPass: true,
          lcpWithinTolerance: false,
        },
        config,
      },
      {
        path: '/onboarding',
        maxKb: 400,
        runs: [
          { score: 0.82, lcp: 3.2, jsKb: 380 },
          { score: 0.81, lcp: 3.4, jsKb: 385 },
          { score: 0.80, lcp: 3.3, jsKb: 382 },
        ],
        median: { score: 0.81, lcp: 3.3, jsKb: 382 },
        evaluation: {
          passed: false,
          jsPass: true,
          perfPass: false,
          perfWithinTolerance: false,
          lcpPass: false,
          lcpWithinTolerance: false,
        },
        config,
      },
    ];

    const summary = formatSummary(results);

    expect(summary).toContain('LIGHTHOUSE PERFORMANCE & BUDGET GATE REPORT');
    expect(summary).toContain('Route: /  [PASS]');
    expect(summary).toContain('Route: /onboarding  [FAIL]');
    expect(summary).toContain('Run #1: JS 160 KB | Perf 0.92 | LCP 1.80s');
    expect(summary).toContain('Run #2: JS 162 KB | Perf 0.95 | LCP 1.70s');
    expect(summary).toContain('Run #3: JS 161 KB | Perf 0.94 | LCP 1.90s');
    expect(summary).toContain('Median & Evaluation:');
    expect(summary).toContain('SOME ROUTES FAILED');
  });
});
