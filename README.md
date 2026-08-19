# AI Prompt Minifier

Minify AI prompts for models with context limits (Claude, GPT-4, Gemini, …). Paste a prompt, build a recipe of nine filters, copy the compact result.

**TLDR**

- Pure HTML/CSS/JS — **no dependencies, no build, no network**. Double-click `index.html` and it works, even from `file://`.
- A CyberChef-style 3-column workspace (layout inspiration only — **zero code copied**): filter palette → recipe → prefix/input/output.
- Output updates **live** as you type, with char + `≈ token` counters.
- Everything stays on your machine (`localStorage`); no server, no accounts.

## Layout

1. **Filters** (left) — the nine operations, searchable, listed A→Z. Drag, double-click, or press Enter to add one.
2. **Recipe** (middle) — your applied filters **in the order you set**. Drag a card head to reorder, `×` to remove, **Clear** to empty.
3. **Prefix / Input / Output** (right) — optional prefix on top, input, output below. Panes show char + `≈ tok` + line counts, and cursor/selection while focused; **Copy** grabs the result.

The recipe runs top to bottom on your input only, then the raw prefix is placed in front: `prefix + "\n" + minified(input)`. **The prefix is never minified.** Order matters — filters are not commutative.

## Filters

Each filter is a recipe card. Examples below are actual outputs (pair with **Minify** to tidy leftover spaces).

### Minify
String-aware whitespace collapse — strings stay byte-exact; a space is kept only between word characters.
`x   =   1 ;` → `x=1;` · `a b` → `a b`

### Output length limit
Cuts the result to a max length, in **characters (exact)** or **estimated tokens** (cuts at a word boundary). Presets 10k / 32k / 100k / 200k / 390k (default) or a custom number; the output gets a `truncated` badge.

### Strip HTML
Removes comments and tags; decodes common entities; a lone `&` is left alone.
`hi &amp;` → `hi &`

### Remove comments
Removes line + block comments, string-aware (`//` in a URL is never touched); each comment becomes one space. Language: **Auto** (guesses; text with no code markers is left unchanged), **Auto-Multi** (mixed pastes), or **19 explicit languages**.
`var x = 1; // note` → `var x = 1;`

### Remove emoji
Each emoji sequence (incl. ZWJ families, flags, keycaps) becomes one space; text without emoji passes byte-identical.
`a 😀 b` → `a   b`

### Remove extra space
Collapses **every** whitespace run — even inside strings — to N spaces (default 1; 0 removes all), then trims.
`a   b\n\n  c` → `a b c`

### Regex find & replace
JavaScript regex with **Pattern / Replacement / Flags** (`i`, `m`; `g` is automatic). Single loop-safe pass, `$1` works, invalid pattern = unchanged. A live status line shows the match count.

