const assert = require('assert');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const TMP = path.join(__dirname, '..', 'tmp-test');
function rmdirRecursive(p) {
  if (!fs.existsSync(p)) return;
  for (const f of fs.readdirSync(p)) {
    const fp = path.join(p, f);
    if (fs.statSync(fp).isDirectory()) rmdirRecursive(fp);
    else fs.unlinkSync(fp);
  }
  fs.rmdirSync(p);
}

before(() => {
  if (fs.existsSync(TMP)) rmdirRecursive(TMP);
  fs.mkdirSync(TMP);
});

after(() => {
  try { rmdirRecursive(TMP); } catch (e) {}
});

function runTransform(args = []) {
  const cmd = ['node', path.join(__dirname, '..', 'transform.js'), ...args];
  const res = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), ...args], { encoding: 'utf8' });
  return res;
}

describe('transform integration (fixture-based)', function() {
  it('csv: should produce output for a tiny fixture', function() {
    const sample = {
      lists: [{ id: 'L1', name: 'TestList' }],
      tasks: [ { id: 'T1', series_id: 'S1', list_id: 'L1', name: 'Hello', date_due: 1700000000000 } ],
      notes: []
    };
    const input = path.join(TMP, 'rtm_fixture.json');
    fs.writeFileSync(input, JSON.stringify(sample));

    const map = path.join(TMP, 'map.json');
    fs.writeFileSync(map, JSON.stringify({ CONTENT: 'name' }));

    const outCsv = path.join(TMP, 'out.csv');
    const outJson = path.join(TMP, 'out.json');

    const res = runTransform(['--input', input, '--map', map, '--rowsPath', 'tasks', '--csv', path.join('data', 'Todoist_Template_CSV_2025.csv'), '--output', outCsv, '--output-json', outJson]);
    assert.strictEqual(res.status, 0, `transform failed: ${res.stderr || res.error}`);
    assert.ok(fs.existsSync(outCsv), 'CSV output missing');
    assert.ok(fs.existsSync(outJson), 'JSON output missing');

    const csv = fs.readFileSync(outCsv, 'utf8');
    assert.ok(csv.includes('Hello'), 'CSV content missing task title');
  });

  it('orphan: orphaned child should be removed', function() {
    const sample = {
      lists: [{ id: 'L2', name: 'OrphanList' }],
      tasks: [
        { id: 'P1', series_id: 'S2', list_id: 'L2', name: 'Parent' },
        { id: 'C1', series_id: 'S2', list_id: 'L2', name: 'Child', parent_id: 'MISSING' }
      ],
      notes: []
    };
    const input = path.join(TMP, 'rtm_orphan.json');
    fs.writeFileSync(input, JSON.stringify(sample));
    const map = path.join(TMP, 'map2.json');
    fs.writeFileSync(map, JSON.stringify({ CONTENT: 'name' }));

    const outCsv = path.join(TMP, 'out2.csv');
    const outJson = path.join(TMP, 'out2.json');

    const res = runTransform(['--input', input, '--map', map, '--rowsPath', 'tasks', '--csv', path.join('data', 'Todoist_Template_CSV_2025.csv'), '--output', outCsv, '--output-json', outJson]);
    assert.strictEqual(res.status, 0, `transform failed: ${res.stderr || res.error}`);
    const used = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    const ids = used.map(r => r.data && r.data.id).filter(Boolean);
    assert.ok(ids.includes('P1'));
    assert.ok(!ids.includes('C1'), 'orphaned child should have been removed');
  });
});
