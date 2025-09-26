const fs = require('fs');
const path = require('path');

function fail(msg) { console.error('TEST FAIL:', msg); process.exit(2); }
function pass(msg) { console.log('TEST PASS:', msg); }

const usedPath = path.join(__dirname, '..', 'data', 'used_records.json');
const csvPath = path.join(__dirname, '..', 'data', 'output.csv');
const mappingPath = path.join(__dirname, '..', 'data', 'mapping.sample.json');
const sampleCsvPath = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');

if (!fs.existsSync(usedPath)) fail(`${usedPath} not found`);
if (!fs.existsSync(csvPath)) fail(`${csvPath} not found`);

const used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
const csv = fs.readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
const headers = csv[0].split(',');
const rows = csv.slice(1);

// Attempt to discover which CSV header contains the task name (mapping-aware)
let contentHeader = 'CONTENT';
if (fs.existsSync(mappingPath)) {
  try {
    const map = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    // Find a header that maps to a path ending with 'name' or '.name'
    for (const h of Object.keys(map)) {
      const p = map[h];
      if (typeof p === 'string' && (p === 'name' || p.endsWith('.name'))) {
        contentHeader = h;
        break;
      }
    }
  } catch (e) {
    console.warn('Failed to read mapping file for CSV header detection, falling back to CONTENT');
  }
} else if (fs.existsSync(sampleCsvPath)) {
  // If there is no mapping file, but sample CSV exists, try to find a sensible header
  const sample = fs.readFileSync(sampleCsvPath, 'utf8');
  const sampleHeaderLine = sample.split('\n')[0] || '';
  const sampleHeaders = sampleHeaderLine.split(',');
  if (sampleHeaders.includes('CONTENT')) contentHeader = 'CONTENT';
}

// Build an index of positions in used_records by type and id
const posByTaskId = {}; // task id -> index in used
for (let i = 0; i < used.length; i++) {
  const item = used[i];
  if (!item || !item.type) continue;
  if (item.type === 'task' && item.data && item.data.id) posByTaskId[item.data.id] = i;
}

// 1) For every task that has parent_id and its parent exists in used, assert child index > parent index
for (let i = 0; i < used.length; i++) {
  const item = used[i];
  if (!item || item.type !== 'task') continue;
  const tid = item.data.id;
  const pid = item.data.parent_id;
  if (!pid) continue;
  if (posByTaskId[pid] !== undefined) {
    if (i <= posByTaskId[pid]) {
      fail(`Child task ${tid} appears at index ${i} which is not after parent ${pid} at index ${posByTaskId[pid]}`);
    }
  }
}

pass('All child tasks appear after their parent in used_records.json');

// 2) For each task in used, ensure its immediate following items are its notes (0 or more) and that no other task appears between task and its notes.
for (let i = 0; i < used.length; i++) {
  const item = used[i];
  if (!item || item.type !== 'task') continue;
  const task = item.data;
  // scan forward until next task or end
  let j = i + 1;
  while (j < used.length && used[j].type === 'note') {
    // ensure note belongs to this task by series_id or series linking
    const note = used[j].data;
    const matches = (note.series_id && ((task.series_id && note.series_id === task.series_id) || (task.id && note.series_id === task.id)));
    if (!matches) {
      fail(`Note at used index ${j} does not belong to task ${task.id}`);
    }
    j++;
  }
  // if the next non-note is a task but it should not be between task and its notes — our loop ensures there are no task items between task and its notes
}
pass('All notes in used_records.json immediately follow their owning task and belong to that task');

// 3) Sanity-check CSV ordering: ensure that for a given parent/child pair, the CSV row for the child appears after the CSV row for the parent.
// We'll map CSV rows back to used_records by content match on the NAME/CONTENT column (best-effort)
const nameIdx = headers.indexOf(contentHeader);
if (nameIdx === -1) {
  console.warn(`CSV header ${contentHeader} not found — skipping CSV ordering checks`);
  process.exit(0);
}

// Build a map from content -> first CSV row index (for tasks and notes)
const csvIndexByContent = new Map();
for (let i = 0; i < rows.length; i++) {
  const cols = rows[i].split(',');
  const content = cols[nameIdx] ? cols[nameIdx].replace(/^"|"$/g, '') : '';
  if (!csvIndexByContent.has(content)) csvIndexByContent.set(content, i);
}

for (const tId in posByTaskId) {
  const idx = posByTaskId[tId];
  const taskItem = used[idx];
  const pid = taskItem.data.parent_id;
  if (!pid) continue;
  if (posByTaskId[pid] !== undefined) {
    // map both to CSV indexes by content
    const contentParent = used[posByTaskId[pid]].data.name || '';
    const contentChild = taskItem.data.name || '';
    const cpIdx = csvIndexByContent.get(contentParent);
    const ccIdx = csvIndexByContent.get(contentChild);
    if (cpIdx === undefined || ccIdx === undefined) continue; // best-effort only
    if (ccIdx <= cpIdx) fail(`In CSV, child '${contentChild}' (row ${ccIdx}) is not after parent '${contentParent}' (row ${cpIdx})`);
  }
}
pass('CSV ordering (best-effort) shows child rows after parent rows');

console.log('All ordering checks passed');
process.exit(0);
