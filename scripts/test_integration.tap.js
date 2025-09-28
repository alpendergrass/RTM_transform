const t = require('tap');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

t.test('integration: extract_schema and transform produce outputs', t => {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  t.ok(fs.existsSync(dataDir), 'data dir exists');

  const res1 = spawnSync('node', ['extract_schema.js'], { cwd: repoRoot, stdio: 'inherit' });
  t.equal(res1.status, 0, 'extract_schema.js exited 0');
  const schemaPath = path.join(dataDir, 'schema.json');
  t.ok(fs.existsSync(schemaPath), 'schema.json exists');
  t.ok(fs.statSync(schemaPath).size > 0, 'schema.json non-empty');

  const res2 = spawnSync('node', ['transform.js'], { cwd: repoRoot, stdio: 'inherit' });
  t.equal(res2.status, 0, 'transform.js exited 0');
  const csvPath = path.join(dataDir, 'output.csv');
  t.ok(fs.existsSync(csvPath), 'output.csv exists');
  t.ok(fs.statSync(csvPath).size > 0, 'output.csv non-empty');
  t.end();
});
