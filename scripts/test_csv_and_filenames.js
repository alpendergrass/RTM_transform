const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function runTransform(args = []) {
  const transformPath = path.join(__dirname, '..', 'transform.js');
  const spawnArgs = [transformPath, ...args];
  try {
    const res = child_process.spawnSync('node', spawnArgs, { encoding: 'utf8' });
    if (res.status !== 0) {
      return { ok: false, error: new Error('transform failed'), stdout: res.stdout, stderr: res.stderr };
    }
    return { ok: true, out: res.stdout };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// Test 1: CSV escaping for newlines, backslashes, single and double quotes in notes
(function testCsvEscaping() {
  const tmpJson = path.join('data', 'tmp_rtm_escape_test.json');
  const sample = {
    lists: [{ id: 'L1', name: 'EscapingList' }],
    tasks: [
      { id: 'T1', list_id: 'L1', title: 'Task with note', series_id: 'S1' }
    ],
    notes: [
      { id: 'N1', series_id: 'S1', content: "Line1\nLine2 with \"double\" and 'single' quotes and a backslash \\ end" }
    ]
  };
  writeJson(tmpJson, sample);

  // Use a simple mapping that maps CONTENT to note.content and TYPE stays as default header
  const mapFile = path.join('data', 'tmp_map_escape.json');
  writeJson(mapFile, { CONTENT: 'content' });

  const res = runTransform(['--input', tmpJson, '--map', mapFile, '--rowsPath', 'tasks', '--csv', 'data/Todoist_Template_CSV_2025.csv', '--output', 'data/tmp_output_escape.csv', '--output-json', 'data/tmp_output_escape.json']);
  assert(res.ok, `transform failed: ${res.stderr || res.error}`);

  const csv = fs.readFileSync('data/tmp_output_escape.csv', 'utf8');
  // The note CONTENT cell should have newlines escaped (literal or quoted), backslashes doubled, single quotes escaped with backslash
  assert(csv.includes("Line1"), 'CSV missing note content line1');
  assert(csv.includes('double'), 'CSV missing double quote content');
  assert(csv.includes("\\\\"), "CSV should contain escaped backslash \\\\\\\\");
  assert(csv.includes("\\'"), "CSV should contain escaped single quote \\'");

  // Cleanup
  if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
  if (fs.existsSync(mapFile)) fs.unlinkSync(mapFile);
  if (fs.existsSync('data/tmp_output_escape.csv')) fs.unlinkSync('data/tmp_output_escape.csv');
  if (fs.existsSync('data/tmp_output_escape.json')) fs.unlinkSync('data/tmp_output_escape.json');
  console.log('testCsvEscaping passed');
})();

// Test 2: Filename auto-renaming when all rows share a single list
(function testFilenameAutoRename() {
  const tmpJson = path.join('data', 'tmp_rtm_name_test.json');
  const sample = {
    lists: [{ id: 'L2', name: 'Coffee Lovers' }],
    tasks: [
      { id: 'A1', list_id: 'L2', title: 'A' },
      { id: 'A2', list_id: 'L2', title: 'B' }
    ],
    notes: []
  };
  writeJson(tmpJson, sample);

  const res = runTransform(['--input', tmpJson, '--rowsPath', 'tasks', '--csv', 'data/Todoist_Template_CSV_2025.csv', '--output-json', 'data/tmp_used_records.json']);
  assert(res.ok, `transform failed: ${res.stderr || res.error}`);

  // Default outputCsvPath is ./data/output.csv; when auto-renamed it should become output_coffee_lovers.csv
  const expected = path.join('data', 'output_coffee_lovers.csv');
  assert(fs.existsSync(expected), `Expected auto-renamed CSV at ${expected}`);

  // Cleanup
  if (fs.existsSync(tmpJson)) fs.unlinkSync(tmpJson);
  if (fs.existsSync(expected)) fs.unlinkSync(expected);
  if (fs.existsSync('data/tmp_used_records.json')) fs.unlinkSync('data/tmp_used_records.json');
  console.log('testFilenameAutoRename passed');
})();

console.log('All CSV/filename tests passed');
