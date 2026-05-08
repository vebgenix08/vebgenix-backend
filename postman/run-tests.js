/**
 * Newman test runner with HTML + JSON + CLI output.
 * Usage:  node postman/run-tests.js
 *
 * Outputs to:  postman/reports/<timestamp>/
 *   report.html   — interactive HTML report (open in browser)
 *   summary.json  — machine-readable results
 *   run.txt       — plain-text CLI output
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

// ── timestamp folder ─────────────────────────────────────────────────────────
const ts      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir  = path.join(__dirname, 'reports', ts);
fs.mkdirSync(outDir, { recursive: true });

const htmlOut = path.join(outDir, 'report.html');
const jsonOut = path.join(outDir, 'summary.json');
const txtOut  = path.join(outDir, 'run.txt');

const collection = path.join(__dirname, 'Vebgenix-API.postman_collection.json');
const environment = path.join(__dirname, 'Vebgenix-Dev.postman_environment.json');

const cmd = [
  'npx newman run',
  `"${collection}"`,
  `-e "${environment}"`,
  '--delay-request 100',
  '--timeout-request 15000',
  '--reporters cli,htmlextra,json',
  `--reporter-htmlextra-export "${htmlOut}"`,
  `--reporter-htmlextra-title "Vebgenix API — ${ts}"`,
  '--reporter-htmlextra-showMarkdownLinks',
  '--reporter-htmlextra-logs',                 // include console.log from test scripts
  '--reporter-htmlextra-omitRequestBodies',
  `--reporter-json-export "${jsonOut}"`,
].join(' ');

console.log(`\n📁 Output folder: ${outDir}`);
console.log(`📋 HTML report:   ${htmlOut}\n`);
console.log('Running Newman...\n');

let output = '';
try {
  output = execSync(cmd, { cwd: path.dirname(__dirname), encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  console.log(output);
} catch (err) {
  // Newman exits non-zero on test failures — that's normal
  output = (err.stdout || '') + (err.stderr || '');
  console.log(output);
}

// ── save plain-text output ───────────────────────────────────────────────────
fs.writeFileSync(txtOut, output, 'utf8');

// ── print summary ────────────────────────────────────────────────────────────
try {
  const summary = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
  const stats   = summary.run.stats;
  const failures = summary.run.failures || [];

  console.log('\n' + '='.repeat(60));
  console.log('📊  RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Requests  : ${stats.requests.total}  (failed: ${stats.requests.failed})`);
  console.log(`  Tests     : ${stats.assertions.total}  (failed: ${stats.assertions.failed})`);
  console.log(`  Duration  : ${(summary.run.timings.completed - summary.run.timings.started) / 1000}s`);

  if (failures.length > 0) {
    console.log(`\n❌  FAILED TESTS (${failures.length}):`);
    failures.forEach((f, i) => {
      const name = f.source && f.source.name ? f.source.name : '?';
      const err  = f.error && f.error.message ? f.error.message : f.error;
      console.log(`  ${String(i + 1).padStart(3, ' ')}. [${name}] ${err}`);
    });
  } else {
    console.log('\n✅  All tests passed!');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📁  Full HTML report: ${htmlOut}`);
  console.log('='.repeat(60) + '\n');
} catch (e) {
  console.warn('Could not parse summary JSON:', e.message);
}
