Project: RTM_transform — instructions for AI coding agents

This repository contains small Node.js scripts to extract a JSON schema from a RememberTheMilk JSON export and convert RTM JSON into a CSV matching a Todoist import template. The guidance below is intentionally concise and specific so an AI agent can be productive immediately.

Key files
- `extract_schema.js` — Builds a simple recursive schema from a JSON input and writes `data/schema.json`.
- `transform.js` — Maps fields from `data/rememberthemilk_export_*.json` to a CSV using headers from `data/Todoist_Template_CSV_2025.csv`.
- `data/rememberthemilk_export_*.json` — primary input sample(s).
- `data/schema.json` — generated schema (used as a canonical reference for field shapes/types).

Big picture
- Purpose: Convert an RTM JSON export into a CSV formatted for Todoist import. Two small utilities are used: one to infer a JSON schema, another to perform row-wise mapping to a sample CSV header.
- Data flow: read JSON export -> (optionally) infer schema with `extract_schema.js` -> transform JSON objects to CSV rows using `transform.js` -> write `data/output.csv`.
- Design decisions visible in code:
  - Scripts are single-file Node.js utilities with synchronous file I/O (simple CLI usage, no dependencies).
  - `extract_schema.js` assumes arrays are homogeneous and inspects only the first element to infer array item types.
  - `transform.js` uses a CSV sample header line to control which JSON keys become CSV columns; missing keys are written as empty cells.

Conventions and patterns agents should follow
- Keep changes minimal and synchronous: the project intentionally uses plain Node.js (CommonJS) and synchronous fs calls for simplicity.
- When working with arrays in schema inference, respect the existing assumption of homogeneity. If you change it, update tests or add a clear migration comment.
- CSV handling is minimal: `transform.js` expects a header line in `data/Todoist_Template_CSV_2025.csv` and does naive quote-escaping. For more complex needs, add a small dependency (`csv-parse` / `csv-stringify`) and document it in a `package.json`.
- Preserve existing file paths and defaults; both scripts hard-code input/output paths with override via CLI args in `extract_schema.js` (first two argv values).

Developer workflows and useful commands
- Run schema extraction locally (uses Node 14+):

  node extract_schema.js ./data/rememberthemilk_export_2025-09-21T16_50_41.384Z.json ./data/schema.json

- Run transform to produce `data/output.csv` (scripts use relative paths):

  node transform.js

- If you add dependencies, create a minimal `package.json` and install packages using npm. Because scripts are currently dependency-free, there is no `package.json` in the repo.

Notable edge-cases and gotchas for the agent
- `extract_schema.js` inspects only the first element of arrays. Arrays with mixed types will be reported as the first element's type; consider adding a sample-based or full-array scan if accurate typing is required.
- `transform.js` maps CSV headers to top-level keys in JSON objects. Nested fields (e.g., `config.username`) are not supported currently. If you add nested mapping, add a clear example and update `data/Todoist_Template_CSV_2025.csv` or the transformation code.
- Both scripts assume UTF-8 and small files; if users run this on very large exports, replace synchronous reads/writes with streaming alternatives.

Examples to reference in changes
- If you need to map nested fields, a minimal pattern is:

  // in transform.js: resolve nested key
  function getNested(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
  }

- When improving array inference in `extract_schema.js`, prefer scanning up to N elements (e.g., 10) and merging inferred types rather than scanning the full array for performance.

Testing and validation guidance
- Quick sanity checks:
  - After running `extract_schema.js`, open `data/schema.json` and verify top-level keys `config`, `tasks`, `lists` exist (these are present in current sample).
  - After running `transform.js`, open `data/output.csv` and ensure the header line matches `data/Todoist_Template_CSV_2025.csv` and row counts equal JSON items.
- If you add an automated test, keep it lightweight (Node script asserting existence and basic shape) and add a `package.json` with a `test` script.

When to ask clarifying questions
- Ask if the mapping from RTM fields to Todoist columns should be column name -> top-level JSON key, or if a custom mapping (including nested paths, value transformations, tags handling) is preferred.

Files worth opening when making changes
- `extract_schema.js` — schema inference assumptions and CLI args
- `transform.js` — header-driven CSV mapping and escaping logic
- `data/schema.json` — canonical inferred types to use as examples
- `data/Todoist_Template_CSV_2025.csv` — target CSV header format

If you change behavior that affects outputs, update `data/` with a small example output and document the new behavior in this file.

End of instructions — request feedback
If any section is unclear or you want additional examples (e.g., how to add a `package.json`, streaming large-file support, or nested-field mapping examples), tell me which area to expand and I'll iterate.
