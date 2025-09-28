const fs = require('fs');
const path = require('path');
const assert = require('assert');
const child_process = require('child_process');

// This test writes a small RTM-like JSON with one task that has tags, runs transform.js
// and asserts the generated CSV CONTENT includes the original @tags and ends with @from_rtm

const tmpJsonPath = path.join(__dirname, '..', 'data', 'rtm_test_task_from_rtm.json');
const outputCsvPath = path.join(__dirname, '..', 'data', 'output_test_from_rtm.csv');
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

// Write temp JSON
fs.writeFileSync(tmpJsonPath, JSON.stringify(testData, null, 2), 'utf8');

// Run transform.js with the tmp JSON and a custom output path
// Quote all paths to handle spaces in file paths
// Include --rowsPath tasks so the transform picks the tasks array from our test JSON
const cmd = `node "${path.join(__dirname, '..', 'transform.js')}" --input "${tmpJsonPath}" --csv "${sampleCsv}" --rowsPath tasks --output "${outputCsvPath}" --output-json "${path.join(__dirname,'..','data','used_records_test_from_rtm.json')}"`;
try {
  child_process.execSync(cmd, { stdio: 'inherit' });
} catch (e) {
  console.error('transform.js failed:', e.message);
  process.exit(2);
}

// Read CSV and find the CONTENT cell for the task row (first non-header row with TYPE=task)
const csv = fs.readFileSync(outputCsvPath, 'utf8');
const lines = csv.split('\n').filter(Boolean);
assert(lines.length >= 2, `Expected at least header + one row in CSV; got:\n${csv}`);
const header = parseCsvLine(lines[0]);
const typeIdx = header.indexOf('TYPE');
const contentIdx = header.indexOf('CONTENT');
assert(typeIdx !== -1 && contentIdx !== -1, `CSV must include TYPE and CONTENT headers; got headers=${header.join(',')}; CSV:\n${csv}`);

// Helper: simple CSV line parser that respects quoted fields
function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i+1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

let found = false;
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const type = cols[typeIdx].replace(/^"|"$/g, '');
  if (type === 'task') {
    const content = cols[contentIdx].replace(/^"|"$/g, '').replace(/""/g, '"');
    // Expect to see @alpha @beta followed by @from_rtm
    try {
      assert(content.includes('@alpha'), 'content should include @alpha');
      assert(content.includes('@beta'), 'content should include @beta');
      assert(content.includes('@from_rtm'), 'content should include @from_rtm');
      const posAlpha = content.indexOf('@alpha');
      const posBeta = content.indexOf('@beta');
      const posFrom = content.indexOf('@from_rtm');
      assert(posFrom > posAlpha && posFrom > posBeta, '@from_rtm should come after existing tags');
      found = true;
      break;
    } catch (e) {
      // On failure, include CSV contents in the error to aid CI debugging
      console.error('CSV contents:\n', csv);
      throw e;
    }
  }
}

assert(found, `Expected to find a task row in CSV; CSV:\n${csv}`);
console.log('TEST PASS: @from_rtm appended to task tags');

// Cleanup temp files
try { fs.unlinkSync(tmpJsonPath); } catch (e) {}
try { fs.unlinkSync(outputCsvPath); } catch (e) {}
try { fs.unlinkSync(path.join(__dirname,'..','data','used_records_test_from_rtm.json')); } catch (e) {}

process.exit(0);
