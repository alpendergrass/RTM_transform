const t = require('tap');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
let parse;
try { parse = require('csv-parse/sync').parse; } catch (e) { parse = require(path.join(__dirname, '..', 'node_modules', 'csv-parse', 'dist', 'cjs', 'sync.cjs')).parse; }

t.test('task without tags still receives @from_rtm', t => {
  const stamp = Date.now();
  const tmpJson = path.join(__dirname, '..', 'data', `rtm_test_task_from_rtm_notags_${stamp}.json`);
  const outCsv = path.join(__dirname, '..', 'data', `output_test_from_rtm_notags_${stamp}.csv`);
  const outJson = path.join(__dirname, '..', 'data', `used_records_test_from_rtm_notags_${stamp}.json`);
  t.teardown(() => { [tmpJson, outCsv, outJson].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} }); });

  const sampleCsv = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');
  const testData = { lists: [ { id: 'L1', name: 'TestList' } ], tasks: [ { id: 'T1', series_id: 'S1', title: 'No tag task', content: 'Do the thing with no tags', tags: [], list_id: 'L1' } ], notes: [] };
  fs.writeFileSync(tmpJson, JSON.stringify(testData, null, 2), 'utf8');

  const res = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), '--input', tmpJson, '--csv', sampleCsv, '--rowsPath', 'tasks', '--output', outCsv, '--output-json', outJson], { encoding: 'utf8' });
  t.equal(res.status, 0, `transform.js exited with status ${res.status}`);

  const csv = fs.readFileSync(outCsv, 'utf8');
  const records = parse(csv, { relax_quotes: true, relax_column_count: true });
  t.ok(records && records.length >= 2, 'expected at least header + one row');
  const header = records[0];
  const typeIdx = header.indexOf('TYPE');
  const contentIdx = header.indexOf('CONTENT');
  t.ok(typeIdx !== -1 && contentIdx !== -1, 'CSV must have TYPE and CONTENT headers');

  let found = false;
  for (let i = 1; i < records.length; i++) {
    const cols = records[i];
    const type = (cols[typeIdx] || '').replace(/^"|"$/g, '');
    if (type === 'task') {
      const content = (cols[contentIdx] || '').replace(/^"|"$/g, '').replace(/""/g, '"');
      t.match(content, /@from_rtm/, 'should include @from_rtm even with no tags');
      found = true;
      break;
    }
  }
  t.ok(found, 'found a task row in CSV');
  t.end();
});