### Code minify
Language-aware whitespace minify for **20 languages** — strings, template literals and raw text always stay byte-exact.
`def f( a , b ):  return a + b` → `def f(a,b):return a+b`
Options: **Language** (Auto + 20), **Version** (C# 5–12 bands), **Remove comments** (JSON then minifies as JSONC), JSON value toggles (remove `null` / `{}` / `[]` / `""`), Markdown **keep text only**.

### Duplicate line dedup
Removes **exact** duplicate lines or blocks (byte-exact match), keeps the first, and reports the count on the card.
`a\na\nb\na` → `a\nb`

## Saves

- **Save** (hard) — stores **prefix + recipe** (every card's option values round-trip) under a name. Deliberately **excludes** the input text and the theme; **Load** never touches either.
- **Reset** — Load with the empty `-- Load --` option: prefix + recipe back to first-visit defaults (empty prefix, **Minify**), input + theme untouched.
- **Auto-resume** (soft) — always on: prefix/input/recipe/options are saved ~5 s after your last change and on close. On open, a soft save always wins; only a first-time visitor starts fresh.
- **Per-browser settings** (never part of a profile) — theme (**Dark / Light / Midnight / Paper**), column widths, pane heights, peek width, rail collapse.
- **Export / Import** — all saves as JSON in a modal (copy or download). Import **replaces** your saves (asks first; invalid entries skipped + reported). Old-version maps — `{"Name": "prefix text"}` — are understood too (each entry becomes a save with the Minify recipe).
- **Upgraded from the old version?** Your old prefix presets are carried across automatically on the first open (same-name saves always win), your last prefix resumes, and the legacy keys are removed only after their data is safely stored.

## Workspace

- **`«` / `»`** collapses the left columns into slim icon rails; hover a collapsed column to **peek** the recipe (options stay editable; add/remove/reorder is off — it's a settings-only view).
- Drag the **gutters** to resize columns and I/O panes; Arrow keys nudge, double-click resets.
- Keyboard-friendly: every action is reachable without a mouse.

## How to use

1. Double-click `index.html` (any modern browser; fully offline).
2. Optionally type a **Prefix** — it appears above the output, never minified.
3. Paste your prompt into **Input** (Minify starts in the recipe by default).
4. Add and order filters as needed; watch the char + token counters.
5. **Copy** the output and paste it into your AI chat.

## AI transparency

This project was built with AI assistance: an AI agent did the bulk of the coding, testing and documentation; a human directed every design decision and reviewed the work. Nothing was copied from CyberChef (layout inspiration only). Bug reports and feature ideas are welcome.

## Files

The complete app is **30 files**:

| File | Role |
| --- | --- |
| `index.html` | The only HTML — page structure + pre-paint theme bootstrap + PWA head |
| `styles/style.css` | All styling; the four theme palettes as CSS custom properties |
| `manifest.json` | PWA manifest (standalone) — **no service worker, by design** |
| `icons/icon-192.png` | PWA icon 192×192 |
| `icons/icon-512.png` | PWA icon 512×512 |
| `scripts/main.js` | Boot: wires the modules, restores the last state (loaded last) |
| `scripts/core/dom.js` | DOM helpers (`$`, `el`, shared `copyText`) |
| `scripts/core/storage.js` | Throw-safe `localStorage` JSON read/write |
| `scripts/core/state.js` | Working state (prefix, input, recipe) + snapshot/restore |
| `scripts/core/toast.js` | Toast notifications |
| `scripts/core/tokenize.js` | Heuristic token estimator (`≈ N tok`) |
| `scripts/filters/registry.js` | Filter registry + ordered pipeline |
| `scripts/filters/minify.js` | **Minify** |
| `scripts/filters/output-length-limit.js` | **Output length limit** (chars/tokens + presets) |
| `scripts/filters/strip-html.js` | **Strip HTML** |
| `scripts/filters/remove-comment.js` | **Remove comments** (19 languages + Auto modes) |
| `scripts/filters/remove-extra-space.js` | **Remove extra space** (N spaces, 0 = all) |
| `scripts/filters/remove-emoji.js` | **Remove emoji** (each sequence → one space) |
| `scripts/filters/regex-replace.js` | **Regex find & replace** (loop-safe, live status) |
| `scripts/filters/code-minify.js` | **Code minify** (20 languages, C# bands, JSON/Markdown options) |
| `scripts/filters/dedup.js` | **Duplicate line dedup** (lines or blocks) |
| `scripts/ui/theme.js` | Theme switch + persistence |
| `scripts/ui/palette.js` | Filter palette: search + add |
| `scripts/ui/recipe.js` | Recipe cards, options, reorder, status lines |
| `scripts/ui/dnd.js` | Drag & drop state + indicator |
| `scripts/ui/leftpane.js` | Collapse the left columns |
| `scripts/ui/splits.js` | Resizable columns/panes + hover-peek width |
| `scripts/ui/io.js` | Live recompute, counters, copy, confirmed clears |
| `scripts/ui/saves.js` | Save/Load + auto-resume + export/import modal |
| `scripts/tests/unit-tests.js` | Built-in test runner — `APM.test.run()` (427 pinned cases, no tools) |

**Code layout:** small plain `<script>` files — **not ES modules** (browsers block those on `file://`) — each attaching to one shared `window.APM` namespace. No bundler, no build step, no dependencies.

## Notes

- **Offline first**: no network requests, no service worker; installable as a PWA (manifest + icons) on desktop and mobile.
- **Data**: `localStorage` under the `apm.*` keys — `apm.theme`, `apm.saves`, `apm.lastState`, `apm.ui.leftCollapsed`, `apm.ui.splits`, `apm.ui.peekWidth`, `apm.ui.panes`. Clearing site data removes everything. (Legacy old-version keys are migrated once, then removed — see Saves.)
- **Tests**: open the app, run `APM.test.run()` in the browser console — 427 pinned cases, zero external tools.
- **Docs**: this README + minimal JSDoc in the code + [`.ai/skills/`](.ai/skills/) (project orientation, unit testing, verification battery, add-a-filter workflow).
