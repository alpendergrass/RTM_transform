const t = require('tap');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function writeJson(filePath, obj) { fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8'); }

t.test('CSV escaping and filename auto-rename', t => {
  const dataDir = path.join(__dirname, '..', 'data');
  const tmpJson = path.join(dataDir, `tmp_rtm_escape_test_${Date.now()}.json`);
  const tmpMap = path.join(dataDir, `tmp_map_escape_${Date.now()}.json`);
  const outCsv = path.join(dataDir, `tmp_output_escape_${Date.now()}.csv`);
  const outJson = path.join(dataDir, `tmp_output_escape_${Date.now()}.json`);
  t.teardown(() => { [tmpJson, tmpMap, outCsv, outJson].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} }); });

  const sample = { lists: [{ id: 'L1', name: 'EscapingList' }], tasks: [{ id: 'T1', list_id: 'L1', title: 'Task with note', series_id: 'S1' }], notes: [{ id: 'N1', series_id: 'S1', content: "Line1\nLine2 with \"double\" and 'single' quotes and a backslash \\ end" }] };
  writeJson(tmpJson, sample);
  writeJson(tmpMap, { CONTENT: 'content' });

  const res = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), '--input', tmpJson, '--map', tmpMap, '--rowsPath', 'tasks', '--csv', path.join('data', 'Todoist_Template_CSV_2025.csv'), '--output', outCsv, '--output-json', outJson], { encoding: 'utf8' });
  t.equal(res.status, 0, 'transform exited ok for escaping test');

  const csv = fs.readFileSync(outCsv, 'utf8');
  t.match(csv, /Line1/, 'CSV contains line1');
  t.match(csv, /double/, 'CSV contains double quotes text');
  t.match(csv, /\\\\/, 'CSV contains escaped backslash');
  t.match(csv, /\\'/, "CSV contains escaped single quote");

  // filename auto-rename: create a sample with single list name 'Coffee Lovers'
  const tmpNameJson = path.join(dataDir, `tmp_rtm_name_test_${Date.now()}.json`);
  writeJson(tmpNameJson, { lists: [{ id: 'L2', name: 'Coffee Lovers' }], tasks: [{ id: 'A1', list_id: 'L2', title: 'A' }, { id: 'A2', list_id: 'L2', title: 'B' }], notes: [] });
  const res2 = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), tmpNameJson, '--rowsPath', 'tasks', '--csv', path.join('data', 'Todoist_Template_CSV_2025.csv'), '--output-json', path.join('data', `tmp_used_records_${Date.now()}.json`)], { encoding: 'utf8' });
  t.equal(res2.status, 0, 'transform exited ok for filename auto-rename');

  // Look for output_coffee_lovers.csv
  const expected = path.join('data', 'output_coffee_lovers.csv');
  t.ok(fs.existsSync(expected), `Expected auto-renamed CSV at ${expected}`);
  // cleanup
  try { fs.unlinkSync(tmpNameJson); } catch (e) {}
  try { fs.unlinkSync(expected); } catch (e) {}

  t.end();
});
