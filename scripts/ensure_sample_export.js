const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function findExports() {
  return fs.readdirSync(dataDir).filter(f => f.startsWith('rememberthemilk_export'));
}

const foundExports = findExports();
if (foundExports.length > 0) {
  console.log('Found existing export:', foundExports[0]);
  process.exit(0);
}

// Create a minimal synthetic RTM export that the scripts can use in CI
const sample = {
  lists: [{ id: 'L_sample', name: 'CI Sample' }],
  tasks: [
    { id: 'T_sample', series_id: 'S_sample', list_id: 'L_sample', name: 'CI sample task', date_due: null }
  ],
  notes: []
};

const outName = `rememberthemilk_export_sample_${Date.now()}.json`;
const outPath = path.join(dataDir, outName);
fs.writeFileSync(outPath, JSON.stringify(sample, null, 2), 'utf8');
console.log('Wrote sample export for CI:', outPath);
process.exit(0);
