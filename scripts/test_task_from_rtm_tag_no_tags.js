const fs = require('fs');
const path = require('path');
const assert = require('assert');
const child_process = require('child_process');

// Test that a task without tags still receives @from_rtm appended
const tmpJsonPath = path.join(__dirname, '..', 'data', 'rtm_test_task_from_rtm_notags.json');
const outputCsvPath = path.join(__dirname, '..', 'data', 'output_test_from_rtm_notags.csv');
const sampleCsv = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');

const testData = {
  lists: [ { id: 'L1', name: 'TestList' } ],
  tasks: [
    {
      id: 'T1',
      series_id: 'S1',
      title: 'No tag task',
      content: 'Do the thing with no tags',
      tags: [],
      list_id: 'L1'
    }
  ],
  notes: []
};

fs.writeFileSync(tmpJsonPath, JSON.stringify(testData, null, 2), 'utf8');

const cmd = `node "${path.join(__dirname, '..', 'transform.js')}" --input "${tmpJsonPath}" --csv "${sampleCsv}" --rowsPath tasks --output "${outputCsvPath}" --output-json "${path.join(__dirname,'..','data','used_records_test_from_rtm_notags.json')}"`;
try {
  child_process.execSync(cmd, { stdio: 'inherit' });
} catch (e) {
  console.error('transform.js failed:', e.message);
  process.exit(2);
}

const csv = fs.readFileSync(outputCsvPath, 'utf8');
const lines = csv.split('\n').filter(Boolean);
assert(lines.length >= 2, `Expected at least header + one row in CSV; got:\n${csv}`);
const header = parseCsvLine(lines[0]);
const typeIdx = header.indexOf('TYPE');
const contentIdx = header.indexOf('CONTENT');
assert(typeIdx !== -1 && contentIdx !== -1, `CSV must include TYPE and CONTENT headers; got headers=${header.join(',')}; CSV:\n${csv}`);

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
    try {
      assert(content.includes('@from_rtm'), 'content should include @from_rtm even when no tags present');
      found = true;
      break;
    } catch (e) {
      console.error('CSV contents:\n', csv);
      throw e;
    }
  }
}

assert(found, `Expected to find a task row in CSV; CSV:\n${csv}`);
console.log('TEST PASS: @from_rtm present for tasks without tags');

// Cleanup
try { fs.unlinkSync(tmpJsonPath); } catch (e) {}
try { fs.unlinkSync(outputCsvPath); } catch (e) {}
try { fs.unlinkSync(path.join(__dirname,'..','data','used_records_test_from_rtm_notags.json')); } catch (e) {}

process.exit(0);
