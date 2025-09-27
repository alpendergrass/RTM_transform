const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');
const outJson = path.join(dataDir, 'used_records_coffee.json');

// Run transform for Coffee list
const args = [
  path.join(repoRoot, 'transform.js'),
  '--map', path.join('data', 'mapping.sample.json'),
  '--rowsPath', 'tasks',
  '--rowsFilter', "listName === 'Coffee'",
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
// Build set of emitted task ids
const taskIds = new Set(used.filter(r => r.type === 'task').map(r => r.data && r.data.id));
let foundOrphan = false;
for (const rec of used) {
  if (rec.type !== 'task') continue;
  const pid = rec.data && rec.data.parent_id;
  if (pid && !taskIds.has(pid)) {
    console.error('Orphan task emitted:', rec.data.id, 'parent_id ->', pid);
    foundOrphan = true;
  }
}

if (foundOrphan) {
  console.error('TEST FAIL: orphaned child tasks detected');
  process.exit(3);
}
console.log('TEST PASS: no orphaned child tasks emitted');
process.exit(0);
