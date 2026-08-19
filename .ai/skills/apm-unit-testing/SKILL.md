---
name: apm-unit-testing
description: Use when running, adding, or fixing APM unit tests, or when a change needs a regression case. Applies to scripts/tests/unit-tests.js, the APM.test console runner, and the filter functions under test.
---

# APM Unit Testing

The suite ships inside the app: `scripts/tests/unit-tests.js` exposes `APM.test.run()`, `APM.test.run("substring")`, and `APM.test.list()` in the browser console. No npm, no node, no framework — the browser is the runner, and expected values are pinned literals (node ground truth), never eyeballed.

## Constraints

- **No External Tools**: no npm, no node, no test framework, no CI test runner — the browser console is the only runner.
- **Load Inert**: at load the file defines data + functions only — no listeners, no timers, no DOM writes, no network.
- **Pinned Vectors**: expected values are literals pinned from node ground-truth harnesses; they encode the shipped contract, not the current implementation.
- **State Safety**: state-touching suites (pipeline, saves, theme, palette, focus trap) must capture the user's state before and restore it after (try/finally) — tests never leave user data mutated.
- **Idempotent Run**: `APM.test.run()` is safe to re-run in the same tab (e.g. right after an edit).
- **Suite Naming**: cases belong to a suite name (e.g. "code-minify", "remove-comment"); `run("filter")` matches case names containing the substring.

## Steps

1. **Open the App**: open `index.html` in any modern browser (double-click from disk is fine — `file://` works).
2. **Run the Suite**: in the console run `APM.test.run()` — expect a per-suite PASS line and a final `N passed, 0 failed (N total) — all green` line plus a toast.
3. **Filter by Name**: `APM.test.run("csharp")` runs only cases whose names contain the substring; `APM.test.list()` returns every case name.
4. **Add a Case**: near the sibling cases, call `add("<suite>", "<name>", <expected>, "<op>", [args])`; if the case drives a new code path, add a matching `case "<op>":` to the `evalOp` dispatch (unknown ops throw).
5. **Pin the Expectation**: compute the expected value from the contract (or a one-off node harness) before writing it — never copy the output of the code under test.
6. **Re-run**: `APM.test.run()` again; the new case appears in its suite line; failures print `expected` vs `actual`.

## Checklist

- [ ] **Suite Green**: `APM.test.run()` reports 0 failed for the full battery.
- [ ] **Case Visible**: the new case name appears in `APM.test.list()`.
- [ ] **Load Still Inert**: the edit adds no listeners, timers, DOM writes, or network at load.
- [ ] **State Restored**: after a state-touching run, the user's panes, recipe, and saves are unchanged.
- [ ] **GOAL Achieved**: the suite passes with the new or changed cases and the expected values are pinned from the contract.
