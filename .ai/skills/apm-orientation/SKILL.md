---
name: apm-orientation
description: Use when working in the ai-prompt-minifier repo before reading or changing code. Applies to index.html, scripts/core, scripts/filters, scripts/ui, styles/style.css, and the APM namespace as a whole.
---

# APM Orientation

APM (AI Prompt Minifier) is a single-page, fully offline prompt minifier: build an ordered recipe of filters, run it live on your input (with an optional un-minified system-prompt prefix), and copy the compact result. Pure HTML/CSS/JS, no libraries, no build step, works from `file://`.

## Constraints

- **No Dependencies**: no external libraries, frameworks, or CDNs; no npm, no bundler, no build step of any kind.
- **Single Entry**: exactly one `index.html` at the repo root; it owns the page structure and the script load order.
- **File Protocol**: the app must keep working from `file://` (double-click) — no ES modules, no `fetch`/XHR, no service worker.
- **Namespace Modules**: every script is an IIFE attaching to `window.APM`; cross-module calls resolve at call time, so the load order in `index.html` is a contract (core → filters → ui → main → tests).
- **ES5 Style**: `var` + `function` syntax, 4-space JS indent, a header comment per file stating its contract, minimal JSDoc above the functions it describes.
- **Byte Exact**: filters never corrupt content — strings, template literals, and unrecognized text stay byte-exact; a wrong language guess must return the input unchanged (identity).
- **Profile Isolation**: theme, column splits, pane heights, and the collapse state are per-browser settings and never part of save profiles; hard saves carry prefix + recipe only, soft saves add the input.
- **Tests Ship**: `scripts/tests/unit-tests.js` ships with the app and must stay inert at load (data + functions only, zero runtime cost until `APM.test.run()`).

## Steps

1. **Read AGENTS.md**: the goal and the hard constraints (pure stack, no external deps, exactly one `index.html`).
2. **Read README.md**: the user-facing contract — layout, all nine filters, saves, themes, and the full file table.
3. **Map the Tree**: `scripts/core/` (dom, storage, state, toast, tokenize) → `scripts/filters/` (registry + 9 filters) → `scripts/ui/` (theme, palette, recipe, dnd, leftpane, splits, io, saves) → `scripts/main.js` (boot, loaded last) → `scripts/tests/unit-tests.js` (runner, loaded last).
4. **Trace the Pipeline**: `APM.state` holds `{prefix, input, recipe}` → `APM.io.recompute()` runs `APM.filters.run(input, recipe)` → the raw prefix is prepended after (`prefix + "\n" + result`; the prefix is never minified) → output pane + char/token counters + truncated badge + per-card status lines; the first-run default recipe is one Minify card.
5. **Learn the Contract**: `run(text, opts)` returns a string or `{text, truncated?, meta?}`; `defaultOptions()` returns fresh defaults; descriptors drive the card UI (`presets`, `units`, `selects`, `inputs`, `checkboxes`, `status`, `keywords`).
6. **Note Storage Keys**: `apm.theme`, `apm.ui.leftCollapsed`, `apm.ui.splits`, `apm.ui.peekWidth`, `apm.ui.panes` (per-browser), `apm.lastState` (soft save, ~5 s debounce), `apm.saves` (hard saves v3: name → {prefix, recipe}).
7. **Find the Tests**: `APM.test.run()` / `APM.test.run("name")` / `APM.test.list()` in the browser console (details in the unit-testing skill).

## Checklist

- [ ] **Constraints Known**: the no-deps, single-entry, and file:// constraints are stated and any planned change would respect them.
- [ ] **File Map Complete**: every repo file is mapped to a role (page, core, filter, ui, boot, tests, assets).
- [ ] **Pipeline Traced**: the prefix/input → recipe → output flow is explained, including that the prefix is never minified.
- [ ] **Contract Known**: the `run` / `defaultOptions` / descriptors contract is stated.
- [ ] **Keys Known**: all `apm.*` keys and their profile-included vs profile-exempt status are listed.
- [ ] **GOAL Achieved**: the agent can orient in APM and state its architecture, contracts, and constraints without guessing.
