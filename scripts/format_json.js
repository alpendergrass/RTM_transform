const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log('Usage: node scripts/format_json.js <input.json> [output.json]');
  process.exit(0);
}

const input = argv[0] || './data/rememberthemilk_export_2025-09-24T19_06_33.638Z.json';
const output = argv[1] || input;

try {
  const raw = fs.readFileSync(input, 'utf8');
  const data = JSON.parse(raw);
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Formatted JSON written to ${output}`);
} catch (err) {
  console.error('Failed to format JSON:', err && err.message ? err.message : err);
  process.exit(1);
}
