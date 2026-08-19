# AI Prompt Minifier

A standalone, client-side web tool for minifying AI prompts. It is a small CyberChef-style workspace: paste a prompt (with an optional system-prompt prefix), build an ordered pipeline of nine filters, and copy the compact result — reducing token usage while preserving code structure, required spacing between identifiers, and exact string contents.

Perfect for preparing long system prompts + code/examples for models with context limits (e.g., Claude, GPT-4, Gemini, etc.).

## Layout

Three columns, like a recipe kitchen:

1. **Filters** (left) — the available operations, searchable (by name, description, or detail keywords), listed **in name order (A→Z)**. Drag one into the recipe, double-click it, or focus it and press Enter to add it.
2. **Recipe** (middle) — the filters currently applied, **in the order you set** — drag a card by its head to reorder, remove it with `×`, or remove everything with **Clear**. The top card runs first; order matters (filters are not commutative).
3. **Prefix / Input / Output** (right) — a compact **System Prompt / Prefix** box on top, then Input, then Output on the bottom. The output updates live as you type or edit the recipe, with **character and token (`≈ N tok`) counts** and a `truncated` badge when a length limit cuts the result. Each pane's title bar also shows its **line count** (`N ln`), and while a pane is focused its **cursor position** (`Ln X, Col Y`) or the **selected range** (`Ln A, Col A – Ln B, Col B · K ch`) — handy for pointing at a specific line or snippet.

The three-column layout and its interactions are inspired by **CyberChef** — a layout/interaction reference only: **zero code was copied**; every line of this project was written for it.

### The prefix (optional)

The **System Prompt / Prefix** pane holds the text you want placed *above* your input in the final output — e.g. "You are a helpful expert. Always respond with valid code...". **The prefix is never minified**: the recipe runs on your *input only*, and the raw prefix is then placed in front of the result — `prefix + "\n" + minified(input)` (input empty → just the prefix; prefix empty → byte-identical to running the input alone). Multiple spaces and blank lines inside the prefix survive exactly as typed. It has its own char + token counts and a **Clear** button (which asks before clearing), and it is part of both the hard saves and the auto-resume (see below).

## Filters (nine; the palette lists them in name order)

