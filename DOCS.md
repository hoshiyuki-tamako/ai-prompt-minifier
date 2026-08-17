# DOCS — AI Prompt Minifier (technical documentation)

> **Audience**: developers who want to understand, extend, or debug this app.
> For end-user documentation (features, how-to, save/load semantics) see [README.md](README.md).
> This file documents the code **exactly as it exists in this repository**; every function name and signature below is cross-checked against the source files.

## 1. Purpose & scope

AI Prompt Minifier is a single-page web app that shrinks AI chat prompts: you paste a prompt (plus an optional system-prompt prefix), choose an ordered pipeline of six text filters, and read the compacted result — live, offline, in the browser.

Hard constraints that shape the whole codebase (see `AGENTS.md`):

- **Pure HTML/CSS/JS only.** No frameworks, no external libraries, no CDN, no network calls, no build step.
- **Exactly one HTML file** (`index.html`). Supporting assets (`styles/`, `scripts/`) are plain files.
- **Must work by double-clicking `index.html` from disk** (`file://`) as well as over `http(s)`. This is why the app uses classic `<script>` files + a namespaced global instead of ES modules (modules are blocked on `file://` in Chrome/Firefox).
- **Never copies code from the CyberChef reference** (`agent-source/CyberChef/`, Apache-2.0, layout/interaction style reference only). Everything here is written for this project.

## 2. File map

The complete application is **24 files**:

| File | Role |
| --- | --- |
| `index.html` | The single HTML page: all DOM structure (banner, 3 columns, prefix/input/output panes, the saves export/import modal), the inline **pre-paint theme bootstrap** in `<head>`, the PWA head tags (`manifest` link, `apple-touch-icon`, `theme-color`), and the 19 ordered `<script>` tags. |
| `styles/style.css` | All styling. Top section = the 4 theme palettes as CSS custom properties (design tokens); the rest = layout and component rules that consume only those tokens (incl. the collapsed-rail block and the export/import modal). |
| `manifest.json` | PWA manifest (`start_url`/`scope` = `.` so it survives GitHub Pages subpaths; `standalone`; `#121212` colours; 192 + 512 icons). No service worker — by design. |
| `icons/icon-192.png` | PWA icon, exactly 192×192 (the favicon glyph: blue `#0d6efd` rounded square + white down arrow, transparent corners). |
| `icons/icon-512.png` | PWA icon, exactly 512×512 (same design rendered at size, not a downscale). |
| `scripts/core/dom.js` | Tiny shared DOM helpers: `$()` (by id), `el()` (safe element factory), `copyText()` (shared clipboard helper — output Copy + saves export modal). |
| `scripts/core/storage.js` | Throw-safe JSON `localStorage` helpers (`get`/`set`). Every storage access in the app goes through these. |
| `scripts/core/state.js` | The single source of truth: `{ prefix, input, recipe }` + `snapshot()` / `restore()`. |
| `scripts/core/toast.js` | Top-centre toast (success/error variants, 2 s fade). |
| `scripts/filters/registry.js` | Filter registry **and** the pipeline runner. Must load before every filter file. |
| `scripts/filters/minify.js` | `Minify` filter (string-aware whitespace minify). |
| `scripts/filters/output-length-limit.js` | `Output length limit` filter; **its `presets` metadata is rendered into the recipe card** by `ui/recipe.js`. |
| `scripts/filters/strip-html.js` | `Strip HTML` filter (comments, tags, entity decoding). |
| `scripts/filters/remove-comment.js` | `Remove comments` filter; per-language `GRAMMAR` table + single-pass scanner, plus the `Auto` (guess one language) and `Auto-Multi-Language` (block-by-block) selection layers. |
| `scripts/filters/remove-extra-space.js` | `Remove extra space` filter (collapse every whitespace run to one space, trim). |
| `scripts/filters/regex-replace.js` | `Regex find & replace` filter (pattern + replacement + flags; single-pass loop-safe `String.replace`; live match-state `meta`). |
| `scripts/ui/theme.js` | Theme switch wiring + `apply(name)` / `current()` for runtime switching. The theme is an independent auto-save (`apm.theme`) — profiles never carry a theme, so loading a save never changes it (see §6). |
| `scripts/ui/palette.js` | Column 1: searchable filter palette; drag / double-click / keyboard add. |
| `scripts/ui/recipe.js` | Column 2: ordered recipe cards — `render/add/move/remove` + the per-card options renderer (bespoke `limit` branch + generic `selects` + generic `inputs` branches) + the live per-card status line (`setStatuses`) for `status: true` filters. |
| `scripts/ui/dnd.js` | HTML5 drag & drop: palette→recipe insert, recipe reorder, drop indicator, global drag guards (refuses recipe reorder while the left columns are collapsed). |
| `scripts/ui/leftpane.js` | The left-columns collapse toggle (`#left-toggle`): flips `#workspace.left-collapsed` and persists `apm.ui.leftCollapsed` (absent = expanded = new-user default). The rail look + hover-peek are pure CSS. |
| `scripts/ui/io.js` | Column 3: live recompute (prefix+input → recipe → output), character counters, truncated badge, per-card status hand-off (`APM.recipe.setStatuses`), copy/clear wiring (copy via shared `APM.dom.copyText`). |
| `scripts/ui/saves.js` | The two-model save system: **hard** saves (named, v3 shape — no input, no theme) + **soft** auto-save (debounced, includes input) + the **export/import** modal (apm.saves as JSON: copy / download / wipe-replace import). |
| `scripts/main.js` | **Boot.** Loaded last; wires every module, restores or defaults the state, renders palette + save list. |

