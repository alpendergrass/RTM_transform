const fs = require('fs');
const path = require('path');

// CLI parsing (simple, zero-deps)
const argv = process.argv.slice(2);
function printHelp() {
  console.log('Usage: node transform.js [--input input.json] [--csv sample.csv] [--map mapping.json] [--rowsPath path] [--rowsFilter expr] [--output out.csv] [--output-json out.json]');
  console.log('Defaults: input=./data/rememberthemilk_export_2025-09-21T16_50_41.384Z.json, csv=./data/Todoist_Template_CSV_2025.csv, output=./data/output.csv, output-json=./data/output.json');
}

if (argv.includes('-h') || argv.includes('--help')) {
  printHelp();
  process.exit(0);
}

// Defaults
let jsonFilePath = './data/rememberthemilk_export_2025-09-21T16_50_41.384Z.json';
let csvSampleFilePath = './data/Todoist_Template_CSV_2025.csv';
let outputCsvFilePath = './data/output.csv';

let mapFilePath = null;
let rowsPath = null;
let rowsFilterExpr = null;
let outputJsonFilePath = './data/used_records.json';
let csvProvided = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
    if (a === '--input' && argv[i+1]) { jsonFilePath = argv[++i]; }
    else if (a === '--csv' && argv[i+1]) { csvSampleFilePath = argv[++i]; }
    else if (a === '--output' && argv[i+1]) { csvProvided = true; outputCsvFilePath = argv[++i]; }
    else if (a === '--map' && argv[i+1]) { mapFilePath = argv[++i]; }
  else if (a === '--rowsPath' && argv[i+1]) { rowsPath = argv[++i]; }
  else if (a === '--rowsFilter' && argv[i+1]) { rowsFilterExpr = argv[++i]; }
  else if (a === '--output-json' && argv[i+1]) { outputJsonFilePath = argv[++i]; }
  else if (!a.startsWith('--') && i === 0) {
    // allow a single positional input file
    jsonFilePath = a;
  }
}

// If the chosen jsonFilePath doesn't exist or is the default placeholder that may not exist,
// try to pick the newest file in ./data starting with 'rememberthemilk_export'
if (!fs.existsSync(jsonFilePath)) {
  const dataDir = path.resolve(__dirname, 'data');
  try {
    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('rememberthemilk_export'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dataDir, f)).mtime.getTime() }));
    if (files.length > 0) {
      files.sort((a, b) => b.mtime - a.mtime);
      jsonFilePath = path.join('data', files[0].name);
      console.log(`No input provided — using newest export ${jsonFilePath}`);
    }
  } catch (e) {
    // ignore and continue; later read will error
  }
}

