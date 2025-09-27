const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');
const fixture = path.join(dataDir, 'rtm_synthetic_trashed.json');
const outJson = path.join(dataDir, 'used_records_trashed.json');

// Run transform against the synthetic trashed fixture
const args = [
  path.join(repoRoot, 'transform.js'),
  fixture,
  '--map', path.join('data', 'mapping.sample.json'),
  '--rowsPath', 'tasks',
  '--output-json', outJson
];

console.log('Running:', 'node', args.join(' '));
const res = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
if (res.error) {
  console.error('Failed to run transform.js:', res.error);
  process.exit(2);
}

if (!fs.existsSync(outJson)) {
  console.error('Expected output JSON not found:', outJson);
  process.exit(2);
}

const used = JSON.parse(fs.readFileSync(outJson, 'utf8'));
const emittedIds = new Set(used.filter(r => r.type === 'task').map(r => r.data && r.data.id));

// Ensure trashed-parent and child-of-trashed are NOT present
let failed = false;
if (emittedIds.has('trashed-parent')) {
  console.error('TEST FAIL: trashed parent was emitted');
  failed = true;
}
if (emittedIds.has('child-of-trashed')) {
  console.error('TEST FAIL: child of trashed parent was emitted');
  failed = true;
}
// orphaned child should also be removed
if (emittedIds.has('orphaned-child')) {
  console.error('TEST FAIL: orphaned child was emitted');
  failed = true;
}
// keep-task should be present
if (!emittedIds.has('keep-task')) {
  console.error('TEST FAIL: keep-task was not emitted');
  failed = true;
}

if (failed) {
  console.error('TEST FAIL: trashed-exclusion test failed');
  process.exit(3);
}
console.log('TEST PASS: trashed tasks and descendants excluded correctly');
process.exit(0);