Non-app files: `README.md` (user docs), this `DOCS.md`, `SUGGESTION.md` (future-work notes), `AGENTS.md` (constraints), `LICENSE`, `.github/workflows/deploy.yml` (GitHub Pages deploys the whole repo root — no build step).

## 3. Architecture

### 3.1 Module system: one global namespace, classic scripts

There is no bundler and no module system. Each `scripts/**/*.js` file is an IIFE that attaches its public surface to a single shared global:

```js
(function (APM) {
    "use strict";
    // ... module internals ...
    APM.state = { /* ... */ };        // the public surface for this module
})(window.APM = window.APM || {});
```

Rules that make this safe:

1. **Load order is explicit** — the 19 `<script>` tags in `index.html` (no `defer`, no modules) are the dependency graph. `core/` first, then `filters/` (with `registry.js` first among filters), then `ui/`, and `main.js` **last**.
2. **Only one load-time cross-call exists**: every filter file calls `APM.filters.register(...)` at load time and *throws* if `registry.js` hasn't loaded (fail-fast, e.g. `minify: scripts/filters/registry.js must be loaded first`). Everything else (e.g. `recipe.js` calling `APM.io.recompute()`) is **call-time** resolution, which works because `main.js` boots the app after all files have loaded.
3. **No file exposes private state** other than through the `APM.<module>` surface listed in §7.

### 3.2 Boot sequence

1. **Pre-paint** — inline `<script>` in `<head>` (index.html) reads `apm.theme` and sets `document.documentElement.className` before first paint (no theme flash). Wrapped in try/catch: unavailable storage just keeps the default dark theme.
2. **Load** — the 19 scripts execute in order; each registers itself on `window.APM`.
3. **Boot** — `scripts/main.js` runs (on `DOMContentLoaded` if it loaded early) and calls, in this exact order:

   ```
   APM.theme.init()        → apply saved theme class, sync select, wire change
   APM.saves.init()        → wire Save/Load/Delete buttons + pagehide/beforeunload flush
   APM.palette.init()      → wire the search box
   APM.recipe.init()       → wire the Clear-recipe button
   APM.dnd.init()          → wire recipe drop zone + global drag guards
   APM.leftpane.init()     → apply saved collapse state (apm.ui.leftCollapsed) + wire #left-toggle
   APM.io.init()           → wire prefix/input events, clear/copy buttons

   var last = APM.storage.get("apm.lastState");
   last ? APM.state.restore(last)
        : (recipe = [{id:"minify"}] + render + recompute)   // new-user default

   APM.palette.render("")  → column 1 populated (insertion order)
   APM.saves.refresh()     → save-list dropdown populated
   ```

### 3.3 Data flow

```
#prefix ─┐
         ├─► APM.state.{prefix,input,recipe}  ──► APM.io.recompute()
#input ──┘          ▲                                  │
                    │ APM.state.restore(snap)           ▼
      (boot / hard load)                     APM.filters.run(text, recipe)
                                                              │
   recipe cards (ui/recipe.js) ◄── APM.recipe.{add,move,remove,render}
   palette (ui/palette.js) ──────────────┘
   APM.saves.persistSoon() ←── recompute (5 s debounce → apm.lastState)
```

## 4. Pipeline contract

- The combined text is **`prefix + "\n" + input`** when both are non-empty, otherwise whichever is present (see `combinedText()` in `ui/io.js`). An empty prefix keeps the pipeline byte-identical to input-only.
- The recipe runs **top to bottom**: card 1's output is card 2's input, and so on. Order is user-controlled and meaningful (filters are not commutative — e.g. `Minify` before `Strip HTML` treats attribute values as quoted strings).
- Every filter's `run(text, options)` returns **either a string**, **`{ text: string, truncated: boolean }`**, or **`{ text, meta }`** (a short status string for the card — e.g. the regex filter's match state). The runner (`APM.filters.run` in `registry.js`) accepts all three; `truncated` flags OR together and surface as the `#truncated-badge`; each card's `meta` is collected into `result.metas` as `{ index, meta }` pairs, handed on by `APM.io.recompute()` → `APM.recipe.setStatuses()`, which renders a live per-card status line (tones `ok` / `none` / `err`). `metas` is `[]` when no filter reported one, so existing consumers are unaffected. `meta` never leaks into the output text.
- A recipe entry is `{ id: string, options: object }`. Options always come from the filter's `defaultOptions()` when a card is added; on restore, an entry's saved `options` object is used verbatim if present. Unknown filter ids are skipped by the runner and dropped by `restore()` — corrupt recipes can't crash the pipeline.
- Filter definition shape (everything a `APM.filters.register(id, def)` call may declare):

  | Field | Required | Meaning |
  | --- | --- | --- |
  | `name` | yes | Display name (palette + card title). |
  | `desc` | yes | Short description (palette subtitle + card subtitle). |
  | `run(text, options)` | yes | The transform. Pure — no DOM, no storage. |
  | `defaultOptions()` | yes | Returns a **fresh options object** each call. |
  | `presets` | no | `[{ value: number, label: string }]` — **only `limit`** uses it; the recipe card renderer turns it into the dropdown. |
  | `defaultLimit` | no | **Only `limit`**; shown as the number-input value. |
  | `selects` | no | `[{ key, label, choices: [{ value, label }] }]` — generic options dropdowns rendered by `ui/recipe.js` (used by `remove-comment`). |
  | `inputs` | no | `[{ key, label, placeholder }]` — generic text inputs rendered by `ui/recipe.js`; the value updates `options[key]` on every `input` event and recomputes live (used by `regex-replace`). |
  | `status` | no | `true` = the card gets a live `.rec-status` line fed by the filter's `meta` (currently `regex-replace` only). |

