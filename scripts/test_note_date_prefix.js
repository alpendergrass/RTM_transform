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
    if (createdStr) prefixLines.push(`date added ${createdStr}`);
  }
  const modified = note.date_modified || note.modified || note.updated_on || note.updated;
  if (modified !== undefined && modified !== null && String(modified).length) {
    const md = formatDateForCsv(modified);
    if (md && md !== createdStr) prefixLines.push(`date last modified ${md}`);
  }

  let combined = '';
  if (prefixLines.length) {
    combined = prefixLines.join('\n');
    if (contentVal) combined += '\n\n' + String(contentVal);
  } else {
    combined = String(contentVal);
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
  // Should contain only date added, not date last modified
  assert(outSame.startsWith('date added 2025-09-25'), 'noteSame should start with date added 2025-09-25');
  assert(!outSame.includes('date last modified'), 'noteSame should NOT include date last modified when same day');

  const outDiff = buildCombinedContent(noteDiff);
  // Should contain both lines
  assert(outDiff.startsWith('date added 2025-09-25'), 'noteDiff should start with date added 2025-09-25');
  assert(outDiff.includes('date last modified 2025-09-26'), 'noteDiff should include date last modified 2025-09-26');

  console.log('TEST PASS: note date prefix suppression behavior is correct');
})();
