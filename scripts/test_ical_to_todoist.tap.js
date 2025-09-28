const t = require('tap');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function writeJson(filePath, obj) { fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8'); }

t.test('iCal daily with time and monthly position', t => {
  const dataDir = path.join(__dirname, '..', 'data');
  const tmpDaily = path.join(dataDir, `tmp_ical_daily_${Date.now()}.json`);
  const tmpDailyCsv = path.join(dataDir, `tmp_ical_daily_${Date.now()}.csv`);
  const tmpMonth = path.join(dataDir, `tmp_ical_month_${Date.now()}.json`);
  const tmpMonthCsv = path.join(dataDir, `tmp_ical_month_${Date.now()}.csv`);
  t.teardown(() => { [tmpDaily, tmpDailyCsv, tmpMonth, tmpMonthCsv].forEach(f => { try { fs.unlinkSync(f); } catch (e) {} }); });

  const sampleCsv = path.join(__dirname, '..', 'data', 'Todoist_Template_CSV_2025.csv');

  const daily = { lists: [{ id: 'L', name: 'ICalList' }], tasks: [{ id: 'T1', list_id: 'L', title: 'Daily task', series_id: 'S1', rrule: 'FREQ=DAILY;INTERVAL=1', due_time: '13:00' }], notes: [] };
  writeJson(tmpDaily, daily);
  const res1 = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), '--input', tmpDaily, '--rowsPath', 'tasks', '--csv', sampleCsv, '--output', tmpDailyCsv], { encoding: 'utf8' });
  t.equal(res1.status, 0, 'transform exited ok for daily');
  const csv1 = fs.readFileSync(tmpDailyCsv, 'utf8');
  t.match(csv1, /every day at 13:00/, 'Expected repeating phrase with time');

  const monthly = { lists: [{ id: 'L', name: 'ICalList' }], tasks: [{ id: 'T2', list_id: 'L', title: 'Monthly task', series_id: 'S2', rrule: 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1', time: '09:30' }], notes: [] };
  writeJson(tmpMonth, monthly);
  const res2 = child_process.spawnSync('node', [path.join(__dirname, '..', 'transform.js'), '--input', tmpMonth, '--rowsPath', 'tasks', '--csv', sampleCsv, '--output', tmpMonthCsv], { encoding: 'utf8' });
  t.equal(res2.status, 0, 'transform exited ok for monthly');
  const csv2 = fs.readFileSync(tmpMonthCsv, 'utf8');
  t.match(csv2, /every first Monday of month at 09:30/, 'Expected monthly position phrase with time');

  t.end();
});
