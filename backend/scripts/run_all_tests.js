import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suites = [
  { name: 'Production Hardening & Security', script: 'test_production_hardening.js' },
  { name: 'Deterministic Pricing Service', script: 'test_deterministic_pricing.js' },
  { name: 'Physical Loading & Geometry Engine', script: 'test_physical_loading_model.js' },
  { name: '10 Optimizer Fixtures with Domain Invariant Verifier', script: 'test_optimizer_fixtures.js' },
  { name: 'Capacity Search & Atomic Booking', script: 'test_capacity_search_and_booking.js' },
  { name: 'Logistics Manager Workflow', script: 'test_manager_workflow.js' },
  { name: 'Live Multi-Stop Trip Lifecycle', script: 'test_live_trip_lifecycle.js' },
  { name: 'Cryptographic Secure Stop Verification', script: 'test_secure_stop_verification.js' },
  { name: 'Dynamic Re-Optimization Domain Service', script: 'test_dynamic_reoptimization.js' },
  { name: 'Concurrency & Race Condition Defenses', script: 'test_concurrency_and_race_conditions.js' },
  { name: 'Operational Audit & Lifecycle Traceability', script: 'test_audit_event_traceability.js' },
  { name: 'Logistics Performance & Baseline Analytics', script: 'test_logistics_analytics.js' },
  { name: 'Data Foundation, Quality & Analytics Pipeline', script: 'test_data_foundation_and_analytics.js' },
  { name: 'Account Creation & Two-Role Architecture', script: 'test_account_creation_architecture.js' },
  { name: 'Multi-Tenant Marketplace & Tenant Isolation', script: 'test_multitenant_marketplace.js' }
];

console.log('\n===============================================================');
console.log('🚀 RUNNING MASTER COMPREHENSIVE ROAD LOGISTICS DOMAIN TEST SUITE');
console.log('===============================================================\n');

let passedCount = 0;
let failedCount = 0;
const results = [];

for (const suite of suites) {
  const scriptPath = path.join(__dirname, suite.script);
  console.log(`\n▶ Running Suite: ${suite.name} (${suite.script})...`);
  const startTime = Date.now();

  try {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ ${suite.name} PASSED (${elapsed}s)`);
    results.push({ name: suite.name, status: 'PASSED', time: `${elapsed}s` });
    passedCount++;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ ${suite.name} FAILED (${elapsed}s)`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    results.push({ name: suite.name, status: 'FAILED', time: `${elapsed}s`, error: err.message });
    failedCount++;
  }
}

console.log('\n===============================================================');
console.log('📊 MASTER DOMAIN TEST SUITE SUMMARY REPORT');
console.log('===============================================================');
for (const r of results) {
  const symbol = r.status === 'PASSED' ? '✅' : '❌';
  console.log(`${symbol} [${r.status}] ${r.name.padEnd(55)} (${r.time})`);
}
console.log('===============================================================');
console.log(`Total Suites: ${suites.length} | Passed: ${passedCount} | Failed: ${failedCount} | Pass Rate: ${Math.round((passedCount / suites.length) * 100)}%`);
console.log('===============================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
