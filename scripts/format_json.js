const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help')) {
  console.log('Usage: node scripts/format_json.js <input.json> [output.json]');
  process.exit(0);
}

let input = argv[0];
let output = argv[1];

// If no input provided, pick the newest file in ./data starting with 'rememberthemilk_export'
if (!input) {
  const dataDir = path.resolve(__dirname, '..', 'data');
  try {
    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('rememberthemilk_export'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dataDir, f)).mtime.getTime() }));
    if (files.length > 0) {
      files.sort((a, b) => b.mtime - a.mtime);
      input = path.join('data', files[0].name);
      console.log(`No input provided — using newest export ${input}`);
    }
  } catch (e) {
    // leave input undefined and let the error surface below
  }
}

// Default output to input if not provided
if (!output && input) output = input;

try {
  const raw = fs.readFileSync(input, 'utf8');
  const data = JSON.parse(raw);
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Formatted JSON written to ${output}`);
} catch (err) {
  console.error('Failed to format JSON:', err && err.message ? err.message : err);
  process.exit(1);
}
