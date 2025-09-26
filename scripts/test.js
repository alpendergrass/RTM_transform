const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd) {
  console.log(`RUN: ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

try {
  // ensure data dir exists
  const dataDir = path.resolve(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) throw new Error('data directory missing');

  // Run extract_schema.js (writes data/schema.json)
  run('node extract_schema.js');

  // Run transform.js (writes data/output.csv)
  run('node transform.js');

  const schemaPath = path.join(dataDir, 'schema.json');
  const csvPath = path.join(dataDir, 'output.csv');

  if (!fs.existsSync(schemaPath)) throw new Error('schema.json not created');
  if (!fs.existsSync(csvPath)) throw new Error('output.csv not created');

  const sStat = fs.statSync(schemaPath);
  const cStat = fs.statSync(csvPath);
  if (sStat.size === 0) throw new Error('schema.json is empty');
  if (cStat.size === 0) throw new Error('output.csv is empty');

  console.log('\nTEST PASS: outputs created and non-empty');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAIL:', err.message || err);
  process.exit(2);
}
