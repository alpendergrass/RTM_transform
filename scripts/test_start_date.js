const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const syntheticPath = path.join(dataDir, 'rtm_synthetic_start.json');
const outCsv = path.join(dataDir, 'output_synthetic_start.csv');
const outJson = path.join(dataDir, 'used_records_synthetic_start.json');

// epoch ms for 2025-10-09T03:40:00 local example (adjust if needed for your timezone)
const epochMs = 1760006400000;

const synthetic = {
  lists: [{ id: 'L1', name: 'Coffee' }],
  tasks: [
    {
      id: 'synthetic-1',
      series_id: 'synth-series-1',
      list_id: 'L1',
      name: 'Synthetic repeat task',
      priority: 'P2',
      // start date (use epoch ms so transform's time formatting works)
      date_start: epochMs,
      date_start_has_time: true,
      // recurrence (first Monday of month)
      repeat: 'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
      // include date_due too (optional)
      date_due: epochMs,
      date_due_has_time: true,
      tags: ['synthetic','test']
    }
  ]
};

fs.writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2), 'utf8');
console.log('Wrote synthetic input to', syntheticPath);

// Run transform.js against the synthetic file
const args = [
  path.resolve(__dirname, '..', 'transform.js'),
  syntheticPath,
  '--map', path.join('data', 'mapping.sample.json'),
  '--rowsPath', 'tasks',
  '--output', outCsv,
  '--output-json', outJson
];

console.log('Running:', 'node', args.join(' '));
const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (res.error) {
  console.error('Failed to run transform.js:', res.error);
  process.exit(2);
}

// Check output CSV for recurrence + start date
if (!fs.existsSync(outCsv)) {
  console.error('Expected output CSV not found:', outCsv);
  process.exit(2);
}

const csv = fs.readFileSync(outCsv, 'utf8');
const expectedDateSuffix = 'starting 2025-10-09';
if (csv.includes(expectedDateSuffix) && csv.includes('every')) {
  console.log('TEST PASS: recurrence phrase includes start date ->', expectedDateSuffix);
  process.exit(0);
} else {
  console.error('TEST FAIL: expected recurrence phrase with start date not found');
  console.error('CSV preview:\n', csv.split('\n').slice(0,10).join('\n'));
  process.exit(3);
}