// Load mapping file if provided. Mapping file maps CSV header -> JSON path (dot-path)
let mapping = null;
if (mapFilePath) {
  try {
    const raw = fs.readFileSync(mapFilePath, 'utf8');
    mapping = JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to read mapping file ${mapFilePath}:`, e.message);
    process.exit(2);
  }
}

// Read JSON data
const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));

// Determine rows: either top-level array, or nested array via rowsPath
let rows = Array.isArray(jsonData) ? jsonData : [jsonData];
if (rowsPath) {
  const nested = getNested(jsonData, rowsPath);
  if (Array.isArray(nested)) rows = nested;
  else {
    console.error(`rowsPath '${rowsPath}' did not resolve to an array`);
    process.exit(2);
  }
}

// Apply optional rows filter expression
if (rowsFilterExpr) {
  let filterFn;
  try {
    // Create a function that receives (row, data, getNested, listName)
    filterFn = new Function('row', 'data', 'getNested', 'listName', `return (${rowsFilterExpr});`);
  } catch (e) {
    console.error('Invalid rowsFilter expression:', e.message);
    process.exit(2);
  }

  // If the JSON has lists and rows belong to lists, expose a helper to get the list name.
  // Here we assume rows may have `list_id` linking to top-level `lists` array by `id`.
  const listsById = {};
  if (jsonData && jsonData.lists && Array.isArray(jsonData.lists)) {
    for (const l of jsonData.lists) {
      if (l && l.id) listsById[l.id] = l;
    }
  }

  rows = rows.filter(row => {
    try {
      const listObj = listsById[row.list_id];
      const listName = listObj && listObj.name;
      return Boolean(filterFn(row, jsonData, getNested, listName));
    } catch (e) {
      console.error('rowsFilter evaluation error:', e && e.message ? e.message : e);
      process.exit(2);
    }
  });
}

// Exclude completed tasks (if a row has date_completed defined/non-null)
rows = rows.filter(r => {
  // If the row has date_completed as a number (timestamp) or non-null, treat it as completed
  const dc = getNested(r, 'date_completed');
  return dc === undefined || dc === null;
});

// Exclude trashed tasks and any of their descendant child tasks.
// Some exports include a `date_trashed` timestamp on trashed tasks. When present,
// ignore that task and any children that reference it (directly or indirectly).
try {
  const trashedIds = new Set();
  for (const r of rows) {
    if (!r) continue;
    const dt = getNested(r, 'date_trashed');
    if (dt !== undefined && dt !== null && String(dt).length) {
      if (r.id) trashedIds.add(r.id);
    }
  }

  if (trashedIds.size > 0) {
    // Recursively find descendants whose parent_id chains lead to a trashed id
    let added = true;
    while (added) {
      added = false;
      for (const r of rows) {
        if (!r || !r.id) continue;
        if (trashedIds.has(r.id)) continue;
        const pid = r.parent_id;
        if (pid && trashedIds.has(pid)) {
          trashedIds.add(r.id);
          added = true;
        }
      }
    }

    if (trashedIds.size > 0) {
      rows = rows.filter(r => !(r && r.id && trashedIds.has(r.id)));
    }
  }
} catch (e) {
  // Non-fatal; if anything goes wrong, continue without trashed filtering
}

// Build a map of lists by id (useful for naming outputs and filters)
const listsById = {};
if (jsonData && Array.isArray(jsonData.lists)) {
  for (const l of jsonData.lists) {
    if (l && l.id) listsById[l.id] = l;
  }
}

// If all selected rows belong to a single list, incorporate that list name into output filenames
try {
  const listNames = new Set();
  for (const r of rows) {
    if (!r) continue;
    const l = listsById[r.list_id];
    if (l && l.name) listNames.add(String(l.name));
  }
  if (listNames.size === 1) {
    const rawName = Array.from(listNames)[0];
    // sanitize: lowercase, replace spaces with underscore, remove non-alphanum/_- chars
    const safe = rawName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-]/g, '');
    // Only modify output paths when they are the defaults (avoid overriding explicit flags)
    if (outputCsvFilePath === './data/output.csv' || outputCsvFilePath.endsWith('/output.csv')) {
      const dir = path.dirname(outputCsvFilePath);
      const base = path.basename(outputCsvFilePath, '.csv');
      outputCsvFilePath = path.join(dir, `${base}_${safe}.csv`);
    }
    if (outputJsonFilePath === './data/used_records.json' || outputJsonFilePath.endsWith('/used_records.json')) {
      const dir = path.dirname(outputJsonFilePath);
      const base = path.basename(outputJsonFilePath, '.json');
      outputJsonFilePath = path.join(dir, `${base}_${safe}.json`);
    }
  }
} catch (e) {
  // non-fatal, continue with defaults
}
// Read sample CSV to get headers
const sampleCsv = fs.readFileSync(csvSampleFilePath, 'utf8');
const [headerLine] = sampleCsv.split('\n');
const headers = headerLine.split(',');

// Helper: resolve nested path like 'config.username'
function getNested(obj, path) {
  if (!path) return undefined;
  // support either dot-path or top-level key
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
}

// Helper: format a value for CSV cell (strings are escaped, arrays joined)
function formatCell(val, options = {}) {
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) {
    // join arrays with semicolon to avoid colliding with CSV commas
    val = val.map(v => (v === null || v === undefined) ? '' : String(v)).join(';');
  } else if (typeof val === 'object') {
    // stringify objects compactly
    val = JSON.stringify(val);
  } else {
    val = String(val);
  }
  // Optionally escape newline characters (convert actual newlines to literal \n)
  //if (options.escapeNewlines) {
  //  val = val.replace(/\r\n|\r|\n/g, "\\n");
  //}

  // Escape backslashes to avoid accidental escaping in CSV consumers
  val = val.replace(/\\/g, "\\\\");
  // Escape single quotes by preceding with backslash to avoid issues if consumers expect SQL-like quoting
  val = val.replace(/'/g, "\\'");

  // Escape quotes by doubling and wrap in quotes if necessary
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    val = `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatDateForCsv(val) {
  // Accept numbers (ms or s) or ISO strings — return local YYYY-MM-DD
  const n = Number(val);
  const d = !isNaN(n) ? new Date(n) : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTimeFromEpoch(val) {
  const n = Number(val);
  const d = !isNaN(n) ? new Date(n) : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Helper: convert various date representations into YYYY-MM-DD (calendar date)
function formatDateForCsv(val) {
  // Accept numbers (ms or s) or ISO strings — return local YYYY-MM-DD
  const n = Number(val);
  const d = !isNaN(n) ? new Date(n) : new Date(String(val));
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Helper: convert UTC date to Todoist date string (YYYY-MM-DD)
function utcToTodoist(utcDate) {
  const d = new Date(utcDate);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDaySuffix(n) {
  const i = parseInt(n, 10);
  if (isNaN(i)) return 'th';
  if (i % 10 === 1 && i % 100 !== 11) return 'st';
  if (i % 10 === 2 && i % 100 !== 12) return 'nd';
  if (i % 10 === 3 && i % 100 !== 13) return 'rd';
  return 'th';
}

// Helper function to convert iCal rule to Todoist repeating format
function iCalToTodoist(icalRule, timeOfDay) {
  if (!icalRule || typeof icalRule !== 'string') return '';
  // strip any leading RRULE: prefix
  let rule = icalRule.trim();
  if (rule.startsWith('RRULE:')) rule = rule.slice('RRULE:'.length);
  if (!rule.startsWith('FREQ=')) return '';

  const parts = Object.fromEntries(
    rule.split(';').map((part) => {
      const splitPart = part.split('=');
      return splitPart.length === 2 ? splitPart : [splitPart[0], ''];
    })
  );

  const freq = parts['FREQ'];
  const interval = parts['INTERVAL'] || '1';
  const byDay = parts['BYDAY'] ? parts['BYDAY'].split(',') : [];
  const byMonthDay = parts['BYMONTHDAY'];
  const byMonth = parts['BYMONTH'];
  const bySetPos = parts['BYSETPOS'];
  const until = parts['UNTIL'];

  const dayMap = {
    SU: 'Sunday',
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
  };

  // Handle position-based patterns (first, second, last, etc.)
  let position = '';
  if (bySetPos) {
    if (bySetPos === '-1') position = 'last ';
    else if (bySetPos === '1') position = 'first ';
    else if (bySetPos === '2') position = 'second ';
    else if (bySetPos === '3') position = 'third ';
    else if (bySetPos === '4') position = 'fourth ';
  }

  switch (freq) {
    case 'DAILY':
      return interval === '1' ? 'every day' : `every ${interval} days`;

    case 'WEEKLY':
      if (byDay.length) {
        return `every ${byDay.map((day) => dayMap[day]).join(', ')}`;
      }
      return interval === '1' ? 'every week' : `every ${interval} weeks`;

    case 'MONTHLY':
      if (byMonthDay === '-1') return 'every last day of month';
      if (byMonthDay) return `every ${byMonthDay}${getDaySuffix(byMonthDay)}`;

      if (byDay.length === 1 && bySetPos) {
        return `every ${position}${dayMap[byDay[0]]} of month`;
      }
      if (byDay.length === 1) {
        return `every ${position || 'first '}${dayMap[byDay[0]]} of month`;
      }
      return 'every month';

    case 'YEARLY':
      if (byMonth && byMonthDay) {
        const monthNames = [
          '',
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ];
        const day = `${byMonthDay}${getDaySuffix(byMonthDay)}`;
        return `every ${monthNames[parseInt(byMonth)]} ${day}`;
      }
      return 'every year';

    default:
      return '';
  }
}
// Wrap iCalToTodoist to optionally append time
function iCalToTodoist(icalRule, timeOfDay) {
  // existing function body was earlier; to avoid duplicating, we create a small wrapper
  // The long implementation above still returns base phrase when called without time
  // We'll call the original logic by reusing the implementation (since we edited it in-place earlier),
  // but ensure this wrapper appends the time when present.
  // NOTE: because of the file layout, the main implementation already returns base phrase.
  // So just compute phrase by calling the function name (itself) would be recursive. Instead,
  // we will duplicate a simple approach: call the internal converter via the same name
  // (the previous implementation exists in the file before this wrapper) — to avoid recursion
  // we will rename the earlier implementation to iCalToTodoistBase if needed. However, to keep
  // patch minimal, we'll implement a small parsing here using the same logic: parse FREQ and append time.
  // For simplicity, call the lightweight parser above by re-parsing the rule (duplicate logic).
  if (!icalRule || typeof icalRule !== 'string') return '';
  let rule = icalRule.trim();
  if (rule.startsWith('RRULE:')) rule = rule.slice('RRULE:'.length);
  if (!rule.startsWith('FREQ=')) return '';

  const base = (function simpleParse(ruleStr) {
    const parts = Object.fromEntries(
      ruleStr.split(';').map((part) => {
        const splitPart = part.split('=');
        return splitPart.length === 2 ? splitPart : [splitPart[0], ''];
      })
    );
    const freq = parts['FREQ'];
    const interval = parts['INTERVAL'] || '1';
    const byDay = parts['BYDAY'] ? parts['BYDAY'].split(',') : [];
    const byMonthDay = parts['BYMONTHDAY'];
    const byMonth = parts['BYMONTH'];
    const bySetPos = parts['BYSETPOS'];
    const dayMap = { SU: 'Sunday', MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday' };
    let position = '';
    if (bySetPos) {
      if (bySetPos === '-1') position = 'last ';
      else if (bySetPos === '1') position = 'first ';
      else if (bySetPos === '2') position = 'second ';
      else if (bySetPos === '3') position = 'third ';
      else if (bySetPos === '4') position = 'fourth ';
    }
    switch (freq) {
      case 'DAILY': return interval === '1' ? 'every day' : `every ${interval} days`;
      case 'WEEKLY': if (byDay.length) return `every ${byDay.map((day) => dayMap[day]).join(', ')}`; return interval === '1' ? 'every week' : `every ${interval} weeks`;
      case 'MONTHLY': if (byMonthDay === '-1') return 'every last day of month'; if (byMonthDay) return `every ${byMonthDay}${getDaySuffix(byMonthDay)}`; if (byDay.length === 1 && bySetPos) return `every ${position}${dayMap[byDay[0]]} of month`; if (byDay.length === 1) return `every ${position || 'first '}${dayMap[byDay[0]]} of month`; return 'every month';
      case 'YEARLY': if (byMonth && byMonthDay) { const monthNames = ['', 'January','February','March','April','May','June','July','August','September','October','November','December']; const day = `${byMonthDay}${getDaySuffix(byMonthDay)}`; return `every ${monthNames[parseInt(byMonth)]} ${day}`; } return 'every year';
      default: return '';
    }
  })(rule);

  if (timeOfDay && String(timeOfDay).trim()) {
    return `${base} at ${String(timeOfDay).trim()}`;
  }
  return base;
}

// Transform JSON to CSV rows (supports nested header paths like 'config.username')

// Helper to resolve a header's value for a given object (task or note)
function resolveValue(header, currentObj) {
  const mapPath = (mapping && mapping[header]) ? mapping[header] : header;

  // Prefer resolving against the current object
  let val = getNested(currentObj, mapPath);

  // If undefined, try resolving from root jsonData (useful for mappings like config.username)
  if (val === undefined) {
    val = getNested(jsonData, mapPath);
  }

  // Special-case: for notes, if CONTENT header and nothing found, prefer note.content or note.title
  if ((currentObj && (currentObj.content !== undefined || currentObj.title !== undefined)) && (header === 'CONTENT' || header.toUpperCase() === 'CONTENT') && (val === undefined || val === '')) {
    val = currentObj.content || currentObj.title || '';
  }

  // Special-case: support a `.length` pseudo-path (e.g., 'notes.length')
  if (mapPath.endsWith('.length') && val === undefined) {
    const basePath = mapPath.slice(0, -'.length'.length);
    const arr = getNested(currentObj, basePath) || getNested(jsonData, basePath);
    if (Array.isArray(arr)) val = arr.length;
  }

  return val;
}

// Map RTM priority strings (e.g. 'P1') to numeric Todoist priorities (1-4)
function mapPriority(header, val) {
  if ((header === 'PRIORITY' || header.toUpperCase() === 'PRIORITY') && typeof val === 'string') {
    switch (val) {
      case 'P1': return 1;
      case 'P2': return 2;
      case 'P3': return 3;
      default: return 4;
    }
  }
  return val;
}

// Build output rows: emit tasks and their notes. Ensure children (rows with parent_id)
// are emitted after their parent task and that notes for each task are emitted
// immediately after that task. We preserve original order for tasks that are
// not parent/child or whose parent is not present in the filtered rows.
const csvRowsOut = [];
const notesArray = (jsonData && Array.isArray(jsonData.notes)) ? jsonData.notes : [];
// Build an index of notes by series_id for fast lookup (and preserve original order)
const notesBySeriesId = {};
for (const n of notesArray) {
  if (!n) continue;
  const sid = n.series_id || n.id || '__none__';
  if (!notesBySeriesId[sid]) notesBySeriesId[sid] = [];
  notesBySeriesId[sid].push(n);
}
const usedRecords = [];

// Build maps for fast lookup and to record original order
const tasksById = {};
const childrenMap = {}; // parentId -> [childTask, ...] (preserve appearance order)
for (const t of rows) {
  if (t && t.id) {
    tasksById[t.id] = t;
  }
}
// Remove orphaned child tasks whose parent was removed by earlier filters
// (rowsFilter, completed-filter, or trashed-filter). We do this iteratively
// so chains of orphans are removed until no remaining child references a
// non-existent parent.
try {
  let removedAny = true;
  while (removedAny) {
    removedAny = false;
    const idSet = new Set(Object.keys(tasksById).map(k => String(k)));
    const orphanIds = new Set();
    for (const r of rows) {
      if (!r || !r.id) continue;
      if (r.parent_id && !idSet.has(String(r.parent_id))) {
        orphanIds.add(r.id);
      }
    }
    if (orphanIds.size > 0) {
      removedAny = true;
      rows = rows.filter(r => !(r && r.id && orphanIds.has(r.id)));
      // rebuild tasksById to reflect removals
      for (const k of Object.keys(tasksById)) delete tasksById[k];
      for (const t of rows) {
        if (t && t.id) tasksById[t.id] = t;
      }
    }
  }
} catch (e) {
  // non-fatal — if something goes wrong, continue with original rows/tasksById
}
// Populate children map for rows that reference a parent present in the filtered rows
for (const t of rows) {
  if (t && t.parent_id) {
    const pid = t.parent_id;
    if (pid && tasksById[pid]) {
      if (!childrenMap[pid]) childrenMap[pid] = [];
      childrenMap[pid].push(t);
    }
  }
}

const emittedTasks = new Set();
function emitTask(task, depth = 1) {
  if (!task || !task.id) return;
  if (emittedTasks.has(task.id)) return;
  // Emit the task row
  const taskLine = headers.map(h => {
    if (h === 'TYPE') return formatCell('task');
    // Override certain headers for task rows
    if (h === 'INDENT') return formatCell(depth);
    if (h === 'DATE_LANG') return formatCell('en');
  if (h === 'TIMEZONE') return '';
    // Ensure these deadline/duration columns are empty for all task rows
    if (h === 'DURATION' || h === 'DURATION_UNIT' || h === 'DEADLINE' || h === 'DEADLINE_LANG') {
      return '';
    }
    // Special-case: for task rows, append RTM tags to the CONTENT field
    if (h === 'CONTENT') {
      let contentVal = resolveValue(h, task);
      try {
        if (task && Array.isArray(task.tags) && task.tags.length > 0) {
          const labels = task.tags.map(tag => `@${tag}`);
          const sep = contentVal ? ' ' : '';
          contentVal = String(contentVal || '') + sep + labels.join(' ');
        }
      } catch (e) {
        // ignore tagging errors and fall back to original content
      }
      return formatCell(contentVal);
    }
    let val = resolveValue(h, task);
    // Convert date_due (or mapped date field) into calendar date for the DATE column
    if (h === 'DATE') {
      // If mapping didn't provide a value, try common RTM date fields and recurrence rules
      if (val === undefined || val === null || val === '') {
        const fallbacks = ['date_due', 'due_on', 'due_date', 'due', 'date'];
        for (const fb of fallbacks) {
          const fbv = getNested(task, fb);
          if (fbv !== undefined && fbv !== null && fbv !== '') {
            val = fbv;
            break;
          }
          const nested = fb === 'due' ? getNested(task, 'due.date') : undefined;
          if ((nested !== undefined) && (nested !== null) && nested !== '') {
            val = nested;
            break;
          }
        }
      }

      // Detect iCal/RRULE-style recurrence data on the task (common RTM fields)
      const recurFields = ['repeat', 'rrule', 'recurrence', 'recurrence_rule', 'repeat_rule', 'repeat_rules', 'recur'];
      let recur = null;
      for (const rf of recurFields) {
        const v = getNested(task, rf);
        if (v) {
          recur = v;
          break;
        }
      }
      // Some exports may nest RRULE inside an object
      if (!recur && task && task.repeat && typeof task.repeat === 'object') {
        if (task.repeat.rrule) recur = task.repeat.rrule;
        else if (task.repeat.rule) recur = task.repeat.rule;
      }

      if (recur && typeof recur === 'string' && recur.trim()) {
        // Prefer explicit time from date_due when date_due_has_time is true
        let timeOfDay = null;
        try {
          const hasTimeFlag = (task && (task.date_due_has_time === true || task.date_due_has_time === 'true'));
          if (hasTimeFlag && task && task.date_due) {
            const dnum = Number(task.date_due);
            if (!isNaN(dnum)) {
              const dt = new Date(dnum);
              const hh = String(dt.getHours()).padStart(2, '0');
              const mm = String(dt.getMinutes()).padStart(2, '0');
              timeOfDay = `${hh}:${mm}`;
            }
          }
        } catch (e) {
          // ignore
        }
        // If no explicit date_due time, try other common fields
        if (!timeOfDay) {
          const timeFields = ['due_time', 'time', 'start_time', 'dtstart', 'dtstart_time'];
          for (const tf of timeFields) {
            const tv = getNested(task, tf) || getNested(task, tf.toUpperCase());
            if (tv) { timeOfDay = String(tv); break; }
          }
        }
        // Also attempt to extract DTSTART=YYYYMMDDTHHMMSSZ from the RRULE/recurrence string
        if (!timeOfDay) {
          const dtMatch = recur.match(/DTSTART[:=](\d{8}T\d{6})Z?/i);
          if (dtMatch) {
            const dt = dtMatch[1];
            const hh = dt.slice(9,11);
            const mm = dt.slice(11,13);
            if (hh && mm) timeOfDay = `${hh}:${mm}`;
          }
        }

        // Convert iCal rule to Todoist repeating string, including time if found
        const todoistRepeat = iCalToTodoist(recur, timeOfDay);
        // Attempt to detect a start date to append " starting YYYY-MM-DD" (and time)
        let startDateVal = undefined;
        const startFields = ['date_start', 'start_date', 'dtstart', 'date_scheduled', 'start'];
        for (const sf of startFields) {
          const sv = getNested(task, sf) || getNested(task, sf.toUpperCase());
          if (sv !== undefined && sv !== null && String(sv).length) {
            startDateVal = sv;
            break;
          }
        }

        // NEW: if no explicit start field, try to extract DTSTART from the recurrence string (YYYYMMDDTHHMMSS)
        if (!startDateVal && typeof recur === 'string') {
          const dtstartMatch = recur.match(/DTSTART[:=]?(\d{8}T\d{6}(Z?)?)/i);
          if (dtstartMatch) {
            const dtRaw = dtstartMatch[1]; // e.g. 20251009T034000 or 20251009T034000Z
            // build an ISO string: YYYYMMDDTHHMMSS -> YYYY-MM-DDTHH:MM:SSZ (assume UTC if Z present)
            const datePart = dtRaw.slice(0,8);
            const timePart = dtRaw.slice(9,15);
            const iso = `${datePart.slice(0,4)}-${datePart.slice(4,6)}-${datePart.slice(6,8)}T${timePart.slice(0,2)}:${timePart.slice(2,4)}:${timePart.slice(4,6)}${dtRaw.endsWith('Z') ? 'Z' : ''}`;
            const parsed = new Date(iso);
            if (!isNaN(parsed.getTime())) startDateVal = parsed.getTime();
          }
        }

        // Fallback: if no explicit start, prefer date_due when present
        if (!startDateVal && (task && (task.date_due !== undefined && task.date_due !== null))) {
          startDateVal = task.date_due;
        }

        // Determine whether the start value includes a time
        const startHasTime = !!( (task && (task.date_start_has_time === true || task.date_start_has_time === 'true')) ||
                                 (startDateVal === task.date_due && (task && (task.date_due_has_time === true || task.date_due_has_time === 'true'))) );

        if (todoistRepeat) {
          let phrase = todoistRepeat;
          if (startDateVal) {
            const startDateStr = formatDateForCsv(startDateVal);
            if (startDateStr) {
              let suffix = ` starting ${startDateStr}`;
              if (startHasTime) {
                const timeStr = formatTimeFromEpoch(startDateVal);
                if (timeStr) suffix += ` at ${timeStr}`;
              }
              phrase = `${phrase}${suffix}`;
            }
          }
          val = phrase;
        } else {
          // If unable to convert, leave as-is (or try formatting as local date)
          val = formatDateForCsv(val) || utcToTodoist(val) || '';
        }
      } else {
        val = formatDateForCsv(val);
        // If the task's date_due includes a time, append it to the DATE string
        try {
          const hasTimeFlag = (task && (task.date_due_has_time === true || task.date_due_has_time === 'true'));
          if (hasTimeFlag && task && task.date_due) {
            const dnum = Number(task.date_due);
            if (!isNaN(dnum)) {
              const dt = new Date(dnum);
              const hh = String(dt.getHours()).padStart(2, '0');
              const mm = String(dt.getMinutes()).padStart(2, '0');
              const t = `${hh}:${mm}`;
              if (val) val = `${val} at ${t}`;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return formatCell(mapPriority(h, val));
  }).join(',');
  csvRowsOut.push(taskLine);
  usedRecords.push({ type: 'task', data: JSON.parse(JSON.stringify(task)) });

  // Emit notes belonging to this task immediately after the task (use index)
  const noteList = notesBySeriesId[task.series_id] || notesBySeriesId[task.id] || [];
  for (const note of noteList) {
    const noteLine = headers.map(h => {
      if (h === 'TYPE') return formatCell('note');
      if (h === 'CONTENT') {
        // Base note content (note.content or note.title)
        let contentVal = resolveValue(h, note) || '';

        // Build prefix lines for date_created and date_modified when present
        const prefixLines = [];
        try {
          const created = getNested(note, 'date_created') || getNested(note, 'created') || getNested(note, 'created_on');
          let createdStr = '';
          if (created !== undefined && created !== null && String(created).length) {
            createdStr = formatDateForCsv(created);
            if (createdStr) prefixLines.push(`date added ${createdStr}`);
          }
          const modified = getNested(note, 'date_modified') || getNested(note, 'modified') || getNested(note, 'updated_on') || getNested(note, 'updated');
          if (modified !== undefined && modified !== null && String(modified).length) {
            const md = formatDateForCsv(modified);
            // Only include modified when it differs from created (compare YYYY-MM-DD strings)
            if (md && md !== createdStr) prefixLines.push(`date last modified ${md}`);
          }
        } catch (e) {
          // non-fatal; fall back to original content if any getter fails
        }

        // Place note content first, then date lines after it. If no content, just show the date lines.
        let combined = '';
        if (contentVal) {
          combined = String(contentVal);
          if (prefixLines.length) combined += '\n\n' + prefixLines.join('\n');
        } else {
          combined = prefixLines.join('\n');
        }

        return formatCell(combined, { escapeNewlines: true });
      }
      // For notes, all other fields should be empty
      return '';
    }).join(',');

    csvRowsOut.push(noteLine);
    usedRecords.push({ type: 'note', data: JSON.parse(JSON.stringify(note)) });
  }

  emittedTasks.add(task.id);

  // After emitting this task and its notes, emit any children (recursively)
  const kids = childrenMap[task.id] || [];
  for (const c of kids) {
    emitTask(c, depth + 1);
  }
}

// Iterate original rows in order. If a row is a child whose parent exists in the
// filtered rows and that parent hasn't been emitted yet, defer it until the
// parent is emitted. Otherwise emit it now.
for (const obj of rows) {
  if (!obj || !obj.id) continue;
  const pid = obj.parent_id;
  if (pid && tasksById[pid] && !emittedTasks.has(pid)) {
    // Parent exists but hasn't been emitted yet; skip for now — it will be emitted
    // when the parent row is encountered later in `rows` (or if parent is earlier,
    // it would have already emitted children).
    continue;
  }

  // Emit this task (this will also recurse and emit any children)
  // Determine starting depth: root level is 1. If the row has a parent but the parent is not present
  // in tasksById (filtered out), treat it as root (depth=1). If it has no parent, depth=1.
  let startDepth = 1;
  emitTask(obj, startDepth);
}

// Write output CSV (header + rows)
fs.writeFileSync(outputCsvFilePath, [headerLine, ...csvRowsOut].join('\n'), 'utf8');

console.log(`CSV file written to ${outputCsvFilePath}`);
// Write output JSON of used records if requested
try {
  fs.writeFileSync(outputJsonFilePath, JSON.stringify(usedRecords, null, 2), 'utf8');
  console.log(`JSON file written to ${outputJsonFilePath}`);
} catch (e) {
  console.error(`Failed to write JSON file ${outputJsonFilePath}:`, e && e.message ? e.message : e);
}