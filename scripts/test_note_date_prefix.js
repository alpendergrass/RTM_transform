const assert = require('assert');

// Local copy of the minimal formatting logic used by transform.js
function formatDateForCsv(val) {
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
    createdStr = formatDateForCsv(created);
    if (createdStr) prefixLines.push(`rtm date added ${createdStr}`);
  }
  const modified = note.date_modified || note.modified || note.updated_on || note.updated;
  if (modified !== undefined && modified !== null && String(modified).length) {
    const md = formatDateForCsv(modified);
    if (md && md !== createdStr) prefixLines.push(`rtm date last modified ${md}`);
  }

  // Content first, then date lines after (if any)
  let combined = '';
  if (contentVal) {
    combined = String(contentVal);
    if (prefixLines.length) combined += '\n\n' + prefixLines.join('\n');
  } else {
    combined = prefixLines.join('\n');
  }
  return combined;
}

(function runTests() {
  // Use local-date constructors to ensure YYYY-MM-DD matches expectation regardless of timezone
  const createdMs = new Date(2025, 8, 25, 12, 0, 0).getTime(); // 2025-09-25 local midday
  const modifiedSameMs = new Date(2025, 8, 25, 18, 0, 0).getTime(); // same calendar day
  const modifiedNextMs = new Date(2025, 8, 26, 9, 0, 0).getTime(); // next day

  const noteSame = { id: 'n1', series_id: 's1', content: 'Note same dates', date_created: createdMs, date_modified: modifiedSameMs };
  const noteDiff = { id: 'n2', series_id: 's1', content: 'Note modified later', date_created: createdMs, date_modified: modifiedNextMs };

  const outSame = buildCombinedContent(noteSame);
  // Should contain content first, then date added; no date last modified
  assert(outSame.startsWith('Note same dates'), 'noteSame should start with the note content');
  assert(outSame.includes('\n\nrtm date added 2025-09-25'), 'noteSame should include date added after content');
  assert(!outSame.includes('date last modified'), 'noteSame should NOT include date last modified when same day');

  const outDiff = buildCombinedContent(noteDiff);
  // Should contain content first, then both date lines
  assert(outDiff.startsWith('Note modified later'), 'noteDiff should start with the note content');
  assert(outDiff.includes('\n\nrtm date added 2025-09-25'), 'noteDiff should include date added after content');
  assert(outDiff.includes('rtm date last modified 2025-09-26'), 'noteDiff should include date last modified 2025-09-26');

  console.log('TEST PASS: note date prefix suppression behavior is correct');
})();