- **Minify** — intelligent whitespace minify (the original default behaviour). Double-quoted strings stay 100% intact; outside strings, whitespace collapses to at most one space, and that space is only kept when both neighbours are word characters — so `x   =   1 ;` becomes `x=1;` while `a b` stays `a b`.
- **Output length limit** — truncates the result to a maximum length, in **characters (exact)** or **estimated tokens** (a built-in heuristic tokenizer — the card's first dropdown picks the unit; "Characters (exact)" is the default and behaves exactly like the old version). Then a presets dropdown (10,000 / 32,000 / 100,000 / 200,000 / 390,000, 390,000 being the default) plus a Custom option with a number input. Token mode cuts at a whole-word boundary, so it never splits a token.
- **Strip HTML** — removes HTML comments and tags and decodes the common entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;`, numeric `&#123;` / `&#x1F;`). A lone `&` that is not an entity is left alone.
- **Remove comments** — removes line and block comments, string-aware (a `//` in a URL, a `#` inside a Python string, or `/* */` inside a CSS `content:` value are never touched). Each removed comment becomes exactly one space (pair with Minify or Remove extra space to tidy that). Rust block comments nest; JS/TS template literals are treated as raw, so `${...}` contents are not parsed (documented limitation). The card's language dropdown has:
  - **Auto (default)** — guesses which language the text is from a handful of distinctive syntax markers, then strips with that grammar; when it finds no code markers at all it leaves the text **completely unchanged**, so prose, URLs and `#hashtags` can never be corrupted.
  - **Auto-Multi-Language** — for pastes that mix languages: fenced ` ```lang ` blocks are stripped per their tag (unknown tags left alone), and unfenced runs of at least two code-like lines are each guessed and stripped separately. Everything that isn't clearly code passes through byte-exact, and the detection stays cheap (line-level checks only, no complex search).
  - The **19 explicit languages**, A→Z: **C, C#, C++, CSS, Go, HTML/XML, Java, JS/TypeScript, JSON, Kotlin, Markdown, PHP, PowerShell, Python, Ruby, Rust, sh/bash, SQL, Swift** — for when you want to pick the grammar yourself. **JSON** strips `//` and `/* … */` comments (i.e. it treats the input as JSONC). A few per-language behaviours worth knowing: sh/bash keeps a leading `#!` shebang line (code, not a comment); SQL `--` only opens a comment at a word boundary (`1--2` stays data); Ruby `=begin … =end` counts only at line start; Swift and Kotlin block comments nest; PowerShell supports `<# … #>`; Markdown strips *only* `<!-- … -->` (headings and code fences stay byte-exact).
- **Remove emoji** — removes emoji; each maximal emoji sequence (a base emoji plus attached skin tones, variation selectors, keycaps, flag pairs, or ZWJ-joined families like 👨‍👩‍👧) becomes exactly one space, and text without emoji passes through byte-identical — so `a 😀 b` → `a b` (with the extra space left for Minify/Remove extra space to tidy). No options.
- **Remove extra space** — collapses *every* run of spaces, tabs and newlines — in **any** context (even inside strings) — to **N spaces**, then trims. The card's **Spaces:** option sets N: default **1** (`a   b\n\n  c` → `a b c`), **2**, **3**, … or **0** to remove every whitespace character entirely (`a\n\n  b\t c` → `abc` — the "giant blob"). Pair with Minify if you want string-aware behaviour instead.
- **Regex find & replace** — replaces every match of a JavaScript regular expression with a replacement string. The card has three inputs: **Pattern**, **Replacement**, **Flags** (`i`, `m` — `g` is automatic). It runs in a single, loop-safe pass (replaced text is never re-scanned), `$1` back-references work, an empty replacement deletes the match, and an invalid pattern leaves the text unchanged. A live status line under the card shows `no pattern — add one`, `no match`, `N replacement(s)`, or `invalid pattern`.
- **Code minify** — language-aware whitespace minify for **20 languages**: **Bash, C, C#, C++, CSS, Go, HTML, Java, JavaScript, JSON/JSONC, Kotlin, Markdown, PHP, PowerShell, Python, Ruby, Rust, SQL, Swift, TypeScript**. In every language, strings (and template literals / regex literals / HTML raw-text content — the insides of `pre`, `textarea`, `script`, `style` — and C# verbatim `@"…"`, interpolated `$"…"` and raw `"""…"""` strings) stay 100% byte-exact; outside them, whitespace runs collapse to at most one space (kept only between word-ish neighbours) and the result is trimmed. Markdown keeps code fences byte-exact (both modes). **JSON** has no comments by contract — but turn **Remove comments** on and it minifies **JSONC** (`//` + `/* … */` are stripped, strings byte-exact; the collapsed output still parses). The card has a **Language** dropdown — **Auto** (default; guesses among all 20 supported languages from distinctive syntax markers and leaves unsure text completely unchanged, so prose, URLs and `#hashtags` are never corrupted), then the 20 languages A→Z — a **Version** dropdown that follows the selected language — **C#** shows **9 options** (`Auto (latest)` + **C# 12 … C# 5** — `Auto`/latest keeps everything, `C# 6…10` drop C#11 raw strings, `C# 5` also drops interpolated strings), while every other language — including **Auto** — shows a single **`Auto (latest)`** option — and a **Remove comments** checkbox (on by default; off keeps comment spans byte-exact). Two more checkboxes appear **only for their language**: for **JSON**, value-level compaction — **Remove null**, **Remove empty object `{}`**, **Remove empty array `[]`**, **Remove empty string `""`** (all off by default; when any is on, the collapsed JSON is parsed, cleaned bottom-up so cascades like `{"a":{"b":null}}` resolve, and re-serialized — `0`/`false` are never dropped, and unparseable input is left as the collapsed text); and for **Markdown**, **Remove all style (keep text only)** — drops headings, blockquotes, list markers, tables, emphasis, links, inline code, strikethrough, HTML comments and raw tags while keeping the text (code-fence contents stay byte-exact, so `snake_case` and `3 * 4` are never touched). Regression-tested against the real Zeal docset corpus **and the dotnet C# docs corpus** (per-language comment stripping, string safety, Auto-guess accuracy, and multi-hundred-KB corpus runs well under the 2 s budget).
- **Duplicate line dedup** — removes **exact duplicate lines**, or **exact duplicate blocks** (maximal runs of consecutive non-blank lines), keeping the first occurrence and counting what it dropped on the card (`N duplicate line(s)/block(s) removed`, or `no duplicate …` when clean). Matching is byte-exact (no trimming, no case-insensitivity — a CRLF line is not the same as its LF twin). The card has a **Mode** dropdown (**Lines** / **Blocks**) and an **Ignore blank lines** checkbox (on by default): in Lines mode blank lines are never deduped; in Blocks mode a removed duplicate block also eats one neighbouring blank separator so the paragraph rhythm stays sane.

Order matters: the recipe runs top to bottom, so `Minify → Strip HTML` and `Strip HTML → Minify` can give different results. Pick the order that matches your prompt.

## Themes

Dark is the default (the original colour scheme). The top bar switches between four self-designed palettes — **Dark / Light / Midnight / Paper** — and the choice is remembered per browser.

## Save / load (local)

There are two deliberately separate save mechanisms, both in your browser's `localStorage`:

- **Save** (hard save) — stores your **prefix + recipe (including each card's option values** — e.g. the limit's unit + preset, the Spaces count, each language dropdown and the Remove-comments toggle — **and they all round-trip through Save → Load)** under a name. It deliberately does **not** include the input text, and it does **not** include the theme: **Load** restores the prefix and recipe and leaves whatever you have in the input box — and the theme you currently have — exactly as it is. (Older saves that still carry a theme load fine; the theme is simply ignored.) **Load / Delete** work on the named saves via the top-bar dropdown.
  - **Load with `-- Load --` selected** (the empty top option) = a reset: prefix and recipe go back to the first-visit defaults (empty prefix, **Minify** in the recipe) while your **input box and theme are left exactly as they are** — the same input-safe path a normal load uses.
- **Auto-resume** (soft save) — always on. Your working state, **including the input text**, is saved about **5 seconds after your last change** and again when you close the tab. It is best-effort by design: if the save fails (e.g. blocked storage), the app just has less to resume — nothing breaks.
- **Theme** — independent of both. Your theme choice is auto-saved on its own and resumes on the next visit; loading or resetting a profile never changes it. Your **column widths**, **pane heights** (and the hover-peek width) are the same kind of independent per-browser settings — remembered on their own, never part of a profile.

**When you open the app:** if a soft save exists it always wins — you resume exactly where you left off (prefix, input, recipe, options). Only a first-time visitor (no saved state at all) starts with **Minify** in the recipe and empty panes — the original app's default behaviour.

**Upgraded from the old version?** Your old prefix saves come with you, automatically: on the first open of the new version, every old **prefix preset** (the `prefixPresets` list) is carried across into the **Save/Load** dropdown as a normal save (recipe = **Minify**, which is what the old app always applied), and your **last-used prefix** resumes in the Prefix box (unless you already have a non-empty working state here). Existing saves with the same name are always kept — nothing of yours is clobbered — and the old storage keys are removed only after their data is safely stored. The old presets' JSON shape (`{"Name": "prefix text"}`) is also accepted by the importer below.

### Export / import saves (JSON)

The **Export/Import** button opens a popup with your whole save list as minified JSON: click the text (or press **Copy**) to copy it, or **Download (.json)** to save it as `ai-prompt-minifier-saves.json`. To import, click **Import…**, paste a JSON map of saves, then **Confirm import** — you are always asked first, because importing **replaces** the saved profiles in this browser (invalid entries are skipped and reported in the toast). Maps from the old version — `{"Preset name": "prefix text"}` — are understood too: each entry becomes a save with the **Minify** recipe. The import row's **Close** button simply dismisses the popup (the pasted draft is discarded; opening the popup again shows the fresh save list). Importing never touches your current prefix, input, recipe or theme.

### Collapse the left columns

Once your recipe is set up, the **`«`** button in the top bar collapses the Filters and Recipe columns into slim icon rails, giving the prefix/input/output area more room. Hover a collapsed column to peek the recipe: option values stay editable, but adding, removing or reordering filters is switched off — that's the point (you're set up for a long session). Click **`»`** to expand again. The expanded/collapsed choice is remembered per browser, is **not** part of any save profile, and new users start expanded.

