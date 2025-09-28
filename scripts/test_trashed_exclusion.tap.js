const t = require('tap');
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

t.test('trashed tasks and descendants excluded correctly', t => {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  const fixture = path.join(dataDir, 'rtm_synthetic_trashed.json');
  const outJson = path.join(dataDir, `used_records_trashed_${Date.now()}.json`);
  t.teardown(() => { try { fs.unlinkSync(outJson); } catch (e) {} });

  const args = [path.join(repoRoot, 'transform.js'), fixture, '--map', path.join('data', 'mapping.sample.json'), '--rowsPath', 'tasks', '--output-json', outJson];
  const res = spawnSync(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
  t.equal(res.status, 0, 'transform exited ok');
  t.ok(fs.existsSync(outJson), 'output JSON exists');
  const used = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  const emittedIds = new Set(used.filter(r => r.type === 'task').map(r => r.data && r.data.id));
  t.notOk(emittedIds.has('trashed-parent'), 'trashed parent should not be emitted');
  t.notOk(emittedIds.has('child-of-trashed'), 'child of trashed parent should not be emitted');
  t.notOk(emittedIds.has('orphaned-child'), 'orphaned child should not be emitted');
  t.ok(emittedIds.has('keep-task'), 'keep-task should be present');
  t.end();
});
