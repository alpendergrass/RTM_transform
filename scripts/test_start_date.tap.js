const t = require('tap');
const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

t.test('start date handling for synthetic repeat task', t => {
  const dataDir = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const syntheticPath = path.join(dataDir, `rtm_synthetic_start_${Date.now()}.json`);
  const outCsv = path.join(dataDir, `output_synthetic_start_${Date.now()}.csv`);
  const outJson = path.join(dataDir, `used_records_synthetic_start_${Date.now()}.json`);
  t.teardown(() => { [syntheticPath, outCsv, outJson].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} }); });

  const epochMs = 1760006400000;
  const synthetic = { lists: [{ id: 'L1', name: 'Coffee' }], tasks: [{ id: 'synthetic-1', series_id: 'synth-series-1', list_id: 'L1', name: 'Synthetic repeat task', priority: 'P2', date_start: epochMs, date_start_has_time: true, repeat: 'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1', date_due: epochMs, date_due_has_time: true, tags: ['synthetic','test'] }] };
  fs.writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2), 'utf8');

  const args = [path.resolve(__dirname, '..', 'transform.js'), syntheticPath, '--map', path.join('data', 'mapping.sample.json'), '--rowsPath', 'tasks', '--output', outCsv, '--output-json', outJson];
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  t.equal(res.status, 0, 'transform exited ok');
  t.ok(fs.existsSync(outCsv), 'output CSV should exist');
  const csv = fs.readFileSync(outCsv, 'utf8');
  t.match(csv, /starting 2025-10-09/, 'recurrence phrase includes start date');
  t.match(csv, /every/, 'recurrence phrase includes every');
  t.end();
});