**Resizable columns** — while the left columns are expanded, drag either of the two thin **gutter separators** (between Filters/Recipe, and between Recipe/I-O) to resize the columns; focus a gutter and use **ArrowLeft/ArrowRight** to nudge it, and **double-click** a gutter to reset both columns to their defaults. Your column widths are remembered per browser (not part of any save profile), and the compact rail view is not resizable — but the hover-peek has its own right-edge handle that resizes just the peek (never the rails).

**Resizable I/O panes** — in the right column, drag either of the two thin horizontal **gutter separators** (between Prefix/Input, and between Input/Output) to resize the pane above it (the Output pane absorbs the change); focus a gutter and use **ArrowUp/ArrowDown** to nudge it, and **double-click** a gutter to reset both panes to their defaults. Your pane heights are remembered per browser (not part of any save profile), and collapsing the left columns does not affect them.

Everything stays on your machine: no server, no accounts, no network calls.

## How to Use

1. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari) — double-clicking the file is enough; it works fully offline.
2. Optionally type a system prompt into the **Prefix** box — it will appear above your input in the output, **never minified** (the recipe only touches the input). The **Clear** buttons (prefix, input) ask for confirmation before clearing.
3. Paste your prompt into the **Input** pane: system instructions, code, JSON, examples...
4. **Minify** starts in the recipe by default (for first-time visitors — returning visitors resume their saved state), so the output is minified live as you type. Watch the **char + `≈ tok` counters** on each pane to budget against your model's context window.
5. Add **Output length limit**, **Strip HTML**, **Remove comments**, **Remove emoji**, **Remove extra space**, **Regex find & replace**, **Code minify** or **Duplicate line dedup** from the left column when needed, and reorder the cards to change the pipeline order.
6. Click **Copy** in the Output pane and paste into your AI chat.

