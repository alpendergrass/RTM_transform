const t = require('tap');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
let parse;
try {
  parse = require('csv-parse/sync').parse;
} catch (e) {
  parse = require(path.join(__dirname, '..', 'node_modules', 'csv-parse', 'dist', 'cjs', 'sync.cjs')).parse;
}

// This tap test mirrors scripts/test_task_from_rtm_tag.js but uses tap assertions
t.test('task tags include @from_rtm after existing tags', async (t) => {
  const tmpJsonPath = path.join(__dirname, '..', 'data', 'rtm_test_task_from_rtm_tap.json');
  const outputCsvPath = path.join(__dirname, '..', 'data', 'output_test_from_rtm_tap.csv');
  const sampleCsv = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');

  const testData = {
    lists: [ { id: 'L1', name: 'TestList' } ],
    tasks: [
      {
        id: 'T1',
        series_id: 'S1',
        title: 'Test task',
        content: 'Do the thing',
        tags: ['alpha','beta'],
        list_id: 'L1'
      }
    ],
    notes: []
  };

  fs.writeFileSync(tmpJsonPath, JSON.stringify(testData, null, 2), 'utf8');

  const cmd = `node "${path.join(__dirname, '..', 'transform.js')}" --input "${tmpJsonPath}" --csv "${sampleCsv}" --rowsPath tasks --output "${outputCsvPath}" --output-json "${path.join(__dirname,'..','data','used_records_test_from_rtm_tap.json')}"`;
  try {
    child_process.execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    t.fail(`transform.js failed: ${e && e.message}`);
    t.end();
    return;
  }

  const csv = fs.readFileSync(outputCsvPath, 'utf8');
  const lines = csv.split('\n').filter(Boolean);
  t.ok(lines.length >= 2, `should have at least header + one row (got ${lines.length})`);

  const header = parse(lines[0], { relax_quotes: true, relax_column_count: true })[0];
  const typeIdx = header.indexOf('TYPE');
  const contentIdx = header.indexOf('CONTENT');
  t.ok(typeIdx !== -1 && contentIdx !== -1, 'CSV must include TYPE and CONTENT headers');

  let found = false;
  for (let i = 1; i < lines.length; i++) {
    const cols = parse(lines[i], { relax_quotes: true, relax_column_count: true })[0] || [];
    const type = (cols[typeIdx] || '').replace(/^"|"$/g, '');
    if (type === 'task') {
      const content = (cols[contentIdx] || '').replace(/^"|"$/g, '').replace(/""/g, '"');
      t.match(content, /@alpha/, 'content should include @alpha');
      t.match(content, /@beta/, 'content should include @beta');
      t.match(content, /@from_rtm/, 'content should include @from_rtm');
      const posAlpha = content.indexOf('@alpha');
      const posBeta = content.indexOf('@beta');
      const posFrom = content.indexOf('@from_rtm');
      t.ok(posFrom > posAlpha && posFrom > posBeta, '@from_rtm should come after existing tags');
      found = true;
      break;
    }
  }

  t.ok(found, 'found a task row in CSV');

  // cleanup
  try { fs.unlinkSync(tmpJsonPath); } catch (e) {}
  try { fs.unlinkSync(outputCsvPath); } catch (e) {}
  try { fs.unlinkSync(path.join(__dirname,'..','data','used_records_test_from_rtm_tap.json')); } catch (e) {}

  t.end();
});
