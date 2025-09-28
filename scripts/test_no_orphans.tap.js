const t = require('tap');
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

t.test('no orphaned child tasks emitted for Coffee list', t => {
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  const outJson = path.join(dataDir, `used_records_coffee_${Date.now()}.json`);
  t.teardown(() => { try { fs.unlinkSync(outJson); } catch (e) {} });

  const args = [path.join(repoRoot, 'transform.js'), '--map', path.join('data', 'mapping.sample.json'), '--rowsPath', 'tasks', '--rowsFilter', "listName === 'Coffee'", '--output-json', outJson];
  const res = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' });
  t.equal(res.status, 0, 'transform exited ok');
  t.ok(fs.existsSync(outJson), 'output JSON exists');
  const used = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  const taskIds = new Set(used.filter(r => r.type === 'task').map(r => r.data && r.data.id));
  for (const rec of used) { if (rec.type !== 'task') continue; const pid = rec.data && rec.data.parent_id; if (pid && !taskIds.has(pid)) t.fail(`Orphan task emitted: ${rec.data.id} parent ${pid}`); }
  t.end();
});