## 5. Filter contracts (the six shipped filters)

Palette order = script-load order in `index.html`: **Minify → Output length limit → Strip HTML → Remove comments → Remove extra space → Regex find & replace**.

### 5.1 `minify` — Minify

`scripts/filters/minify.js`. Single-pass character scanner with the exact semantics of the original app's default behaviour:

- Double-quoted strings (with backslash escapes) are kept **byte-exact**.
- Outside strings, whitespace collapses to at most one space, and that space is emitted **only when both neighbours are word characters** (`/\w/`).
- Result is trimmed.
- **Intended legacy quirk**: `a "b" c` → `a"b"c` (space between a word char and a quote is dropped). This is the documented "default behaviour of the current index.html" — do not "fix" it.
- No options.

### 5.2 `limit` — Output length limit

`scripts/filters/output-length-limit.js`. `run(text, { preset, custom })`:

- `preset` is a string: `"10000" | "32000" | "100000" | "200000" | "390000" | "custom"` (presets declared in this file, **390000 = default**, matching the original app).
- For `"custom"`, the numeric `custom` is used (floored); otherwise `preset` is parsed as the number.
- Returns `{ text, truncated }`; the no-truncation path returns `truncated: false` even for short input.
- Card UI: preset `<select>` + a number input that appears only when `Custom…` is selected (rendered by the bespoke branch in `ui/recipe.js`).

### 5.3 `strip-html` — Strip HTML

`scripts/filters/strip-html.js`. Ordered passes:

1. Comments `<!--…-->` (unterminated → to end of input) → **one space**.
2. Tags + DOCTYPE → **one space** (words never join).
3. Numeric character references `&#dd;` / `&#xhh;` decoded; invalid codepoints (`> 0x10FFFF`, `NaN`) → space.
4. Named entities `&amp; &lt; &gt; &quot; &apos; &nbsp;` decoded (`&nbsp;` → regular space); **unknown entities left as-is**; a lone `&` that isn't an entity is untouched.

Pinned vector: `<div class="a">Hi&nbsp;&amp;&lt;x&gt;</div><!-- c -->` → `" Hi &<x>  "`.

### 5.4 `remove-comment` — Remove comments

`scripts/filters/remove-comment.js`. Own implementation: a **single-pass character scanner** driven by a per-language `GRAMMAR` table (line-start, block-start/end, nesting, backtick templates, triple-quoted strings), with two **selection layers** on top — `Auto` and `Auto-Multi-Language` — that decide *which grammar* (or which blocks) the scanner runs on. The scanner itself is always language-explicit.

