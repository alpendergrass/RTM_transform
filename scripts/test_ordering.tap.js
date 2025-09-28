const t = require('tap');
const fs = require('fs');
const path = require('path');
let parse;
try { parse = require('csv-parse/sync').parse; } catch (e) { parse = require(path.join(__dirname, '..', 'node_modules', 'csv-parse', 'dist', 'cjs', 'sync.cjs')).parse; }

t.test('ordering and notes follow tasks', t => {
  const repoRoot = path.join(__dirname, '..');
  const usedPath = path.join(repoRoot, 'data', 'used_records.json');
  const csvPath = path.join(repoRoot, 'data', 'output.csv');
  const mappingPath = path.join(repoRoot, 'data', 'mapping.sample.json');
  const sampleCsvPath = path.join(repoRoot, 'data', 'Todoist_Template_CSV_2025.csv');

  t.ok(fs.existsSync(usedPath), `${usedPath} should exist`);
  t.ok(fs.existsSync(csvPath), `${csvPath} should exist`);

  const used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
  const csv = fs.readFileSync(csvPath, 'utf8');
  const records = parse(csv, { relax_quotes: true, relax_column_count: true });
  t.ok(records && records.length >= 1, 'parsed CSV records');
  const header = records[0] || [];

  // detect content header
  let contentHeader = 'CONTENT';
  if (fs.existsSync(mappingPath)) {
    try {
      const map = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      for (const h of Object.keys(map)) {
        const p = map[h];
        if (typeof p === 'string' && (p === 'name' || p.endsWith('.name'))) { contentHeader = h; break; }
      }
    } catch (e) { /* ignore */ }
  } else if (fs.existsSync(sampleCsvPath)) {
    const sampleHeaderLine = fs.readFileSync(sampleCsvPath, 'utf8').split('\n')[0] || '';
    if (sampleHeaderLine.split(',').includes('CONTENT')) contentHeader = 'CONTENT';
  }

  const posByTaskId = {};
  for (let i = 0; i < used.length; i++) {
    const item = used[i]; if (!item || !item.type) continue; if (item.type === 'task' && item.data && item.data.id) posByTaskId[item.data.id] = i;
  }

  // 1) children after parents
  for (let i = 0; i < used.length; i++) {
    const item = used[i]; if (!item || item.type !== 'task') continue; const pid = item.data.parent_id; if (!pid) continue; if (posByTaskId[pid] !== undefined) t.ok(i > posByTaskId[pid], `Child ${item.data.id} appears after parent ${pid}`);
  }

  // 2) notes immediately follow owning task
  for (let i = 0; i < used.length; i++) {
    const item = used[i]; if (!item || item.type !== 'task') continue; const task = item.data; let j = i + 1; while (j < used.length && used[j].type === 'note') { const note = used[j].data; const matches = (note.series_id && ((task.series_id && note.series_id === task.series_id) || (task.id && note.series_id === task.id))); t.ok(matches, `note at ${j} belongs to task ${task.id}`); j++; }
  }

  // 3) CSV ordering best-effort
  const nameIdx = header.indexOf(contentHeader);
  if (nameIdx === -1) { t.pass('CONTENT header not found, skipping CSV ordering checks'); t.end(); return; }
  const csvIndexByContent = new Map();
  for (let i = 1; i < records.length; i++) {
    const cols = records[i] || [];
    const content = cols[nameIdx] ? String(cols[nameIdx]).replace(/^"|"$/g, '') : '';
    if (!csvIndexByContent.has(content)) csvIndexByContent.set(content, i - 1);
  }
  for (const tId in posByTaskId) {
    const idx = posByTaskId[tId]; const taskItem = used[idx]; const pid = taskItem.data.parent_id; if (!pid) continue; if (posByTaskId[pid] !== undefined) {
      const contentParent = used[posByTaskId[pid]].data.name || ''; const contentChild = taskItem.data.name || ''; const cpIdx = csvIndexByContent.get(contentParent); const ccIdx = csvIndexByContent.get(contentChild); if (cpIdx === undefined || ccIdx === undefined) continue; t.ok(ccIdx > cpIdx, `CSV child ${contentChild} after parent ${contentParent}`);
    }
  }

  t.end();
});
