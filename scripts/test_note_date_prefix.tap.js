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

// Port of scripts/test_note_date_prefix.js into Tap style
t.test('note date prefix suppression and rtM labels', (t) => {
  // Create a local small RTM-like JSON with one task and two notes (one same-day modified, one next-day modified)
  const tmpJsonPath = path.join(__dirname, '..', 'data', 'rtm_note_prefix_test.json');
  const outputCsvPath = path.join(__dirname, '..', 'data', 'output_note_prefix_test.csv');
  const sampleCsv = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');

  // Build deterministic timestamps
  const createdMs = new Date(2025, 8, 25, 12, 0, 0).getTime();
  const modifiedSameMs = new Date(2025, 8, 25, 18, 0, 0).getTime();
  const modifiedNextMs = new Date(2025, 8, 26, 9, 0, 0).getTime();

  const testData = {
    lists: [{ id: 'L1', name: 'TestList' }],
    tasks: [ { id: 'T1', series_id: 'S1', title: 'Task for notes', content: 'Task content', list_id: 'L1' } ],
    notes: [
      { id: 'N1', series_id: 'S1', content: 'Note same dates', date_created: createdMs, date_modified: modifiedSameMs },
      { id: 'N2', series_id: 'S1', content: 'Note modified later', date_created: createdMs, date_modified: modifiedNextMs }
    ]
  };
  fs.writeFileSync(tmpJsonPath, JSON.stringify(testData, null, 2), 'utf8');

  const cmd = `node "${path.join(__dirname, '..', 'transform.js')}" --input "${tmpJsonPath}" --csv "${sampleCsv}" --rowsPath tasks --output "${outputCsvPath}" --output-json "${path.join(__dirname,'..','data','used_records_note_prefix_test.json')}"`;
  try {
    child_process.execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    t.fail(`transform.js failed: ${e && e.message}`);
    t.end();
    return;
  }

  // Instead of parsing CSV (which can include quoted newlines), read the used_records JSON
  const usedJsonPath = path.join(__dirname, '..', 'data', 'used_records_note_prefix_test.json');
  t.ok(fs.existsSync(usedJsonPath), 'expected used_records JSON to exist');
  const used = JSON.parse(fs.readFileSync(usedJsonPath, 'utf8'));

  // Helper to build combined note content (same logic used in transform.js)
  function formatDateForCsvLocal(val) {
    const n = Number(val);
    const d = !isNaN(n) ? new Date(n) : new Date(String(val));
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function buildCombinedContent(note) {
    let contentVal = note.content || note.title || '';
    const prefixLines = [];
    const created = note.date_created || note.created || note.created_on;
    let createdStr = '';
    if (created !== undefined && created !== null && String(created).length) {
      createdStr = formatDateForCsvLocal(created);
      if (createdStr) prefixLines.push(`rtm date added ${createdStr}`);
    }
    const modified = note.date_modified || note.modified || note.updated_on || note.updated;
    if (modified !== undefined && modified !== null && String(modified).length) {
      const md = formatDateForCsvLocal(modified);
      if (md && md !== createdStr) prefixLines.push(`rtm date last modified ${md}`);
    }
    let combined = '';
    if (contentVal) {
      combined = String(contentVal);
      if (prefixLines.length) combined += '\n\n' + prefixLines.join('\n');
    } else {
      combined = prefixLines.join('\n');
    }
    return combined;
  }

  // Find note entries in used records and validate combined content for our two test notes
  const notes = used.filter(r => r && r.type === 'note').map(r => r.data);
  t.ok(notes.length >= 2, `expected at least 2 notes in used records, got ${notes.length}`);
  const noteSame = notes.find(n => n.content && n.content.startsWith('Note same dates'));
  const noteDiff = notes.find(n => n.content && n.content.startsWith('Note modified later'));
  t.ok(noteSame, 'expected noteSame present');
  t.ok(noteDiff, 'expected noteDiff present');

  const outSame = buildCombinedContent(noteSame);
  t.match(outSame, /^Note same dates/, 'noteSame content should start with note content');
  t.match(outSame, /rtm date added 2025-09-25/, 'noteSame should include date added after content');
  t.notOk(outSame.includes('date last modified'), 'noteSame should NOT include date last modified when same day');

  const outDiff = buildCombinedContent(noteDiff);
  t.match(outDiff, /^Note modified later/, 'noteDiff should start with the note content');
  t.match(outDiff, /rtm date added 2025-09-25/, 'noteDiff should include date added after content');
  t.match(outDiff, /rtm date last modified 2025-09-26/, 'noteDiff should include date last modified 2025-09-26');

  // cleanup
  try { fs.unlinkSync(tmpJsonPath); } catch (e) {}
  try { fs.unlinkSync(outputCsvPath); } catch (e) {}
  try { fs.unlinkSync(path.join(__dirname,'..','data','used_records_note_prefix_test.json')); } catch (e) {}

  t.end();
});
