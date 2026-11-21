// Usage: node scripts/lighthouse-budget.mjs <baseUrl> <path:maxJsKb>...   e.g. / :170 /onboarding:400
// Measures JavaScript transfer size, Lighthouse Performance score, and Largest Contentful Paint (LCP)
// across multiple runs (default: 3) and gates on the median values with configurable tolerances.
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Calculates the median value of a non-empty array of numbers.
 * @param {number[]} values
 * @returns {number}
 */
export function calculateMedian(values) {
  if (!values || values.length === 0) {
    throw new Error('Cannot calculate median of an empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Parses and validates environment-based configuration.
 * @param {Record<string, string | undefined>} [env=process.env]
 */
export function parseConfig(env = process.env) {
  const rawRuns = env.LIGHTHOUSE_RUNS ?? '3';
  const runs = Number(rawRuns);
  if (!Number.isInteger(runs) || runs <= 0 || runs % 2 === 0) {
    throw new Error(`LIGHTHOUSE_RUNS must be an odd positive integer (e.g. 1, 3, 5), got: "${rawRuns}"`);
  }

  const rawPerfThreshold = env.LIGHTHOUSE_PERF_THRESHOLD ?? '0.90';
  const perfThreshold = Number(rawPerfThreshold);
  if (Number.isNaN(perfThreshold) || perfThreshold < 0 || perfThreshold > 1) {
    throw new Error(`LIGHTHOUSE_PERF_THRESHOLD must be between 0 and 1, got: "${rawPerfThreshold}"`);
  }

  const rawPerfTolerance = env.LIGHTHOUSE_PERF_TOLERANCE ?? '0.05';
  const perfTolerance = Number(rawPerfTolerance);
  if (Number.isNaN(perfTolerance) || perfTolerance < 0 || perfTolerance > 1) {
    throw new Error(`LIGHTHOUSE_PERF_TOLERANCE must be between 0 and 1, got: "${rawPerfTolerance}"`);
  }

  const rawLcpThreshold = env.LIGHTHOUSE_LCP_THRESHOLD ?? '2.5';
  const lcpThreshold = Number(rawLcpThreshold);
  if (Number.isNaN(lcpThreshold) || lcpThreshold <= 0) {
    throw new Error(`LIGHTHOUSE_LCP_THRESHOLD must be a positive number in seconds, got: "${rawLcpThreshold}"`);
  }

  const rawLcpTolerance = env.LIGHTHOUSE_LCP_TOLERANCE ?? '0.5';
  const lcpTolerance = Number(rawLcpTolerance);
  if (Number.isNaN(lcpTolerance) || lcpTolerance < 0) {
    throw new Error(`LIGHTHOUSE_LCP_TOLERANCE must be a non-negative number in seconds, got: "${rawLcpTolerance}"`);
  }

  return {
    runs,
    perfThreshold,
    perfTolerance,
    lcpThreshold,
    lcpTolerance,
  };
}

/**
 * Parses CLI arguments into a base URL and budget entries.
 * @param {string[]} [args=process.argv.slice(2)]
 */
export function parseBudgets(args = process.argv.slice(2)) {
  const [base = 'http://localhost:3000', ...rest] = args;
  const budgetList = rest.length ? rest : ['/:170'];
  const budgets = budgetList.map((a) => {
    const i = a.lastIndexOf(':');
    if (i === -1) {
      throw new Error(`Invalid budget specifier "${a}". Expected format "<path>:<maxKb>"`);
    }
    const p = a.slice(0, i);
    const maxKb = Number(a.slice(i + 1));
    if (Number.isNaN(maxKb) || maxKb <= 0) {
      throw new Error(`Invalid budget size in "${a}". Expected positive number of KB.`);
    }
    return { path: p, maxKb };
  });
  return { base, budgets };
}

/**
 * Evaluates median metrics against thresholds and tolerances.
 * @param {{ score: number, lcp: number, jsKb: number, maxKb: number }} metrics
 * @param {{ perfThreshold: number, perfTolerance: number, lcpThreshold: number, lcpTolerance: number }} config
 */
export function evaluateMetrics(metrics, config) {
  const { score, lcp, jsKb, maxKb } = metrics;
  const { perfThreshold, perfTolerance, lcpThreshold, lcpTolerance } = config;

  // JS budget check: must not exceed maximum KB
  const jsPass = jsKb <= maxKb;

  // Performance score check: >= threshold is clean pass; >= threshold - tolerance is pass within tolerance
  const perfCleanPass = score >= perfThreshold;
  const minAllowedPerf = perfThreshold - perfTolerance;
  const perfPass = score >= minAllowedPerf;
  const perfWithinTolerance = perfPass && !perfCleanPass;

  // LCP check: <= threshold is clean pass; <= threshold + tolerance is pass within tolerance
  const lcpCleanPass = lcp <= lcpThreshold;
  const maxAllowedLcp = lcpThreshold + lcpTolerance;
  const lcpPass = lcp <= maxAllowedLcp;
  const lcpWithinTolerance = lcpPass && !lcpCleanPass;

  const passed = jsPass && perfPass && lcpPass;

  return {
    passed,
    jsPass,
    perfPass,
    perfWithinTolerance,
    lcpPass,
    lcpWithinTolerance,
  };
}

/**
 * Formats a summary of all runs, medians, tolerances, and pass/fail statuses.
 * @param {Array<{
 *   path: string,
 *   maxKb: number,
 *   runs: Array<{ score: number, lcp: number, jsKb: number }>,
 *   median: { score: number, lcp: number, jsKb: number },
 *   evaluation: ReturnType<typeof evaluateMetrics>,
 *   config: ReturnType<typeof parseConfig>
 * }>} results
 * @returns {string}
 */
export function formatSummary(results) {
  const lines = [];
  lines.push('================================================================================');
  lines.push('LIGHTHOUSE PERFORMANCE & BUDGET GATE REPORT');
  lines.push('================================================================================');

  let allPassed = true;

  for (const res of results) {
    const { path: p, maxKb, runs, median, evaluation, config } = res;
    if (!evaluation.passed) allPassed = false;

    const statusBadge = evaluation.passed ? '[PASS]' : '[FAIL]';
    lines.push(`\nRoute: ${p}  ${statusBadge}`);
    lines.push(`  Budget (JS): <= ${maxKb} KB`);
    lines.push(`  Thresholds:  Perf >= ${config.perfThreshold.toFixed(2)} (tol -${config.perfTolerance.toFixed(2)}), LCP <= ${config.lcpThreshold.toFixed(1)}s (tol +${config.lcpTolerance.toFixed(1)}s)`);

    lines.push('  Individual runs:');
    runs.forEach((r, idx) => {
      lines.push(`    Run #${idx + 1}: JS ${r.jsKb.toFixed(0)} KB | Perf ${r.score.toFixed(2)} | LCP ${r.lcp.toFixed(2)}s`);
    });

    const jsStatus = evaluation.jsPass ? 'PASS' : `FAIL (> ${maxKb} KB)`;
    const perfStatus = evaluation.perfPass
      ? (evaluation.perfWithinTolerance ? `PASS (within tolerance >= ${(config.perfThreshold - config.perfTolerance).toFixed(2)})` : 'PASS')
      : `FAIL (< ${(config.perfThreshold - config.perfTolerance).toFixed(2)})`;
    const lcpStatus = evaluation.lcpPass
      ? (evaluation.lcpWithinTolerance ? `PASS (within tolerance <= ${(config.lcpThreshold + config.lcpTolerance).toFixed(1)}s)` : 'PASS')
      : `FAIL (> ${(config.lcpThreshold + config.lcpTolerance).toFixed(1)}s)`;

    lines.push('  Median & Evaluation:');
    lines.push(`    JS Size:     ${median.jsKb.toFixed(0)} KB [${jsStatus}]`);
    lines.push(`    Performance: ${median.score.toFixed(2)} [${perfStatus}]`);
    lines.push(`    LCP:         ${median.lcp.toFixed(2)}s [${lcpStatus}]`);
  }

  lines.push('\n--------------------------------------------------------------------------------');
  lines.push(`Overall result: ${allPassed ? 'ALL ROUTES PASSED' : 'SOME ROUTES FAILED'}`);
  lines.push('================================================================================\n');

  return lines.join('\n');
}

/**
 * Runs a single Lighthouse audit on a URL with one retry if an audit fails or returns incomplete metrics.
 * Does NOT silently shrink the sample size.
 */
async function runSingleLighthouse(url, port, maxRetries = 1) {
  let attempts = 0;
  while (attempts <= maxRetries) {
    try {
      attempts++;
      const r = await lighthouse(url, {
        port,
        output: 'json',
        onlyCategories: ['performance'],
        logLevel: 'error',
      });
      const lhr = r.lhr;
      const score = lhr.categories?.performance?.score;
      if (score === undefined || score === null) {
        throw new Error('Lighthouse did not report a performance score.');
      }
      const lcpValue = lhr.audits?.['largest-contentful-paint']?.numericValue;
      if (lcpValue === undefined || lcpValue === null) {
        throw new Error('Lighthouse did not report a Largest Contentful Paint (LCP) value.');
      }
      const scripts = lhr.audits?.['network-requests']?.details?.items?.filter((i) => i.resourceType === 'Script') ?? [];
      const jsKb = scripts.reduce((n, i) => n + (i.transferSize ?? 0), 0) / 1024;
      const lcp = lcpValue / 1000;

      return {
        score,
        lcp,
        jsKb,
      };
    } catch (err) {
      if (attempts > maxRetries) {
        throw new Error(`Failed Lighthouse run on ${url} after ${attempts} attempts: ${err.message}`);
      }
    }
  }
  throw new Error(`Failed Lighthouse run on ${url}`);
}

/**
 * Main execution runner.
 */
export async function runMain() {
  const config = parseConfig();
  const { base, budgets } = parseBudgets();

  const chrome = await launch({
    chromePath: process.env.CHROME_PATH,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  const results = [];
  let failed = false;

  try {
    for (const { path: p, maxKb } of budgets) {
      const fullUrl = base + p;
      const runs = [];

      for (let i = 0; i < config.runs; i++) {
        const runResult = await runSingleLighthouse(fullUrl, chrome.port);
        runs.push(runResult);
      }

      if (runs.length !== config.runs) {
        throw new Error(`Expected ${config.runs} runs for ${p}, but obtained ${runs.length}. Refusing to shrink sample.`);
      }

      const median = {
        score: calculateMedian(runs.map((r) => r.score)),
        lcp: calculateMedian(runs.map((r) => r.lcp)),
        jsKb: calculateMedian(runs.map((r) => r.jsKb)),
      };

      const evaluation = evaluateMetrics({ ...median, maxKb }, config);
      if (!evaluation.passed) {
        failed = true;
      }

      results.push({
        path: p,
        maxKb,
        runs,
        median,
        evaluation,
        config,
      });
    }

    const summaryText = formatSummary(results);
    console.log(summaryText);
  } finally {
    await chrome.kill();
  }

  process.exit(failed ? 1 : 0);
}

// Guard main run so importing functions for testing does not launch Chrome/Lighthouse
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runMain().catch((err) => {
    console.error('[lighthouse-budget] Execution error:', err);
    process.exit(1);
  });
}