## AI Transparency

This project was developed with **AI assistance** — an AI agent did the bulk of the coding, testing and documentation, and a human directed every design decision, reviewed the work, and gave the feedback that shaped each release. That is the honest summary, and it is stated here deliberately: the project is intended for public use, and we would rather tell you how it was made than let you find out later. Nothing about that should change how you use it: every line of code is written for this project (the CyberChef reference is layout/interaction inspiration only — no code was copied), the whole codebase is small enough to read in an afternoon, and the documentation in this repository describes the code as it actually exists.

If you find a bug or want a feature, plain-English reports and suggestions are very welcome — the maintainers (human + agent) read them.

## Files

The complete app is **30 files**:

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
| `scripts/core/tokenize.js`              | Heuristic token estimator (`≈ N tok` counters + the limit's token unit) |
| `scripts/filters/registry.js`           | Filter registry + the ordered pipeline (loaded first among filters) |
| `scripts/filters/minify.js`             | **Minify** filter (string-aware whitespace collapse)               |
| `scripts/filters/output-length-limit.js`| **Output length limit** filter — chars (exact) or tokens (estimated) unit + card presets (10k…390k, custom) |
| `scripts/filters/strip-html.js`         | **Strip HTML** filter (comments, tags, entities)                   |
| `scripts/filters/remove-comment.js`     | **Remove comments** filter (19-language grammar incl. C/C++ split + JSON/JSONC + string-aware scanner + Auto modes) |
| `scripts/filters/remove-extra-space.js` | **Remove extra space** filter (collapse every whitespace run to N spaces — 0 = remove all) |
| `scripts/filters/remove-emoji.js`       | **Remove emoji** filter (each maximal emoji sequence → one space; zero-emoji text byte-identical) |
| `scripts/filters/regex-replace.js`      | **Regex find & replace** filter (loop-safe single-pass replace + live match state) |
| `scripts/filters/code-minify.js`        | **Code minify** filter (language-aware whitespace minify for 20 languages incl. C# + JSON/JSONC: dedicated CSS/JS/TS/HTML/C# scanners + grammar-driven scanner + fenced markdown + plain-text markdown option + JSON value-level compaction + 20-language Auto + Remove comments toggle + C# version bands) |
| `scripts/filters/dedup.js`              | **Duplicate line dedup** filter (exact duplicate lines or blocks; first kept; byte-exact matching; card status) |
| `scripts/ui/theme.js`                   | Theme switch + `apm.theme` persistence (independent of save profiles) |
| `scripts/ui/palette.js`                 | Filter palette: search, drag / double-click / keyboard add          |
| `scripts/ui/recipe.js`                  | Recipe cards, per-card options (selects + live text inputs), add / remove / reorder, live status lines |
| `scripts/ui/dnd.js`                     | Drag & drop state + the drop indicator                              |
| `scripts/ui/leftpane.js`                | Collapse toggle for the left columns (`apm.ui.leftCollapsed`)      |
| `scripts/ui/splits.js`                  | Resizable left columns + hover-peek width + I/O pane heights (`apm.ui.splits` / `apm.ui.peekWidth` / `apm.ui.panes`) |
| `scripts/ui/io.js`                      | Live recompute (recipe on input; raw prefix prepended after), char + token counters, status hand-off, confirmed clear, copy |
| `scripts/ui/saves.js`                   | Top-bar Save / Load / Delete + debounced auto-resume (soft save) + the export/import JSON modal |
| `scripts/tests/unit-tests.js`           | Built-in unit-test runner — `APM.test.run()` in the browser console (426 pinned cases; no external tools; zero impact until you run it) |

Documentation: this `README.md` (user-facing) + the docs live in the code (minimal JSDoc directly above the functions they describe) + [`.ai/skills/`](.ai/skills/) (project orientation, unit testing, the verification battery, and the add-a-filter workflow — written for AI and human readers alike)

### Code layout

The JavaScript is a set of small plain `<script>` files — **not ES modules** — loaded in document order at the end of `<body>`, each attaching its part to one shared `window.APM` namespace (`APM.dom`, `APM.filters`, `APM.recipe`, …). That keeps the double-click workflow intact: browsers block module scripts on `file://` pages, but classic scripts run fine there. No bundler, no build step, no dependencies.

## Notes

- Pure HTML/CSS/JS — no build step, no external libraries, no network requests.
- **Installable (PWA)**: `manifest.json` + icons let you install it as an app on desktop and mobile. There is deliberately **no service worker** — the app is already fully offline and works straight from `file://`.
- All saved data lives in `localStorage` under the `apm.*` keys (`apm.theme`, `apm.saves`, `apm.lastState`, `apm.ui.leftCollapsed`, `apm.ui.splits`, `apm.ui.peekWidth`, `apm.ui.panes`); clearing site data removes it. Legacy keys from the old version (`prefixPresets`, `lastPrefix`) are one-time migrated into `apm.saves` / `apm.lastState` on first open of the new version, then removed.
- Keyboard-friendly: every action is reachable without a mouse (Tab to a filter, Enter/Space to add; buttons and selects work as expected), with a visible focus ring.
