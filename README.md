# AI Prompt Minifier

***Entire project are Vibe coded except this line of text***

A standalone, client-side web tool for minifying AI prompts. It is a small CyberChef-style workspace: paste a prompt (with an optional system-prompt prefix), build an ordered pipeline of six filters, and copy the compact result — reducing token usage while preserving code structure, required spacing between identifiers, and exact string contents.

Perfect for preparing long system prompts + code/examples for models with context limits (e.g., Claude, GPT-4, Gemini, etc.).

## Layout

Three columns, like a recipe kitchen:

1. **Filters** (left) — the available operations, searchable. Drag one into the recipe, double-click it, or focus it and press Enter to add it.
2. **Recipe** (middle) — the filters currently applied, in order. Drag a card by its head to reorder, remove it with `×`, or remove everything with **Clear**. The top card runs first.
3. **Prefix / Input / Output** (right) — a compact **System Prompt / Prefix** box on top, then Input, then Output on the bottom. The output updates live as you type or edit the recipe, with character counts and a `truncated` badge when a length limit cuts the result.

### The prefix (optional)

The **System Prompt / Prefix** pane holds the text you want placed *above* your input in the final output — e.g. "You are a helpful expert. Always respond with valid code...". It is joined to the input with a single newline before the recipe runs (`prefix + "\n" + input`); leave it empty and the output is byte-identical to running the input alone. It has its own char count and **Clear** button, and it is part of both the hard saves and the auto-resume (see below).

## Filters (six, in palette order)

- **Minify** — intelligent whitespace minify (the original default behaviour). Double-quoted strings stay 100% intact; outside strings, whitespace collapses to at most one space, and that space is only kept when both neighbours are word characters — so `x   =   1 ;` becomes `x=1;` while `a b` stays `a b`.
- **Output length limit** — truncates the result to a maximum number of characters. The card has a dropdown with presets (10,000 / 32,000 / 100,000 / 200,000 / 390,000 chars, 390,000 being the default) plus a Custom option with a number input.
- **Strip HTML** — removes HTML comments and tags and decodes the common entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;`, numeric `&#123;` / `&#x1F;`). A lone `&` that is not an entity is left alone.
- **Remove comments** — removes line and block comments, string-aware (a `//` in a URL, a `#` inside a Python string, or `/* */` inside a CSS `content:` value are never touched). Each removed comment becomes exactly one space (pair with Minify or Remove extra space to tidy that). Rust block comments nest; JS/TS template literals are treated as raw, so `${...}` contents are not parsed (documented limitation). The card's language dropdown has:
  - **Auto (default)** — guesses which language the text is from a handful of distinctive syntax markers, then strips with that grammar; when it finds no code markers at all it leaves the text **completely unchanged**, so prose, URLs and `#hashtags` can never be corrupted.
  - **Auto-Multi-Language** — for pastes that mix languages: fenced ` ```lang ` blocks are stripped per their tag (unknown tags left alone), and unfenced runs of at least two code-like lines are each guessed and stripped separately. Everything that isn't clearly code passes through byte-exact, and the detection stays cheap (line-level checks only, no complex search).
  - The **17 explicit languages**, A→Z: **C#, C/C++, CSS, Go, HTML/XML, Java, JS/TypeScript, Kotlin, Markdown, PHP, PowerShell, Python, Ruby, Rust, sh/bash, SQL, Swift** — for when you want to pick the grammar yourself. A few per-language behaviours worth knowing: sh/bash keeps a leading `#!` shebang line (code, not a comment); SQL `--` only opens a comment at a word boundary (`1--2` stays data); Ruby `=begin … =end` counts only at line start; Swift and Kotlin block comments nest; PowerShell supports `<# … #>`; Markdown strips *only* `<!-- … -->` (headings and code fences stay byte-exact).
