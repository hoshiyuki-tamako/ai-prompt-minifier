---
name: apm-verification
description: Use when verifying APM changes before commit, PR, or release with the full evidence-backed check battery. Applies to the whole repo: index.html, scripts, styles, manifest.json, and .github/workflows/deploy.yml.
---

# APM Verification

Every change in this repo is verified with a fixed battery, in order: the built-in unit-test battery first, then the structural constraint checks, then a clean `file://` boot. Evidence (console output, hit lists, file counts) is part of a pass — a check without recorded evidence is not a pass.

## Constraints

- **Tests First**: no change is verified until `APM.test.run()` is all green.
- **No Deps**: shipped code references no external library, framework, CDN, or network resource (no `fetch`/XHR, no remote `<script>`/`<link>`, no npm imports).
- **Single Entry**: exactly one `index.html`, at the repo root.
- **Load Order**: `scripts/core/` → `scripts/filters/` (registry before every filter) → `scripts/ui/` → `scripts/main.js` → `scripts/tests/unit-tests.js`, exactly as in `index.html`.
- **File Boot**: the app boots from `file://` with zero console errors — no ES modules, no service worker.
- **Static Deploy**: `.github/workflows/deploy.yml` uploads the repo as-is to GitHub Pages on push to `main` — there is no build step; a broken file breaks the deploy.
- **Evidence**: each check records its output (final console line, hit list, file count) alongside its pass.

## Steps

1. **Run the Battery**: open `index.html` in a browser, run `APM.test.run()` in the console, and keep the final `N passed, 0 failed (N total)` line as evidence.
2. **Check Entry**: list the repo root and confirm exactly one `index.html`.
3. **Check Order**: read the `<script src>` block in `index.html` and confirm core → filters → ui → main → tests, with `registry.js` before every filter file.
4. **Scan Deps**: search `index.html`, `scripts/`, `styles/style.css`, and `manifest.json` for `fetch(`, `XMLHttpRequest`, `http://`, `https://`, and `import ` — expect zero hits in shipped code; record and justify any hit (URLs inside test data are content, not dependencies).
5. **Boot from Disk**: double-click `index.html`, confirm zero console errors on load, and confirm the UI renders (palette, panes, and either a resumed state or the default Minify card).
6. **Run the Checklist**: verify the GOAL with the collected evidence.

## Checklist

- [ ] **Tests Green**: `APM.test.run()` final line says 0 failed.
- [ ] **Single Entry**: exactly one `index.html` in the repo.
- [ ] **Order Correct**: the script order in index.html matches the required chain.
- [ ] **No Deps Found**: the dependency scan shows zero external runtime references.
- [ ] **Clean Boot**: the `file://` load produces no console errors and the app renders.
- [ ] **GOAL Achieved**: every battery check passed with recorded evidence.
