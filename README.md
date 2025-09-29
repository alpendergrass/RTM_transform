RTM_transform
==============

Small Node.js utilities to convert RememberTheMilk (RTM) JSON exports into a Todoist-formatted CSV for import.

Purpose
-------
- Extract a lightweight JSON schema from an RTM export (helper script).
- Transform RTM export objects (tasks, notes, lists) into a CSV matching Todoist's import template.

-Design & Constraints
--------------------
- Plain Node.js (CommonJS) single-file scripts. A minimal set of dependencies are used for testing and CSV robustness; runtime scripts remain dependency-light.
- Synchronous file I/O for simplicity; intended for small-to-medium exports.
- CSV mapping is header-driven: `data/Todoist_Template_CSV_2025.csv` defines the target columns.
-- The project includes small test scripts under `scripts/` and a `package.json` defining test commands and development dependencies.
  - Runtime scripts try to avoid dependencies; the test suite uses `tap` (devDependency) and `csv-parse` (dependency) for more robust CSV parsing in tests.

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
- The project includes test scripts and a `package.json` with test commands. Install dev dependencies (or run via `npx`) and run the tests with:

  npm test

- The test suite uses `tap` (devDependency). Some tests use `csv-parse` for robust CSV parsing; `csv-parse` is listed in `dependencies` in `package.json`.

If you prefer to run tests directly without installing devDependencies, the `npm test` script invokes `npx tap` which will fetch and run `tap` as needed.

CI
--
A GitHub Actions workflow is included at `.github/workflows/ci.yml` and will run `npm test` on push and pull requests targeting `main`/`master`.

Behavior notes & assumptions
---------------------------
- Date handling: `transform.js` formats dates using local time (YYYY-MM-DD) and appends `at HH:MM` when a time-of-day is present.
- Recurrence: iCal/RRULE strings are parsed into Todoist-friendly phrases. If a repeating rule contains a DTSTART or an explicit start field, the script appends `starting YYYY-MM-DD` (and optional time) to the recurrence phrase.
- Trashed and completed tasks are excluded from output; children of trashed tasks are also removed.
- Arrays in schema inference are treated as homogeneous (only the first item is inspected). This is a deliberate simplification; scan more elements if you need strict typing.

Tagging behavior
----------------
- All task CONTENT values emitted by `transform.js` now append the tag `@from_rtm` after any existing tags. This makes it easy to identify items that originated from an RTM export after importing into Todoist. Example:

  "Do the thing @alpha @beta @from_rtm"

New tests
---------
- Two zero-dependency test scripts were added to validate this behavior:
  - `scripts/test_task_from_rtm_tag.js` — verifies tasks with existing tags receive `@from_rtm` after those tags.
  - `scripts/test_task_from_rtm_tag_no_tags.js` — verifies tasks without tags still receive `@from_rtm`.

These are run automatically by `npm test` (they are included in the `test:from-rtm` script). You can also run them directly:

  node ./scripts/test_task_from_rtm_tag.js
  node ./scripts/test_task_from_rtm_tag_no_tags.js

Troubleshooting
---------------
- If `npm test` fails in CI with "Cannot find module scripts/..." then the checked-out commit likely didn't include test scripts. Ensure your branch contains the `scripts/` files and push them.
- For large RTM exports, replace synchronous I/O with streaming/async code.

Contributing
------------
- Keep changes small and prefer minimizing new dependencies. The project currently declares dependencies (for example, `csv-parse`) and devDependencies (`tap`) in `package.json` to support tests and robust CSV parsing.
- If you add a dependency, update `package.json` accordingly and explain the reason in the PR (include any security or maintenance considerations).

License
-------
MIT

Acknowledgements
-----------------
A couple of small code snippets from a public gist by Kylirh were used to guide code generation in a few places (for example, around CSV handling and small parsing helpers). The gist that helped inform those snippets is: https://gist.github.com/kylirh/957975e82ff34505d9df379727f08149

If you are the author and would like different attribution text or licensing noted, tell me and I'll update this acknowledgement.

AI assistance
-------------
This application was written by an AI coding assistant (GitHub Copilot). The repository owner provided guidance, reviewed the generated code, and made edits before committing.