- **Remove extra space** — collapses *every* run of spaces, tabs and newlines to a single space, in any context (even inside strings), then trims. `a   b\n\n  c` → `a b c`.
- **Regex find & replace** — replaces every match of a JavaScript regular expression with a replacement string. The card has three inputs: **Pattern**, **Replacement**, **Flags** (`i`, `m` — `g` is automatic). It runs in a single, loop-safe pass (replaced text is never re-scanned), `$1` back-references work, an empty replacement deletes the match, and an invalid pattern leaves the text unchanged. A live status line under the card shows `no pattern — add one`, `no match`, `N replacement(s)`, or `invalid pattern`.

Order matters: the recipe runs top to bottom, so `Minify → Strip HTML` and `Strip HTML → Minify` can give different results. Pick the order that matches your prompt.

## Themes

Dark is the default (the original colour scheme). The top bar switches between four self-designed palettes — **Dark / Light / Midnight / Paper** — and the choice is remembered per browser.

## Save / load (local)

There are two deliberately separate save mechanisms, both in your browser's `localStorage`:

- **Save** (hard save) — stores your **prefix + recipe (including each card's option values)** under a name. It deliberately does **not** include the input text, and it does **not** include the theme: **Load** restores the prefix and recipe and leaves whatever you have in the input box — and the theme you currently have — exactly as it is. (Older saves that still carry a theme load fine; the theme is simply ignored.) **Load / Delete** work on the named saves via the top-bar dropdown.
  - **Load with `-- Load --` selected** (the empty top option) = a reset: prefix and recipe go back to the first-visit defaults (empty prefix, **Minify** in the recipe) while your **input box and theme are left exactly as they are** — the same input-safe path a normal load uses.
- **Auto-resume** (soft save) — always on. Your working state, **including the input text**, is saved about **5 seconds after your last change** and again when you close the tab. It is best-effort by design: if the save fails (e.g. blocked storage), the app just has less to resume — nothing breaks.
- **Theme** — independent of both. Your theme choice is auto-saved on its own and resumes on the next visit; loading or resetting a profile never changes it.

**When you open the app:** if a soft save exists it always wins — you resume exactly where you left off (prefix, input, recipe, options). Only a first-time visitor (no saved state at all) starts with **Minify** in the recipe and empty panes — the original app's default behaviour.

### Export / import saves (JSON)

The **Export/Import** button opens a popup with your whole save list as minified JSON: click the text (or press **Copy**) to copy it, or **Download (.json)** to save it as `ai-prompt-minifier-saves.json`. To import, click **Import…**, paste a JSON map of saves, then **Confirm import** — you are always asked first, because importing **replaces** the saved profiles in this browser (invalid entries are skipped and reported in the toast). Importing never touches your current prefix, input, recipe or theme.

### Collapse the left columns

Once your recipe is set up, the **`«`** button in the top bar collapses the Filters and Recipe columns into slim icon rails, giving the prefix/input/output area more room. Hover a collapsed column to peek the recipe: option values stay editable, but adding, removing or reordering filters is switched off — that's the point (you're set up for a long session). Click **`»`** to expand again. The expanded/collapsed choice is remembered per browser, is **not** part of any save profile, and new users start expanded.

Everything stays on your machine: no server, no accounts, no network calls.

## How to Use

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari) — double-clicking the file is enough; it works fully offline.
2. Optionally type a system prompt into the **Prefix** box — it will appear above your input in the output.
3. Paste your prompt into the **Input** pane: system instructions, code, JSON, examples...
4. **Minify** starts in the recipe by default (for first-time visitors — returning visitors resume their saved state), so the output is minified live as you type.
5. Add **Output length limit**, **Strip HTML**, **Remove comments**, **Remove extra space** or **Regex find & replace** from the left column when needed, and reorder the cards to change the pipeline order.
6. Click **Copy** in the Output pane and paste into your AI chat.

## Files

