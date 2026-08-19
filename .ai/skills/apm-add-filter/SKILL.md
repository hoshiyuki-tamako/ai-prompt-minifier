---
name: apm-add-filter
description: Use when adding a new APM filter end to end, from the file and load wiring through tests and docs. Applies to scripts/filters, the script block in index.html, scripts/tests/unit-tests.js, and README.md.
---

# APM Add Filter

A filter is a small IIFE file that registers itself into `APM.filters`. The UI is descriptor-driven — `ui/recipe.js` renders whatever the filter definition declares — so a new filter needs: the file, one load-order line, test cases, the pinned inventory updates, and docs.

## Constraints

- **Registry First**: `scripts/filters/registry.js` must load before the new filter file, or registration throws.
- **Unique Id**: the id must be new (duplicate ids throw at load); kebab-case, matching the file name like its siblings.
- **Pure Run**: `run(text, opts)` is deterministic; it returns a string or `{text, truncated?, meta?}`; `meta` is a short card status line and never leaks into the output.
- **Default Options**: `defaultOptions()` must exist and its values must round-trip through Save → Load.
- **Descriptor UI**: card options come from descriptors (`presets`, `units`, `selects`, `inputs`, `checkboxes`, `status`) — never add bespoke UI code in `scripts/ui/` for a new filter.
- **Byte Exact**: strings and unrecognized content are never corrupted; when unsure, return the input unchanged (identity).
- **Tests Required**: the filter ships with pinned test cases before it is considered done.
- **Docs Updated**: README.md's filter list and file table mention the new filter and file.

## Steps

1. **Create the File**: add `scripts/filters/<id>.js` as an IIFE with a header comment stating the contract, a pure `run` implementation, and `APM.filters.register("<id>", { name, desc, keywords, run, defaultOptions })` (plus any descriptors).
2. **Wire Load Order**: insert `<script src="scripts/filters/<id>.js"></script>` in `index.html` after `registry.js` and before the first `scripts/ui/` script.
3. **Define Options**: declare `defaultOptions()` and any descriptors — `selects` (static or option-dependent `choices`), `inputs`, `checkboxes` (with `def` / `visible`), or `status: true` for a live meta line.
4. **Add Test Cases**: in `scripts/tests/unit-tests.js`, add `add("<id>", "<name>", <expected>, "<op>", [args])` cases near the siblings; add a `case "<op>":` to the `evalOp` dispatch if a new code path is needed (unknown ops throw).
5. **Update Pinned Lists**: bump the inventory vectors — the filter-id list case, the palette name-order and count cases, and any search-hit expectations the new `name`/`desc`/`keywords` affect (a new keyword can change which cards a search returns).
6. **Run the Battery**: `APM.test.run()` all green; then in the live app: the palette lists the filter (name-sorted), the card renders its options, and Save → Load round-trips them.
7. **Update Docs**: add the filter to README.md's filter list and file table (and to AGENTS.md only if a constraint changed).

## Checklist

- [ ] **Registered**: `APM.filters.get("<id>")` returns the definition in the live app.
- [ ] **Card Renders**: the palette lists the filter and its recipe card shows its options.
- [ ] **Round Trip**: Save → Load preserves the filter's option values.
- [ ] **Tests Green**: `APM.test.run()` passes, including the new cases and the updated inventory vectors.
- [ ] **Docs Updated**: README.md lists the new filter and file.
- [ ] **GOAL Achieved**: the filter works in the live app and the full battery passes with evidence.
