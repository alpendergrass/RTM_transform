const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function runTransform(args = []) {
  const transformPath = path.join(__dirname, '..', 'transform.js');
  const res = child_process.spawnSync('node', [transformPath, ...args], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`transform failed: ${res.stderr || res.stdout}`);
  return res.stdout;
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

(function testIcalDailyWithTime() {
  const tmp = path.join('data', 'tmp_ical_daily.json');
  const sample = {
    lists: [{ id: 'L', name: 'ICalList' }],
    tasks: [
      {
        id: 'T1', list_id: 'L', title: 'Daily task', series_id: 'S1',
        rrule: 'FREQ=DAILY;INTERVAL=1',
        due_time: '13:00'
      }
    ],
    notes: []
  };
  writeJson(tmp, sample);
  runTransform(['--input', tmp, '--rowsPath', 'tasks', '--csv', 'data/Todoist_Template_CSV_2025.csv', '--output', 'data/tmp_ical_daily.csv']);
  const csv = fs.readFileSync('data/tmp_ical_daily.csv', 'utf8');
  assert(csv.includes('every day at 13:00'), 'Expected repeating phrase with time');
  fs.unlinkSync(tmp); fs.unlinkSync('data/tmp_ical_daily.csv');
  console.log('testIcalDailyWithTime passed');
})();

(function testIcalMonthlyPosition() {
  const tmp = path.join('data', 'tmp_ical_month.json');
  const sample = {
    lists: [{ id: 'L', name: 'ICalList' }],
    tasks: [
      {
        id: 'T2', list_id: 'L', title: 'Monthly task', series_id: 'S2',
        rrule: 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
        time: '09:30'
      }
    ],
    notes: []
  };
  writeJson(tmp, sample);
  runTransform(['--input', tmp, '--rowsPath', 'tasks', '--csv', 'data/Todoist_Template_CSV_2025.csv', '--output', 'data/tmp_ical_month.csv']);
  const csv = fs.readFileSync('data/tmp_ical_month.csv', 'utf8');
  assert(csv.includes('every first Monday of month at 09:30'), 'Expected monthly position phrase with time');
  fs.unlinkSync(tmp); fs.unlinkSync('data/tmp_ical_month.csv');
  console.log('testIcalMonthlyPosition passed');
})();

console.log('All iCal->Todoist tests passed');