| File                                    | Role                                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| `index.html`                            | Page structure + a tiny pre-paint theme bootstrap + PWA head tags (only HTML file) |
| `styles/style.css`                      | All styling; the four theme palettes as CSS custom properties (incl. collapse-rail + modal rules) |
| `manifest.json`                         | PWA manifest (standalone, `#121212`, 192 + 512 icons) — no service worker, by design |
| `icons/icon-192.png`                    | PWA icon, exactly 192×192 (the favicon glyph)                     |
| `icons/icon-512.png`                    | PWA icon, exactly 512×512 (same design rendered at size)          |
| `scripts/main.js`                       | Boot: wires the modules together, restores the last state (loaded last) |
| `scripts/core/dom.js`                   | Tiny DOM helpers (`$`, `el`, shared `copyText` clipboard helper)  |
| `scripts/core/storage.js`               | Throw-safe `localStorage` JSON read/write                          |
| `scripts/core/state.js`                 | Shared working state (`prefix`, `input`, `recipe`) + snapshot/restore |
| `scripts/core/toast.js`                 | The top-centre toast notifications                                 |
| `scripts/filters/registry.js`           | Filter registry + the ordered pipeline (loaded first among filters) |
| `scripts/filters/minify.js`             | **Minify** filter (string-aware whitespace collapse)               |
| `scripts/filters/output-length-limit.js`| **Output length limit** filter + its card presets (10k…390k, custom) |
| `scripts/filters/strip-html.js`         | **Strip HTML** filter (comments, tags, entities)                   |
| `scripts/filters/remove-comment.js`     | **Remove comments** filter (17-language grammar + string-aware scanner + Auto modes) |
| `scripts/filters/remove-extra-space.js` | **Remove extra space** filter (collapse all whitespace runs)       |
| `scripts/filters/regex-replace.js`      | **Regex find & replace** filter (loop-safe single-pass replace + live match state) |
| `scripts/ui/theme.js`                   | Theme switch + `apm.theme` persistence (independent of save profiles) |
| `scripts/ui/palette.js`                 | Filter palette: search, drag / double-click / keyboard add          |
| `scripts/ui/recipe.js`                  | Recipe cards, per-card options (selects + live text inputs), add / remove / reorder, live status lines |
| `scripts/ui/dnd.js`                     | Drag & drop state + the drop indicator                              |
| `scripts/ui/leftpane.js`                | Collapse toggle for the left columns (`apm.ui.leftCollapsed`)      |
| `scripts/ui/io.js`                      | Live recompute (prefix + input → recipe), counters, status hand-off, copy, clear |
| `scripts/ui/saves.js`                   | Top-bar Save / Load / Delete + debounced auto-resume (soft save) + the export/import JSON modal |

Documentation: this `README.md` (user-facing), [`DOCS.md`](DOCS.md) (technical: architecture, every public function, save model, how to add a filter), [`SUGGESTION.md`](SUGGESTION.md) (scope overview + future-work ideas).

### Code layout

The JavaScript is a set of small plain `<script>` files — **not ES modules** — loaded in document order at the end of `<body>`, each attaching its part to one shared `window.APM` namespace (`APM.dom`, `APM.filters`, `APM.recipe`, …). That keeps the double-click workflow intact: browsers block module scripts on `file://` pages, but classic scripts run fine there. No bundler, no build step, no dependencies.

## Notes

- Pure HTML/CSS/JS — no build step, no external libraries, no network requests.
- **Installable (PWA)**: `manifest.json` + icons let you install it as an app on desktop and mobile. There is deliberately **no service worker** — the app is already fully offline and works straight from `file://`.
- All saved data lives in `localStorage` under the `apm.*` keys (`apm.theme`, `apm.saves`, `apm.lastState`, `apm.ui.leftCollapsed`); clearing site data removes it.
- Keyboard-friendly: every action is reachable without a mouse (Tab to a filter, Enter/Space to add; buttons and selects work as expected), with a visible focus ring.
