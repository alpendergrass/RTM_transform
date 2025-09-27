RTM_transform
==============

Small Node.js utilities to convert RememberTheMilk (RTM) JSON exports into a Todoist-formatted CSV for import.

Purpose
-------
- Extract a lightweight JSON schema from an RTM export (helper script).
- Transform RTM export objects (tasks, notes, lists) into a CSV matching Todoist's import template.

Design & Constraints
--------------------
- Plain Node.js (CommonJS) single-file scripts — no external dependencies required.
- Synchronous file I/O for simplicity; intended for small-to-medium exports.
- CSV mapping is header-driven: `data/Todoist_Template_CSV_2025.csv` defines the target columns.
- The project includes small test harness scripts under `scripts/` (they are Node scripts, not a test framework).

Key files
---------
- `transform.js` — main converter. Reads an RTM JSON export and writes `data/output.csv` and `data/used_records.json` by default.
- `extract_schema.js` — builds a simple recursive schema from an RTM JSON export and writes `data/schema.json`.
- `scripts/` — small test harnesses and helpers (formatting, unit-style checks):
  - `scripts/test_csv_and_filenames.js`
  - `scripts/test_ical_to_todoist.js`
  - `scripts/test_ordering.js`
  - `scripts/test_no_orphans.js`
  - `scripts/test_trashed_exclusion.js`
  - `scripts/format_json.js`
- `data/` — sample exports, template CSV, and synthetic fixtures used by tests.

Usage
-----
- Transform an RTM export (defaults pick the newest `rememberthemilk_export*` in `data/`):

  node transform.js

- Provide explicit inputs/outputs and mapping:

  node transform.js --input ./data/rememberthemilk_export_2025-09-21T16_50_41.384Z.json --map ./data/mapping.sample.json --rowsPath tasks --csv ./data/Todoist_Template_CSV_2025.csv --output ./data/output.csv --output-json ./data/used_records.json

- Extract schema from an RTM export:

  node extract_schema.js ./data/rememberthemilk_export_2025-09-21T16_50_41.384Z.json ./data/schema.json

- Format the newest RTM export in `data/` (helper):

  node scripts/format_json.js

Testing
-------
- The project includes small test scripts. Run them with npm scripts defined in `package.json`:

  npm test

- Or run individual test targets:

  npm run test:csv
  npm run test:ical
  npm run test:ordering
  npm run test:no-orphans
  npm run test:trashed

CI
--
A GitHub Actions workflow is included at `.github/workflows/ci.yml` and will run `npm test` on push and pull requests targeting `main`/`master`.

Behavior notes & assumptions
---------------------------
- Date handling: `transform.js` formats dates using local time (YYYY-MM-DD) and appends `at HH:MM` when a time-of-day is present.
- Recurrence: iCal/RRULE strings are parsed into Todoist-friendly phrases. If a repeating rule contains a DTSTART or an explicit start field, the script appends `starting YYYY-MM-DD` (and optional time) to the recurrence phrase.
- Trashed and completed tasks are excluded from output; children of trashed tasks are also removed.
- Arrays in schema inference are treated as homogeneous (only the first item is inspected). This is a deliberate simplification; scan more elements if you need strict typing.

Troubleshooting
---------------
- If `npm test` fails in CI with "Cannot find module scripts/..." then the checked-out commit likely didn't include test scripts. Ensure your branch contains the `scripts/` files and push them.
- For large RTM exports, replace synchronous I/O with streaming/async code.

Contributing
------------
- Keep changes small and maintain the zero-dependency approach unless a dependency clearly simplifies a risky task (like robust CSV handling or iCal parsing). If you add a dependency, add a `package.json` and explain the reason in the PR.

License
-------
MIT