- **String literals are always opaque** — `//` in URLs, `#` in Python strings, `/* */` inside CSS `content:` values are never touched. Backslash escapes honoured; a raw newline inside a non-multiline quoted string means "not a string" (so a stray apostrophe in prose can't swallow a whole line — it swallows at most to end-of-line).
- Replacement contract: each removed comment → **exactly one space**; line comments keep their terminating newline; unterminated block comments consume to the end; all non-comment bytes preserved exactly (no trimming). Pair with `Minify` / `Remove extra space` to tidy the leftover spaces.
- Languages (dropdown order exactly): `auto` Auto (**default**), `auto-multi` Auto-Multi-Language, then the **17 explicit grammars** in ASC display order — C#, C/C++, CSS, Go, HTML/XML, Java, JS/TypeScript, Kotlin, Markdown, PHP, PowerShell, Python, Ruby, Rust, sh/bash, SQL, Swift.

| Value | Language | Line comments | Block comments | Notes (incl. documented limitations) |
| --- | --- | --- | --- | --- |
| `c-sh` | C# | `//` | `/* … */` | |
| `c-cpp` | C/C++ | `//` | `/* … */` | |
| `css` | CSS | — | `/* … */` | `//` is **not** a comment (correct per CSS). |
| `go` | Go | `//` | `/* … */` | Backtick raw strings kept opaque (no interpolation). |
| `html-xml` | HTML/XML | — | `<!-- … -->` | Quoted attribute values opaque. |
| `java` | Java | `//` | `/* … */` | |
| `js-ts` | JS/TypeScript | `//` | `/* … */` | Backtick templates raw: `${…}` contents **not parsed**; regex literals not distinguished from division. |
| `kotlin` | Kotlin | `//` | `/* … */` (**nested**) | `"""` raw strings opaque. |
| `markdown` | Markdown | — | `<!-- … -->` | **Only** HTML-style comments — `#` headings and fenced code are preserved byte-exact. |
| `php` | PHP | `//`, `#` | `/* … */` | |
| `powershell` | PowerShell | `#` | `<# … #>` | Backtick escapes and here-strings not handled. |
| `python` | Python | `#` | — | `'`/`"` and triple-quoted strings opaque. |
| `ruby` | Ruby | `#` | `=begin … =end` | Delimiters count **only at line start** (open and close); heredocs not handled. |
| `rust` | Rust | `//` | `/* … */` (**nested**) | |
| `sh` | sh/bash | `#` | — | A leading `#!` shebang line is code, never a comment. |
| `sql` | SQL | `--` | `/* … */` | `--` opens only at a word boundary — `1--2` is data; the `''`-doubling string style is fine. |
| `swift` | Swift | `//` | `/* … */` (**nested**) | `"""` multi-line strings opaque. |

  The special cases come from scanner flags: `shebang` (sh), `wordStart` (SQL), `lineScoped` (Ruby). An unknown or corrupt language value falls back to the `js-ts` scanner — it never crashes.
- Option shape: `{ language: "auto" | "auto-multi" | "<one of the 17 explicit values>" }`; `defaultOptions()` = `{ language: "auto" }`.

**`Auto` (`guessLanguage`)** — marker-regex scoring, cheap by design (a handful of linear `.test()` scans per language, early exit at 3 hits; **no character walk**):

1. Each of the 17 languages has 3–6 distinctive source-level marker regexes (`MARKERS`, e.g. rust `pub fn`/`impl`/`let mut`; python `def x(` / `from x import` / `self.`; js-ts `function x(` / `=>` / `const x =`; go `package main` / `func x(` / `:=`; powershell `Get-ChildItem` / `Write-Host` / `$PSVersionTable`; sh `#!/bin/…` / `set -e` / `echo`; sql `SELECT` / `FROM` / `WHERE`; ruby `def x` / `puts` / `require '…'`).
2. Score = number of markers matched; the highest score wins; ties keep the earlier entry of the fixed priority `c-sh → c-cpp → java → go → js-ts → swift → kotlin → rust → php → ruby → python → sql → powershell → sh → css → markdown → html-xml` (C-family ties are harmless — those scanners share semantics; Markdown and HTML/XML sit last because their shapes are the most generic).
3. **All-zero score → `null` → the text is returned unchanged (identity).** A wrong guess can therefore never corrupt prose, URLs, `#hashtags` or `#private` fields.

**`Auto-Multi-Language` (`runMulti`)** — for mixed-language pastes; strips comments **only inside detected code blocks**, everything else passes through byte-exact. Still cheap: one line split, per-line early-exit checks, one guess per block, one scanner pass per block — no character walks, no nested search.

1. **Fenced blocks first**: a ` ``` ` fence whose tag is in `FENCE_TAGS` (`python`, `rust`, `c`/`cpp`/`c++`, `cs`/`csharp`, `java`, `js`/`ts`/`javascript`/`typescript`, `css`, `html`/`xml`, `go`/`golang`, `php`, `sql`, `md`/`markdown`, `swift`, `kotlin`, `sh`/`shell`/`bash`, `powershell`/`pwsh`/`ps1`, `ruby`/`rb` → grammar) maps the block to that grammar; **unknown tags (e.g. `lua`) leave the block untouched**; the fence lines themselves are always preserved.
2. **Unfenced blocks**: maximal runs of *code-like* lines (`isCodeLine` — indentation, `;`/`{`/`}`/`=>`, `:=`, `#!/…` shebangs, `$var` (PHP/PowerShell), SQL keywords, `def `/`fn `/`func `/`class `/`public `… word starts, `fun ` (Kotlin), `#include`, tag-like `<word`/`</word`, `//`/`/*` markers, quote + `=`, plus JSDoc shapes: a line starting `*` or ending `*/` keeps multi-line block comments inside one run). A block needs **≥ 2 code-like lines** — a lone `# foo` line between prose lines is not code and stays untouched.
3. **Blank lines split a run into segments**; each segment of ≥ 2 code-like lines is guessed **independently** with `guessLanguage()` — so adjacent blocks in different languages (separated by a blank line) each keep their own grammar. `null` (zero markers) → segment untouched.

| Situation | Behaviour |
| --- | --- |
| `Auto` on text with zero markers (prose, URLs, hashtags) | **Identity** — text returned byte-identical. |
| `Auto-Multi-Language`: fenced block with an unknown tag (`lua`, `toml`, …) | Block **untouched**; fence lines preserved. |
| `Auto-Multi-Language`: unfenced region with < 2 code-like lines (e.g. a single `# foo` line in prose) | **Untouched**. |
| `Auto-Multi-Language`: segment inside a run with zero markers | Segment **untouched** (per-segment identity fallback). |
| Any explicit language value on a corrupt/unknown key (e.g. bad saved options) | Falls back to the `js-ts` scanner (never crashes). |

### 5.5 `remove-extra-space` — Remove extra space

`scripts/filters/remove-extra-space.js`. `text.replace(/\s+/g, " ").trim()` — collapses **every** run of spaces/tabs/newlines (in any context, including inside strings) to a single space, then trims. No options.

### 5.6 `regex-replace` — Regex find & replace

`scripts/filters/regex-replace.js`. `run(text, { pattern, replacement, flags })` (all three are strings; defaults all `""`):

- `pattern` empty → identity + status hint `no pattern — add one`.
- `new RegExp(pattern, flags)` throws → identity + status `invalid pattern` (the pipeline never crashes on a bad pattern).
- Otherwise `out = text.replace(re, replacement)` — **one pass**; replaced text is never re-scanned, so the replace is **loop-safe by construction** (pattern `a`, replacement `aX` on `aaa` → `aXaXaX`, no runaway re-matching). `$1`-style back-references work; an empty replacement deletes the match.
- Flags: the user's flags are sanitized to the set `[gim]` and `g` is forced, so every match is replaced in that single pass.
- Match count from `text.match(re)` → status `no match` or `N replacement(s)`.

The result is `{ text, meta }` — `meta` is the live per-card status line (rendered by `APM.recipe.setStatuses()`, see §4/§7); it **never** leaks into the output text. The card's three labeled text inputs (Pattern / Replacement / Flags) are rendered from the definition's `inputs` descriptor by the generic branch in `ui/recipe.js` and recompute live on every `input` event. `defaultOptions()` = `{ pattern: "", replacement: "", flags: "" }`; `status: true`.

## 6. Save model (hard vs soft)

Two deliberately separate persistence mechanisms, both in `localStorage` under the `apm.*` namespace (the legacy `prefixPresets` / `lastPrefix` keys of the old app are ignored, not migrated).

| | **Hard save** (Save button) | **Soft save** (automatic) |
| --- | --- | --- |
| Key | `apm.saves` — JSON map `name → snapshot` | `apm.lastState` — one snapshot |
| Shape | `{ version: 3, savedAt, name, prefix, recipe }` — **no `input` key and no `theme` key, by design** (v2 saves that carry a stray `theme` key still load — the key is simply ignored, no migration) | `{ version: 2, savedAt, prefix, input, recipe }` — **always includes the input text** |
| Written when | User clicks Save, names it (`prompt()`), confirms overwrite (`confirm()`) | Every state change → `APM.saves.persistSoon()`: **5 000 ms debounce** (`persistNow()`), plus an immediate flush on `pagehide` and `beforeunload` |
| Failure policy | Toast ("Saving failed (storage blocked?)") | **Non-critical**: `persistNow()` is wrapped in try/catch; a failed soft save never toasts or blocks — the app simply has less to resume |
| Effect of Load | `APM.state.restore(snap, { keepInput: true })` — prefix + recipe + options restored; **the input box and the theme are left exactly as-is** (v2 saves' stray `theme` key is ignored — a load never changes the theme) | N/A (only consumed at boot) |

**Load semantics** (`saves.js` Load handler):

| `#save-list` value | Effect |
| --- | --- |
| A saved name | Hard load: prefix + recipe + options restored; **input and theme untouched** (same `keepInput` path; v2 saves' `theme` key ignored), toast `Loaded “name”`. |
| Empty (`-- Load --`) | **Reset** prefix + recipe to the new-user defaults — prefix `""`, recipe `[Minify]` — via `APM.state.restore({prefix:"", recipe:[{id:"minify",options:{}}]}, {keepInput:true})`. **The input box AND the theme are left untouched** (user-directed 2026-08-17: the theme is an independent auto-saved setting, never part of a profile). Toast `Reset prefix + recipe (input + theme kept)`. The soft save then re-flushes the reset prefix/recipe together with the preserved input via the 5 s debounce (intended). |

**Boot priority** (`main.js`): a valid `apm.lastState` always wins → full resume (prefix + input + recipe, v1-shaped snapshots tolerated: missing `prefix` becomes `""`). Only a user with **no** soft save (brand-new browser profile) gets the first-run default: recipe **`[Minify]`**, empty prefix and input. Corrupt `apm.lastState` → `storage.get` returns `null` → same default path. No crash in any of these cases.

**Theme persistence** is independent of both saves: `apm.theme` (the theme name, `""` = default dark), written by `APM.theme.apply()`, read pre-paint in `index.html` and again by `theme.init()`. Profiles deliberately **do not** embed the theme — loading a save never changes the user's theme (user-directed 2026-08-17); v2 saves that do carry a `theme` key still load, with the key ignored.

### 6.1 Export / import saves as JSON

The **Export/Import** banner button opens a centred modal (`#save-modal`, markup in `index.html`, logic in `saves.js`):

- **Export view** — a readonly `<textarea>` pre-filled with `JSON.stringify(apm.saves)` (**minified**, no whitespace). Clicking/tapping the text (or the `Copy` button) auto-copies it via the shared `APM.dom.copyText` helper (clipboard API → `execCommand` fallback), toast `Copied N save(s)`.
- **`Download (.json)`** — `Blob` + `URL.createObjectURL` + a temp `a[download="ai-prompt-minifier-saves.json"]` (works on `file://` too); the object URL is revoked immediately after the click.
- **`Import…`** — the textarea becomes editable; **`Confirm import`** parses the JSON (failure → danger toast, nothing changes), validates each entry (name = trimmed string ≤ 80 chars; value = object with a `prefix` string and/or a `recipe` array of `{ id: known filter, options?: object }` — bad entries are **skipped** and counted), then asks **one always-confirm**: *“Import will REPLACE the saved profiles in this browser (N current save(s) will be removed). Continue?”* On accept, `apm.saves` becomes **exactly** the validated imported map (**wipe-replace**, no merge) and the save list refreshes; toast `Imported N save(s) (K skipped)`. **`Cancel`** discards the pasted text and restores the export view.
- Import **never touches the working state** (prefix/recipe/input) **or the theme** — it transfers the saved-profile list only. Close paths: `Close` button, overlay click, `Esc`.

### 6.2 Collapsed left columns (UI state)

`apm.ui.leftCollapsed` — a JSON boolean in `localStorage`, written **immediately** on toggle by `APM.leftpane.toggle()` (see §7); **absent = expanded = the new-user default**. It is purely local UI state: never part of a hard save or a soft save, and loading a profile never changes it.

While collapsed, both left columns are 44 px icon rails and column 3 absorbs the freed space. Hovering either collapsed column peeks the **recipe** (pure CSS `:hover`/`:focus-within`, no timers) in **settings-only** mode: option values (selects/inputs) stay fully editable, but the `×` delete buttons, the drag handles and **Clear** are hidden and the recipe `dragstart` is guarded off in `recipe.js` — no add/remove/reorder mid-session. The rail look and the hover-peek are the `Collapsed left columns` block in `styles/style.css`; the module only flips `#workspace.left-collapsed` and persists the key.

## 7. Public API (`window.APM`)

Every public function per module, with signature and behaviour. Nothing else is exposed.

### `APM.dom` — `scripts/core/dom.js`
| Function | Behaviour |
| --- | --- |
| `$(id)` | `document.getElementById(id)` shorthand. |
| `el(tag, className, text)` | Creates an element; sets `className` when given; sets `textContent` (never innerHTML) when `text` is non-null. |
| `copyText(text)` | Shared clipboard helper (output Copy button + export modal): `navigator.clipboard.writeText` in secure contexts, otherwise `execCommand("copy")` via a temporary textarea; resolves `true`/`false` — callers own the toasts. |

### `APM.storage` — `scripts/core/storage.js`
| Function | Behaviour |
| --- | --- |
| `get(key)` | `localStorage.getItem` + `JSON.parse`, **any** failure (blocked storage, bad JSON) → `null`. |
| `set(key, value)` | `JSON.stringify` + `setItem`; returns `true`/`false`, never throws. |

### `APM.state` — `scripts/core/state.js`
Public fields: `prefix` (string), `input` (string), `recipe` (array of `{ id, options }`, ordered).
| Function | Behaviour |
| --- | --- |
| `snapshot()` | Fresh `{ version: 2, savedAt, prefix, input, recipe }` with recipe entries **copied** (safe to mutate). |
| `restore(snap, opts)` | Applies a snapshot to state + DOM. `opts.keepInput` (hard-load): leaves `state.input` and `#input` untouched. Missing `prefix` → `""`. Unknown filter ids dropped; missing `options` → `defaultOptions()`. Re-renders recipe and recomputes. |

### `APM.toast` — `scripts/core/toast.js`
| Function | Behaviour |
| --- | --- |
| `show(message, isError)` | Sets `#toast` text, toggles the `.error` class, fades after 2 s (timer shared — last call wins). |

### `APM.filters` — `scripts/filters/registry.js`
| Function | Behaviour |
| --- | --- |
| `register(id, def)` | Stores a filter definition; **throws on duplicate id** (fail-fast at load time). Insertion order = palette order. |
| `get(id)` | Definition or `null`. |
| `ids()` | Registered ids in insertion order. |
| `run(text, recipe)` | Runs the recipe in order through each filter's `run(text, options)`; tolerates string or `{text, truncated}` results; unknown ids skipped; returns `{ text, truncated, metas }` — `metas` is `[]` when no filter reported a `meta`, otherwise `{ index, meta }` pairs for `APM.recipe.setStatuses()`. |

### `APM.recipe` — `scripts/ui/recipe.js`
| Function | Behaviour |
| --- | --- |
| `render()` | Rebuilds `#rec-list` cards from `state.recipe` (head with drag handle/name/delete, description, options per §4). Toggles `#recipe-empty`. |
| `add(id, at)` | Inserts a card with fresh `defaultOptions()` at index `at` (clamped; default = end); re-renders + recomputes. |
| `move(from, to)` | Reorders (removal-shift aware); no-op when `from === to`; re-renders + recomputes. |
| `remove(index)` | Deletes one card; re-renders + recomputes. |
| `setStatuses(metas)` | Live per-card status lines (only cards whose def has `status: true`): clears every `.rec-status` element, then applies the fresh `metas` with a tone — `err` (`invalid pattern`), `ok` (`N replacement(s)`), `none` (hint / no match). Called from `APM.io.recompute()`. |
| `init()` | Wires the **Clear** button (confirm → empty recipe → re-render + recompute). |

### `APM.palette` — `scripts/ui/palette.js`
| Function | Behaviour |
| --- | --- |
| `render(query)` | Rebuilds the filter list from `APM.filters.ids()` filtered by `query` (name+desc substring, case-insensitive); each item: draggable, `tabIndex=0` + `role=button` + aria-label, double-click add, Enter/Space add; updates the count + "no match" hint. |
| `init()` | Wires the search box to `render`. |

### `APM.dnd` — `scripts/ui/dnd.js`
| Function | Behaviour |
| --- | --- |
| `setState(s)` | Records the active drag: `{ from: "palette", id }` or `{ from: "recipe", index }`. Called by palette/recipe `dragstart`. |
| `getState()` | Current drag state (or `null`). |
| `clearState()` | Resets to `null`. |
| `clearIndicator()` | Removes the `.drop-indicator` node if present. |
| `init()` | Wires the recipe list's `dragover` (preventDefault + indicator placement by cursor midpoint) / `dragleave` / `drop` (insert vs reorder), plus global guards: `dragend` cleanup and blocking `Files` drops so dropped files never navigate the page away. |

### `APM.leftpane` — `scripts/ui/leftpane.js`
| Function | Behaviour |
| --- | --- |
| `init()` | Applies the saved collapse state (`apm.ui.leftCollapsed === true` → `#workspace.left-collapsed`; absent = expanded = new-user default), wires `#left-toggle`, syncs the button. |
| `toggle()` | Flips `#workspace.left-collapsed`, persists `apm.ui.leftCollapsed` **immediately** (best-effort), updates the button glyph (`«`/`»`), title and `aria-pressed`. |
| `isCollapsed()` | Class check on `#workspace`; used by the `recipe.js` `dragstart` guard (no reorder while collapsed). |

### `APM.io` — `scripts/ui/io.js`
| Function | Behaviour |
| --- | --- |
| `recompute()` | `combinedText()` (prefix+input join) → `APM.filters.run` → writes `#output`, the three char counters, the truncated badge; hands `result.metas` to `APM.recipe.setStatuses()`; then `APM.saves.persistSoon()`. Called after every state change. |
| `init()` | Wires `#prefix`/`#input` input events, Clear-prefix, Clear-input, and Copy-output (via the shared `APM.dom.copyText`). |

### `APM.saves` — `scripts/ui/saves.js`
| Function | Behaviour |
| --- | --- |
| `refresh()` | Rebuilds the `#save-list` dropdown from `apm.saves` (sorted names, `-- Load --` placeholder). |
| `init()` | Wires Save (`prompt()` name → v3 hard snapshot into `apm.saves`, overwrite `confirm()`), Load (named hard-load per §6 — input and theme untouched; empty selection = reset prefix + recipe, **input + theme kept**), Delete (confirm → remove), the `pagehide` + `beforeunload` → `persistNow()` flush, and the export/import modal (open / copy / download / confirm-import per §6.1). |
| `persistNow()` | Writes the soft snapshot (`state.snapshot()`) to `apm.lastState`. **Never throws** (internal try/catch) — non-critical by contract. |
| `persistSoon()` | Resets/starts the 5 000 ms debounce that ends in `persistNow()`. |

### `APM.theme` — `scripts/ui/theme.js`
| Function | Behaviour |
| --- | --- |
| `init()` | Applies the saved theme (`apm.theme`, validated), syncs the select, wires the change handler. |
| `apply(name)` | Validate against the known set → set `documentElement.className`, persist `apm.theme`, sync the select, toast. Invalid names silently fall back to the default (dark). |
| `current()` | Theme name currently on `<html>` (`""` = default dark). |
| `names` | The known themes map: `"" → Dark`, `light → Light`, `midnight → Midnight`, `paper → Paper`. |

### `scripts/main.js` — boot (no exported surface)
Runs the boot sequence of §3.2. Nothing else.

## 8. How to add a new filter (walkthrough)

This is the verified procedure. Follow the steps literally; each one is what the existing six filters do.

1. **Create the file** `scripts/filters/<your-filter>.js` with the standard IIFE shape:

   ```js
   (function (APM) {
       "use strict";

       function yourTransform(text) {
           // pure string → string (or { text, truncated })
           return text;
       }

       if (!APM.filters || typeof APM.filters.register !== "function") {
           throw new Error("your-filter: scripts/filters/registry.js must be loaded first");
       }
       APM.filters.register("your-filter", {
           name: "Your filter",
           desc: "One line shown in the palette and on the card.",
           run: function (text) {
               return yourTransform(text);
           },
           defaultOptions: function () {
               return {};           // fresh object per call; add keys for options
           }
       });
   })(window.APM = window.APM || {});
   ```

2. **Wire it into `index.html`** — add one script tag **after `scripts/filters/registry.js`** (relative position among the filter files only affects palette order):

   ```html
   <script src="scripts/filters/your-filter.js"></script>
   ```

3. **Options (optional).** For dropdown options, declare a `selects` array on the definition — the generic renderer in `ui/recipe.js` picks it up automatically (this is how `remove-comment`'s language dropdown works):

   ```js
   selects: [
       { key: "language", label: "Language:", choices: [
           { value: "js-ts", label: "JS/TypeScript" },
           { value: "python", label: "Python" }
       ] }
   ],
   ```

   Keep `choices` already in the order you want (the renderer does not sort). The `limit` preset dropdown is a bespoke branch that only `limit` uses — don't try to reuse it; `selects` is the general mechanism.

   For text-input options, declare an `inputs` array (the generic renderer builds one labelled text input per descriptor, updating `options[key]` and recomputing live on every keystroke — this is how `regex-replace`'s Pattern / Replacement / Flags work):

   ```js
   inputs: [
       { key: "pattern", label: "Pattern:", placeholder: "e.g. \\s+" }
   ],
   status: true,   // optional: gives the card a live status line fed by run()'s meta
   ```

   With `status: true`, `run()` may return `{ text, meta }` — `meta` is a short string (e.g. `"no match"`, `"2 replacements"`, `"invalid pattern"`) that `APM.recipe.setStatuses()` renders under the card; it never reaches the output text.

4. **Palette and recipe are automatic.** `palette.render()` lists `APM.filters.ids()` (insertion order); dragging/double-clicking the new item calls `recipe.add(id)` which builds the card from `name`/`desc`/`defaultOptions()`/`selects`. Nothing else to wire — the pipeline runner (`APM.filters.run`) picks the filter up by id, and saves/resume work because they only store `{ id, options }`.

5. **Verify.**
   - `node --check scripts/filters/your-filter.js` (syntax; catches comment-delimiter bugs inside strings/comments).
   - Open the app (double-click `index.html`, or `python -m http.server` + browser): the filter appears in column 1, add it, run pinned input→output vectors, confirm the output changes as designed and that an empty input stays empty.
   - Remember the pipeline runs top-to-bottom and options must round-trip through a hard save (Save → Load).

## 9. Themes & design tokens

Four self-designed palettes in `styles/style.css`, switched by a class on `<html>` (dark is the classless default). Every component colour in the app references only these tokens — no raw hex outside the palette blocks.

| Token | Meaning (dark default) |
| --- | --- |
| `--bg` | Page background (`#121212`) |
| `--pane` | Column background (`#181818`) |
| `--panel` | Panels, input background (`#242424`) |
| `--panel-2` | Secondary panels (output, hover states) (`#2a2a2a`) |
| `--title-bg` | Pane title bars (`#1e1e1e`) |
| `--border` / `--border-soft` | Column separators / softer borders (`#444444` / `#333333`) |
| `--text` / `--text-soft` | Primary / secondary text (`#e0e0e0` / `#cccccc`) |
| `--muted` / `--faint` | Muted labels / faintest text (`#aaaaaa` / `#777777`) |
| `--input-bg` / `--placeholder` | Form controls / placeholder text (`#333333` / `#777777`) |
| `--accent` / `--accent-hover` | Buttons, active states (`#0d6efd` / `#0b5ed7`) |
| `--success` / `--danger` | Toast success / error (`#28a745` / `#dc3545`) |
| `--on-accent` | Text on accent buttons (`#ffffff`) |
| `--shadow` | Toast shadow |
| `--focus-ring` | `:focus-visible` outline (each palette: `var(--accent)`) |

Palettes: `:root` (Dark, the exact colour language of the original single-file app), `:root.light`, `:root.midnight`, `:root.paper`. Persistence: `apm.theme`; pre-paint apply in `index.html`; runtime switch via `APM.theme.apply()`.

## 10. Verification & development notes

- **Syntax**: `node --check <file>` on every JS file (all 19 pass).
- **Browser battery**: verified over `http://127.0.0.1:8765` (a plain `python -m http.server 8765 --bind 127.0.0.1`) **and** `file://`; fresh browser contexts per case; zero console errors; network = local files only (index + css + 19 js, plus `manifest.json` and the PWA icons when the browser fetches them).
- **Pinned vectors** (regression anchors — do not "fix" them):
  - minify legacy quirk: `a "b" c` → `a"b"c`; `"a"   "b"` → `"a""b"`.
  - strip-html: `<div class="a">Hi&nbsp;&amp;&lt;x&gt;</div><!-- c -->` → `" Hi &<x>  "`.
  - limit: default preset `390000`; `1234` custom truncates a 2 000-char input to exactly 1 234 chars + badge.
  - remove-comment: 13 pinned per-language vectors (strings opaque, Rust nesting, CSS `//` kept) — see the T8.3 entry in `.agent-state/EXECUTION_LOG.md`; plus the M9 `Auto` vectors (per-language guess + zero-marker identity) and `Auto-Multi-Language` block vectors (fenced tag map, unknown tag untouched, <2-line segments untouched) — see the T9.1/T9.2 entries.
  - M10: 17-language vectors (Go / PHP / SQL / Markdown / Swift / Kotlin / sh / PowerShell / Ruby — string opacity, shebang, word-start `--`, line-scoped `=begin`/`=end`, nested blocks), 17-language `Auto`-guess vectors, unknown-fence-tag identity (`lua`/`toml`), and the regex-replace pins — loop-safety (`a`→`aX` on `aaa` = `aXaXaX`), `\s+`→` ` collapse, `no match`/invalid-pattern identity — see the M10 entry in `.agent-state/EXECUTION_LOG.md`.
- **Testing gotchas** (learned the hard way, kept for the next session):
  - Long-lived automation page contexts can return corrupted one-shot values — run contract checks in **fresh contexts**.
  - Browser heuristic caching can serve stale script files — clear the browser cache and reload if behaviour disagrees with disk.
  - Logging a live reference into a result object then mutating it produces "impossible" values — copy values at capture time.
  - `prompt()`/`confirm()` auto-respond under automation; stub `window.prompt` in-page to drive the named-save path.
  - Seeding `localStorage` must happen on a real app page (same origin) — `about:blank` throws `SecurityError`; and seed on a *separate* page from the one you boot, so the old page's `pagehide` flush can't overwrite your seed.
- **Performance headroom**: 105k-char payloads complete in ~3–7 ms across recipe orders (single-pass char scanners, linear regex passes). No async/chunking needed.
