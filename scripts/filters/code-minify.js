/* filters/code-minify.js — language-aware whitespace minify,
   registered as "code-minify" (20 languages + Auto in the dropdown).

   Engines (all written for this project):
   - core(): shared single-pass collapse — outside opaque regions a
     whitespace run (incl. newlines) collapses to at most one space,
     emitted only when both neighbours are word-ish chars
     (token-join safety); final trim; empty / whitespace-only input
     -> empty output;
   - cssMinify / jsMinify / htmlMinify / csharpMinify: dedicated
     scanners with byte-exact opaque regions (CSS strings; JS/TS
     strings, whole template-literal spans, regex literals; HTML
     tags with byte-exact attribute values; pre/textarea/script/
     style raw text; C# regular/char/verbatim/interpolated/raw
     strings);
   - grammarMinify + GRAMMARS table (14 languages): line-starters
     (#, //, --, ...), block delimiters (C-style block comments,
     backtick raw strings, triple quotes, PowerShell block comments,
     ruby =begin/=end, ...), flags shebang / wordStart / lineScoped
     / nested / triple / backtick, all string-aware — the "Remove
     comments" toggle drops comment spans when ON (default) and
     keeps them byte-exact when OFF (a kept line comment includes
     its terminating newline);
   - markdownMinify: fenced code blocks (``` / ~~~) byte-exact
     incl. inner newlines, prose collapses, <!-- --> per toggle;
   - markdownPlainText: the "Remove all style (keep text only)"
     option — text extraction: fence content kept as-is (fence
     lines dropped), headings/blockquotes/list markers/hr/table
     separators/emphasis/links/inline-code/strikethrough/raw HTML
     dropped, text kept; in-word underscores/asterisks are NOT
     markers (space/line-boundary guarded);
   - JSON: standard JSON — collapse only; with Remove comments ON
     it runs as JSONC (line + block comments stripped, "-strings
     byte-exact). The 4 value options (remove null / empty {} /
     empty [] / empty "") parse -> clean (children first, so
     cascades like {"a":{"b":null}} resolve) -> re-stringify;
     a parse failure keeps the collapsed text (never corrupts);
     a removed root -> "".

   Regex-vs-division (JS/TS): a slash is a REGEX start when the last
   significant char is a word char whose token is a control keyword
   (KEYWORDS below), or the last kind is an operator / punctuation /
   start-of-text; it is DIVISION after a word token that is not a
   keyword, after a digit, after ")" / "]", and after a string or
   regex literal (value contexts). Documented v1 limitation: after
   ")" / "]" it is always division (e.g. "if (x) /re/.test(s)" is
   misread) — rare, and never corrupts strings/templates.

   Auto (pool = all 20 languages): marker scoring with early exit —
   MARKERS / PENALTIES / GUESS_PRIORITY, a handful of linear
   regex scans, never a character walk. Zero markers -> the text is
   returned UNCHANGED, so a wrong guess can never corrupt it.

   "version" is read for the contract; C# honours it (C#6+ =
   interpolated strings, C#11+ = raw strings — see csharpMinify),
   every other language ignores it, unknown value -> auto (safe).
   The Version select's `choices` is a FUNCTION of the card options
   — C# shows the band list, every other language (incl. Auto)
   shows the single "Auto (latest)"; recipe.js renders + rebuilds
   such selects on option change.

   Written from scratch for this project (CyberChef is layout/style
   reference only). */
(function (APM) {
    "use strict";

    var WORD_RE = /[\w$]/;
    var FLAG_RE = /[gimsuy]/;

    // Control keywords after which a slash starts a regex literal
    // (jsmin-style heuristic).
    var KEYWORDS = {
        "return": 1, "case": 1, "typeof": 1, "instanceof": 1,
        "in": 1, "of": 1, "new": 1, "delete": 1, "void": 1,
        "do": 1, "else": 1, "yield": 1, "await": 1
    };

    // ---------- shared collapse core ----------
    // out[] + pending drive the collapse rule; lastKind / lastWord
    // drive the regex-vs-division decision:
    //   lastKind "word"  — last char was a word char (lastWord = token)
    //   lastKind "value" — digit, ")" / "]", or the close of a string
    //                      / regex / template literal (value context)
    //   lastKind "other" — any other significant char
    function core() {
        var out = [];
        var pending = false;
        var lastWordish = false; // adjacency: last unit ended word-ish?
        var lastKind = null;
        var lastWord = "";
        var curWord = "";
        return {
            ws: function () { pending = true; },
            // One significant char (code mode).
            emit: function (c) {
                if (pending && lastWordish && WORD_RE.test(c)) {
                    out.push(" ");
                }
                pending = false;
                out.push(c);
                lastWordish = WORD_RE.test(c);
                if (lastWordish) {
                    curWord += c;
                    lastKind = "word";
                } else {
                    if (curWord) { lastWord = curWord; curWord = ""; }
                    lastKind = (c === ")" || c === "]") ? "value" : "other";
                }
            },
            // Copy an opaque span byte-exact (string / template /
            // regex / kept comment / HTML tag or raw region).
            // wordish = the span's ends count as word-ish for
            // adjacency (HTML's bare "<" in prose — a space must be
            // kept on both sides so "a < b" never becomes "a<b").
            raw: function (span, wordish) {
                if (!span.length) return;
                var first = span.charAt(0);
                var last = span.charAt(span.length - 1);
                if (pending && lastWordish &&
                    (wordish || WORD_RE.test(first))) {
                    out.push(" ");
                }
                out.push(span);
                pending = true;
                lastWordish = !!(wordish || WORD_RE.test(last));
                if (curWord) { lastWord = curWord; curWord = ""; }
                if (last === '"' || last === "'" || last === "`" || last === "/") {
                    lastKind = "value"; // string / template / regex close
                } else if (WORD_RE.test(last)) {
                    lastKind = "word";  // lastWord already finalised
                } else {
                    lastKind = "other";
                }
            },
            // Drop a span (comment removed) = a whitespace run.
            skip: function () { pending = true; },
            // Slash decision (JS/TS only). The word being built
            // (curWord) is the immediately preceding token when a /
            // follows a keyword directly.
            slashIsRegex: function () {
                if (lastKind === null) return true; // start of text
                if (lastKind === "word") {
                    var w = curWord || lastWord;
                    return !!KEYWORDS[w];
                }
                if (lastKind === "value") return false;
                return true;
            },
            done: function () { return out.join("").trim(); }
        };
    }

    // ---------- CSS ----------
    // Strings byte-exact; block comments per toggle; nothing else
    // opaque (CSS is line-insensitive).
    function cssMinify(text, removeComments) {
        var c = core();
        var i = 0;
        var n = text.length;
        while (i < n) {
            var ch = text.charAt(i);
            if (ch === "'" || ch === '"') {
                var j = i + 1;
                while (j < n) {
                    var cj = text.charAt(j);
                    if (cj === "\\") { j += 2; continue; }
                    if (cj === ch) { j++; break; }
                    j++;
                }
                c.raw(text.slice(i, j));
                i = j;
            } else if (ch === "/" && text.charAt(i + 1) === "*") {
                var k = text.indexOf("*/", i + 2);
                var end = (k === -1) ? n : k + 2;
                var span = text.slice(i, end);
                if (removeComments) c.skip(); else c.raw(span);
                i = end;
            } else if (/\s/.test(ch)) {
                c.ws();
                i++;
            } else {
                c.emit(ch);
                i++;
            }
        }
        return c.done();
    }

    // ---------- JavaScript / TypeScript ----------
    // Strings / templates / regex literals byte-exact; line + block
    // comments per toggle; regex-vs-division via core.slashIsRegex.
    function jsMinify(text, removeComments) {
        var c = core();
        var i = 0;
        var n = text.length;
        while (i < n) {
            var ch = text.charAt(i);
            if (ch === "'" || ch === '"') {
                var j = i + 1;
                while (j < n) {
                    var cj = text.charAt(j);
                    if (cj === "\\") { j += 2; continue; }
                    if (cj === "\n" || cj === "\r") break; // strings do not span lines
                    if (cj === ch) { j++; break; }
                    j++;
                }
                c.raw(text.slice(i, j));
                i = j;
            } else if (ch === "`") {
                // Whole template-literal span is opaque (incl. ${ ... })
                // — documented limitation, consistent with the
                // remove-comment JS treatment.
                var t = i + 1;
                while (t < n) {
                    var ct = text.charAt(t);
                    if (ct === "\\") { t += 2; continue; }
                    if (ct === "`") { t++; break; }
                    t++;
                }
                c.raw(text.slice(i, t));
                i = t;
            } else if (ch === "/" && text.charAt(i + 1) === "/") {
                // Line comment: the span keeps its terminating newline
                // so a kept comment stays a comment.
                var e = text.indexOf("\n", i);
                var lend = (e === -1) ? n : e + 1;
                var lspan = text.slice(i, lend);
                if (removeComments) c.skip(); else c.raw(lspan);
                i = lend;
            } else if (ch === "/" && text.charAt(i + 1) === "*") {
                var k = text.indexOf("*/", i + 2);
                var kend = (k === -1) ? n : k + 2;
                var kspan = text.slice(i, kend);
                if (removeComments) c.skip(); else c.raw(kspan);
                i = kend;
            } else if (ch === "/") {
                if (c.slashIsRegex()) {
                    var r = i + 1;
                    var closed = false;
                    while (r < n && text.charAt(r) !== "\n") {
                        var cr = text.charAt(r);
                        if (cr === "\\") { r += 2; continue; }
                        if (cr === "/") { r++; closed = true; break; }
                        r++;
                    }
                    if (closed) {
                        while (r < n && FLAG_RE.test(text.charAt(r))) r++;
                    }
                    c.raw(text.slice(i, r));
                    i = r;
                } else {
                    c.emit("/");
                    i++;
                }
            } else if (/\s/.test(ch)) {
                c.ws();
                i++;
            } else {
                c.emit(ch);
                i++;
            }
        }
        return c.done();
    }

    // ---------- HTML ----------
    // Tags are byte-exact except their whitespace (runs -> one space,
    // dropped adjacent to < or >); attribute values are byte-exact;
    // raw-text elements keep their content byte-exact until the
    // matching close tag; comments per toggle; a bare "<" in prose
    // is regular content (but word-ish for adjacency — see core.raw).
    var RAW_ELEMENTS = ["pre", "textarea", "script", "style"];

    // Rebuild a tag: quoted spans byte-exact; whitespace runs -> one
    // space, dropped when adjacent to "<" or ">".
    function processTag(tag) {
        var parts = ["<"];
        var i = 1;
        var n = tag.length;
        while (i < n) {
            var ch = tag.charAt(i);
            if (ch === '"' || ch === "'") {
                var j = i + 1;
                while (j < n && tag.charAt(j) !== ch) j++;
                j = Math.min(j + 1, n);
                parts.push(tag.slice(i, j));
                i = j;
            } else if (/[\s]/.test(ch)) {
                var k = i;
                while (k < n && /[\s]/.test(tag.charAt(k))) k++;
                var lastPart = parts[parts.length - 1];
                var nextCh = (k < n) ? tag.charAt(k) : ">";
                if (lastPart !== "<" && nextCh !== ">" && nextCh !== "") {
                    parts.push(" ");
                }
                i = k;
            } else {
                parts.push(ch);
                i++;
            }
        }
        return parts.join("");
    }

    function htmlMinify(text, removeComments) {
        var c = core();
        var i = 0;
        var n = text.length;
        var rawClose = null; // e.g. "</pre" while inside a raw element
        var low = text.toLowerCase(); // one lowercased copy for the raw-close scans
        while (i < n) {
            if (rawClose) {
                // Raw-text content: byte-exact until the matching
                // close tag (case-insensitive search).
                var k = low.indexOf(rawClose, i);
                if (k === -1) {
                    c.raw(text.slice(i)); // no close tag: rest is raw
                    break;
                }
                c.raw(text.slice(i, k));
                rawClose = null;
                i = k; // the close tag is processed by the normal path
                continue;
            }
            var ch = text.charAt(i);
            if (text.startsWith("<!--", i)) {
                var e = text.indexOf("-->", i + 4);
                var end = (e === -1) ? n : e + 3;
                var span = text.slice(i, end);
                if (removeComments) c.skip(); else c.raw(span);
                i = end;
            } else if (ch === "<" && /[A-Za-z!/]/.test(text.charAt(i + 1) || "")) {
                // Read the tag to the unescaped ">" (quoted attribute
                // values may contain ">").
                var j = i + 1;
                while (j < n) {
                    var cj = text.charAt(j);
                    if (cj === '"' || cj === "'") {
                        j++;
                        while (j < n && text.charAt(j) !== cj) j++;
                        if (j < n) j++;
                        continue;
                    }
                    if (cj === ">") { j++; break; }
                    j++;
                }
                var tag = text.slice(i, j);
                c.raw(processTag(tag));
                var m = tag.match(/^<\s*([A-Za-z][A-Za-z0-9-]*)/);
                if (m && tag.charAt(1) !== "/" &&
                    RAW_ELEMENTS.indexOf(m[1].toLowerCase()) !== -1) {
                    rawClose = "</" + m[1].toLowerCase();
                }
                i = j;
            } else if (ch === "<") {
                // Bare "<" in prose = regular content; word-ish for
                // adjacency so spaces around it survive.
                c.raw("<", true);
                i++;
            } else if (ch === ">") {
                // Bare ">" in prose: spaces are user-visible text —
                // keep them (same wordish treatment as bare "<").
                c.raw(">", true);
                i++;
            } else if (/[\s]/.test(ch)) {
                c.ws();
                i++;
            } else {
                c.emit(ch);
                i++;
            }
        }
        return c.done();
    }

    // ---------- C# ----------
    // Opaque spans (byte-exact, never minified inside):
    //   """...""" C#11 raw string — whole span opaque (indentation-
    //             sensitive: minifying would change the literal);
    //             the next """ occurrence closes (conservative).
    //             [Version band: C#11+]
    //   @"..."    verbatim string — "" is an escaped quote,
    //             backslash is a LITERAL char (no escape
    //             processing), may span newlines.
    //   $"..."    interpolated string — whole span opaque incl. the
    //             {…} holes (like JS template literals).
    //   $@"..." (either order of $ and @) — interpolated-verbatim:
    //             verbatim interior rules, whole span opaque.
    //             [Version band: C#6+, with the interpolated forms]
    //   "..." / '...' regular string / char literal — backslash
    //             escapes, never span a newline (an unclosed one
    //             consumes to end — conservative).
    // Version bands: auto or an unknown value = latest (both
    // version-born features ON — the default behaviour);
    // csharp-N gates interpolated (C#6+) and raw (C#11+); older bands
    // fall through to the regular string/char paths (deterministic,
    // never corrupts).
    // // line comments (kept newline included when OFF) and /* */
    // block comments (non-nested) drop when Remove comments is ON,
    // byte-exact when OFF.
    function csharpMinify(text, removeComments, version) {
        var n = text.length;
        // Version band: 99 = auto/latest (both features ON).
        var band = 99;
        var bm = /^csharp-(\d+)$/.exec(String(version || "auto"));
        if (bm) band = parseInt(bm[1], 10);
        var allowInterpolated = band >= 6; // $"…" / $@"…"  (C#6+)
        var allowRaw = band >= 11;         // """…"""    (C#11+)
        // Verbatim interior: "" = escaped quote; backslash literal.
        function scanVerbatim(from) {
            var p = from;
            while (p < n) {
                if (text.charAt(p) === '"') {
                    if (text.charAt(p + 1) === '"') { p += 2; continue; }
                    return p + 1;
                }
                p++;
            }
            return n; // unterminated: to end
        }
        // Interpolated interior: backslash escapes; the first
        // unescaped quote closes.
        function scanInterpolated(from) {
            var p = from;
            while (p < n) {
                var d = text.charAt(p);
                if (d === "\\") { p += 2; continue; }
                if (d === '"') return p + 1;
                p++;
            }
            return n;
        }
        var c = core();
        var i = 0;
        while (i < n) {
            var ch = text.charAt(i);
            if (allowRaw && text.slice(i, i + 3) === '"""') {
                // C#11 raw string: to the next """ (or end).
                var t = text.indexOf('"""', i + 3);
                var tend = (t === -1) ? n : t + 3;
                c.raw(text.slice(i, tend));
                i = tend;
                continue;
            }
            var two = text.slice(i, i + 2);
            if (two === '@"') {
                var v = scanVerbatim(i + 2);
                c.raw(text.slice(i, v));
                i = v;
                continue;
            }
            if (allowInterpolated && two === '$"') {
                var s = scanInterpolated(i + 2);
                c.raw(text.slice(i, s));
                i = s;
                continue;
            }
            if (allowInterpolated && (two === '$@' || two === '@$') && text.charAt(i + 2) === '"') {
                var iv = scanVerbatim(i + 3);
                c.raw(text.slice(i, iv));
                i = iv;
                continue;
            }
            if (ch === '"' || ch === "'") {
                // Regular "..." / '...' string or char literal:
                // backslash escapes, no line span (an unclosed one
                // consumes to end — conservative).
                var j = i + 1;
                while (j < n) {
                    var cj = text.charAt(j);
                    if (cj === "\\") { j += 2; continue; }
                    if (cj === "\n" || cj === "\r") break;
                    if (cj === ch) { j++; break; }
                    j++;
                }
                c.raw(text.slice(i, j));
                i = j;
                continue;
            }
            if (ch === "/" && text.charAt(i + 1) === "/") {
                var e = text.indexOf("\n", i);
                var lend = (e === -1) ? n : e + 1;
                var lspan = text.slice(i, lend);
                if (removeComments) c.skip(); else c.raw(lspan);
                i = lend;
                continue;
            }
            if (ch === "/" && text.charAt(i + 1) === "*") {
                var k = text.indexOf("*/", i + 2);
                var kend = (k === -1) ? n : k + 2;
                var kspan = text.slice(i, kend);
                if (removeComments) c.skip(); else c.raw(kspan);
                i = kend;
                continue;
            }
            if (/\s/.test(ch)) { c.ws(); i++; continue; }
            c.emit(ch);
            i++;
        }
        return c.done();
    }

    // ---------- Generic grammar-driven minifier ----------
    // One single-pass scanner serves every grammar-driven language
    // (C, C++, Go, Java, JSON, Kotlin, PHP, PowerShell, Python, Ruby,
    // Rust, SQL, Swift, bash). Per-position decision order mirrors the
    // shipped remove-comment.js scanner EXACTLY, so both filters agree
    // per language:
    //   1) string literal (always opaque) — triple-quoted ("""/''')
    //      when `triple` (spans newlines, backslash escapes,
    //      unterminated -> consume to end); plain " / ' (plus backtick
    //      when `backtick`) with backslash escapes; a non-multiline
    //      quoted span that hits a raw newline or EOF without closing
    //      is NOT a string (the quote emits as an ordinary char — the
    //      remove-comment stringLength rule); an unterminated backtick
    //      raw string consumes to end (remove-comment rule).
    //   2) line comment — first matching lineStarts[] entry; wordStart
    //      guard (char before the starter not [A-Za-z0-9_] — SQL
    //      `1--2` is data) and shebang guard (`#!` at position 0 is
    //      code — bash) applied exactly as in remove-comment; span to
    //      end of line (the newline itself is processed as normal
    //      text); ON -> skipped (collapse fills the gap), OFF ->
    //      byte-exact.
    //   3) block comment — blockStart/blockEnd; lineScoped (delimiters
    //      only at line start — Ruby =begin/=end); nested (depth
    //      counting — Rust/Swift/Kotlin); ON -> skipped, OFF ->
    //      byte-exact; unterminated -> consume to end.
    //   4) otherwise — whitespace (collapse) or ordinary char.
    // The flag rows mirror remove-comment.js's GRAMMAR table 1:1
    // (shebang/wordStart/lineScoped/nested/triple/backtick). `quotes`
    // is this filter's extension (JSON = "-strings only — standard
    // JSON; every other language = " and ').
    var GRAMMARS = {
        "bash":       { lineStarts: ["#"],          blockStart: null,     blockEnd: null,   nested: false, shebang: true,  wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "c":          { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "cpp":        { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "go":         { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: true,  quotes: ['"', "'"] },
        "java":       { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "kotlin":     { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: true,  shebang: false, wordStart: false, lineScoped: false, triple: true,  backtick: false, quotes: ['"', "'"] },
        "php":        { lineStarts: ["//", "#"],    blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "powershell": { lineStarts: ["#"],          blockStart: "<#",     blockEnd: "#>",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "python":     { lineStarts: ["#"],          blockStart: null,     blockEnd: null,   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: true,  backtick: false, quotes: ['"', "'"] },
        "ruby":       { lineStarts: ["#"],          blockStart: "=begin", blockEnd: "=end", nested: false, shebang: false, wordStart: false, lineScoped: true,  triple: false, backtick: false, quotes: ['"', "'"] },
        "rust":       { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: true,  shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "json":       { lineStarts: [],             blockStart: null,     blockEnd: null,   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"'] , jsonc: true },
        "jsonc":      { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: false, lineScoped: false, triple: false, backtick: false, quotes: ['"'] },
        "sql":        { lineStarts: ["--"],         blockStart: "/*",     blockEnd: "*/",   nested: false, shebang: false, wordStart: true,  lineScoped: false, triple: false, backtick: false, quotes: ['"', "'"] },
        "swift":      { lineStarts: ["//"],         blockStart: "/*",     blockEnd: "*/",   nested: true,  shebang: false, wordStart: false, lineScoped: false, triple: true,  backtick: false, quotes: ['"', "'"] }
    };

    // ---------- Markdown ----------
    // A fence line (``` or ~~~, >=3 chars, at line start with <=3
    // leading spaces, optional info string) opens an opaque region:
    // the opening line, every content line (incl. their newlines) and
    // the matching closing fence line (same char, >= the opening
    // length, fence-chars-only line) are all byte-exact; an
    // unterminated fence consumes to end of input. Outside fences:
    // "<!-- -->" comments per the toggle + the shared collapse rule.
    // Headings / lists / inline code = prose (NOT interpreted —
    // indented code blocks are out of scope, documented).
    function markdownMinify(text, removeComments) {
        var c = core();
        var n = text.length;
        var i = 0;
        var fenceCh = null;   // "`" or "~" while inside a fenced region
        var fenceLen = 0;     // opening fence length (close must be >=)
        while (i < n) {
            if (fenceCh) {
                // Inside a fence: i is always at a line start.
                var fl = text.indexOf("\n", i);
                var line = (fl === -1) ? text.slice(i) : text.slice(i, fl);
                var closeRe = (fenceCh === "`")
                    ? new RegExp("^ {0,3}`{" + fenceLen + ",}[ \\t]*$")
                    : new RegExp("^ {0,3}~{" + fenceLen + ",}[ \\t]*$");
                if (closeRe.test(line)) {
                    c.raw(line); // closing fence line byte-exact
                    i = (fl === -1) ? n : fl + 1;
                    fenceCh = null;
                    continue;
                }
                // content line: byte-exact INCLUDING its newline
                c.raw((fl === -1) ? line : text.slice(i, fl + 1));
                if (fl === -1) { break; } // unterminated: rest was opaque
                i = fl + 1;
                continue;
            }
            // At line start: an opening fence?
            if (i === 0 || text.charAt(i - 1) === "\n") {
                var le = text.indexOf("\n", i);
                var ln = (le === -1) ? text.slice(i) : text.slice(i, le);
                var fm = ln.match(/^ {0,3}(`{3,}|~{3,})/);
                if (fm) {
                    // Opening fence line byte-exact (+ its newline when
                    // the fence is not the last line — that newline is
                    // fence content).
                    c.raw((le === -1) ? ln : text.slice(i, le + 1));
                    i = (le === -1) ? n : le + 1;
                    fenceCh = fm[1][0];
                    fenceLen = fm[1].length;
                    continue;
                }
            }
            var ch = text.charAt(i);
            if (text.startsWith("<!--", i)) {
                var e = text.indexOf("-->", i + 4);
                var end = (e === -1) ? n : e + 3;
                var span = text.slice(i, end);
                if (removeComments) c.skip(); else c.raw(span);
                i = end;
            } else if (/\s/.test(ch)) {
                c.ws();
                i++;
            } else {
                c.emit(ch);
                i++;
            }
        }
        return c.done();
    }

    // Plain-text extraction: drop all markdown/HTML styling, keep the
    // text. Fence content passes through untouched (fence lines
    // dropped); outside fences: HTML comments, headings, blockquotes,
    // list markers, hr, table separators, link URLs, emphasis markers
    // and raw HTML tags are dropped. In-word underscores/asterisks
    // (e.g. snake_case) are NOT markers — the single-marker rules
    // require space/line boundaries on both sides.
    function markdownPlainText(text) {
        var out = [];
        var buf = "";
        var fenceCh = null, fenceLen = 0;
        var i = 0, n = text.length;
        function transform(s) {
            s = s.replace(/<!--[\s\S]*?-->/g, "");
            s = s.split("\n").map(function (line) {
                if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return null; // hr — dropped
                if (/^\s{0,3}\|/.test(line)) {                                 // table row
                    var cells = line.split("|").map(function (c) { return c.trim(); });
                    var sep = cells.every(function (c) { return c === "" || /^:?-{1,}:?$/.test(c); });
                    if (sep) return null; // separator row — dropped
                    return cells.filter(function (c) { return c !== ""; }).join(" ");
                }
                line = line.replace(/^\s{0,3}#{1,6}\s+/, ""); // heading
                line = line.replace(/^\s{0,3}(>\s?)+/, "");   // blockquote
                line = line.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/, ""); // list marker
                return line;
            }).filter(function (l) { return l !== null; }).join("\n");
            s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1"); // image → alt
            s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");  // link → text
            s = s.replace(/`([^`]+)`/g, "$1");              // inline code
            s = s.replace(/~~(.+?)~~/g, "$1");              // strikethrough
            s = s.replace(/\*\*(.+?)\*\*/g, "$1");          // bold
            s = s.replace(/__(.+?)__/g, "$1");
            s = s.replace(/(^|\s)\*([^*\s][^*\n]*?)\*(?=[\s.,;:!?]|$)/g, "$1$2"); // italic
            s = s.replace(/(^|\s)_([^_\s][^_\n]*?)_(?=[\s.,;:!?]|$)/g, "$1$2");  // underscore italic
            s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g, ""); // raw HTML tags
            return s;
        }
        function flush() {
            if (buf !== "") { out.push(transform(buf)); buf = ""; }
        }
        while (i < n) {
            var nl = text.indexOf("\n", i);
            var line = (nl === -1) ? text.slice(i) : text.slice(i, nl);
            if (fenceCh) {
                var close = line.match(/^\s{0,3}([`~]{3,})\s*$/);
                if (close && close[1].charAt(0) === fenceCh && close[1].length >= fenceLen) {
                    fenceCh = null; // drop the closing fence
                } else {
                    out.push(line); // fence content kept as-is
                }
            } else {
                var open = line.match(/^\s{0,3}([`~]{3,})\s*(\S.*)?$/);
                if (open) { fenceCh = open[1].charAt(0); fenceLen = open[1].length; } // drop opening fence
                else { buf += line + (nl === -1 ? "" : "\n"); }
            }
            i = (nl === -1) ? n : nl + 1;
        }
        flush();
        return out.join("\n");
    }

    function grammarMinify(text, grammar, removeComments) {
        var c = core();
        var n = text.length;
        var i = 0;
        var lineStarts = grammar.lineStarts || [];
        var quotes = grammar.quotes || ['"', "'"];
        while (i < n) {
            var ch = text.charAt(i);

            // 1) String literal — always opaque.
            var strEnd = -1;
            if (grammar.triple) {
                for (var q3 = 0; q3 < quotes.length && strEnd === -1; q3++) {
                    var qc = quotes[q3];
                    if (qc !== '"' && qc !== "'") continue;
                    var tri = qc + qc + qc;
                    if (!text.startsWith(tri, i)) continue;
                    var t = i + 3;
                    while (t < n) {
                        if (text.charAt(t) === "\\") { t += 2; continue; }
                        if (text.startsWith(tri, t)) break;
                        t++;
                    }
                    // closed -> after the closing triple; unterminated
                    // -> consume to end (remove-comment rule).
                    strEnd = (t < n && text.startsWith(tri, t)) ? t + 3 : n;
                }
            }
            if (strEnd === -1 && (ch === '"' || ch === "'" || (grammar.backtick && ch === "`"))) {
                if (quotes.indexOf(ch) !== -1 || (grammar.backtick && ch === "`")) {
                    var multi = grammar.backtick && ch === "`";
                    var k = i + 1;
                    var closed = false;
                    while (k < n) {
                        var ck = text.charAt(k);
                        if (ck === "\\") { k += 2; continue; }
                        if (ck === "\n" && !multi) break; // plain strings do not span lines
                        if (ck === ch) { closed = true; break; }
                        k++;
                    }
                    if (closed) strEnd = k + 1;
                    else if (multi) strEnd = n; // unterminated raw string -> consume to end
                    // else: NOT a string — the quote falls through as an
                    // ordinary char below (remove-comment rule).
                }
            }
            if (strEnd !== -1) {
                c.raw(text.slice(i, strEnd));
                i = strEnd;
                continue;
            }

            // 2) Line comment (first matching starter; guards mirror
            //    remove-comment exactly).
            var lsHit = null;
            for (var L = 0; L < lineStarts.length && !lsHit; L++) {
                if (text.startsWith(lineStarts[L], i)) lsHit = lineStarts[L];
            }
            if (lsHit &&
                !(grammar.wordStart && i > 0 && /[A-Za-z0-9_]/.test(text.charAt(i - 1))) &&
                !(grammar.shebang && i === 0 && n > 1 && text.charAt(1) === "!")) {
                var nl = text.indexOf("\n", i);
                var lend = (nl === -1) ? n : nl; // span excludes the newline
                if (removeComments) c.skip(); else c.raw(text.slice(i, lend));
                i = lend;
                continue;
            }

            // 3) Block comment (nested / lineScoped guards).
            if (grammar.blockStart && text.startsWith(grammar.blockStart, i)) {
                var scopeOk = !grammar.lineScoped || i === 0 || text.charAt(i - 1) === "\n";
                if (scopeOk) {
                    var depth = 1;
                    var j = i + grammar.blockStart.length;
                    var kend = -1;
                    while (j < n) {
                        if (grammar.nested && text.startsWith(grammar.blockStart, j)) {
                            depth++;
                            j += grammar.blockStart.length;
                            continue;
                        }
                        if (text.startsWith(grammar.blockEnd, j)) {
                            // lineScoped: a close delimiter mid-line is
                            // not a real close (Ruby =end).
                            if (grammar.lineScoped && j > 0 && text.charAt(j - 1) !== "\n") {
                                j += grammar.blockEnd.length;
                                continue;
                            }
                            depth--;
                            if (depth === 0) { kend = j + grammar.blockEnd.length; break; }
                            j += grammar.blockEnd.length;
                            continue;
                        }
                        j++;
                    }
                    if (removeComments) c.skip();
                    else c.raw(kend === -1 ? text.slice(i) : text.slice(i, kend));
                    i = (kend === -1) ? n : kend;
                    continue;
                }
            }

            // 4) Whitespace or ordinary char.
            if (/\s/.test(ch)) { c.ws(); i++; }
            else { c.emit(ch); i++; }
        }
        return c.done();
    }

    // ---------- Auto (20-language pool) ----------
    // MARKERS: 3–6 distinctive stateless regexes per language
    // (plain, non-global, so .test() is stateless). Most sets are the
    // proven remove-comment MARKERS (17 languages); C/C++ are split
    // (C = no std:: / -> / template; C++ = those); css / html /
    // javascript / typescript reuse the remove-comment sets; JSON is
    // designed new (quoted-key shapes + line-initial container);
    // C# = the strongest C#-specific phrases (using System /
    // static void Main / Console.WriteLine / var x = / namespace X)
    // — case-sensitive, multi-word, never prose words.
    var MARKERS = {
        "bash": [
            /^#!\s*\/bin\//m,
            /\bset\s+-[a-z]/,
            /\b(?:then|else|fi|do|done)\b/,
            /\$\(/,
            /\becho\b/,
            /^\s*\[[^\]]*\]\s+(?:-|then)/m,
            /\bcomplete\s+-[a-zA-Z]/,
            /\bcompgen\b/
        ],
        "c": [
            /#\s*include\s*[<"]/,
            /\bint\s+main\s*\(/,
            /#\s*define\s+\w+/,
            /\bprintf\s*\(/,
            /\bmalloc\s*\(/,
            /\b(?:size_t|FILE|void)\b/,
            /\breturn\s+0\b/,
            /\bNULL\b/
        ],
        "cpp": [
            /#\s*include\s*[<"]/,
            /\bstd::[A-Za-z_]/,
            /\bint\s+main\s*\(/,
            /#\s*define\s+\w+/,
            /->\s*[A-Za-z_]/,
            /\btemplate\s*</
        ],
        "csharp": [
            /\busing\s+System[.;]/,
            /\bstatic\s+void\s+Main\s*\(/,
            /\bConsole\.WriteLine\s*\(/,
            /\bvar\s+\w+\s*=[^=]/,
            /\bnamespace\s+\w+/
        ],
        "css": [
            /@(?:media|keyframes|import|font-face|supports|charset|page|counter)\b/i,
            /:\s*(?:hover|root|focus|active|selection|visited|checked|disabled|placeholder|before|after)\b/i,
            /\b(?:margin|padding|display|width|height|color|background|border|font|position|top|left|right|bottom|z-index|opacity|float|clear|grid|flex|transform|transition|animation)\s*:\s*[^;{}]+;/i
        ],
        "go": [
            /\bpackage\s+[a-z][\w]*/,
            /\bfunc\s+\w+\s*\(/,
            /:=/,
            /\bfmt\.Print/,
            /\bdefer\s+\w/,
            /\btype\s+\w+\s+struct\b/,
            /\btype\s+\w+\s*=/
        ],
        "html": [
            /<!doctype\s+html/i,
            /<\s*(?:html|head|body|div|span|meta|link|title|script|style|form|table|section|article|header|footer|main|nav|aside|ul|ol|li|p|h[1-6]|img|a|button|input|label)\b[\s>\/]/i,
            /<\s*\/\s*(?:div|span|body|html|p|a|li|ul|ol|section|article|header|footer|main|nav|pre|form|table|button|label|style|script)\s*>/i,
            /\b(?:class|id|href|src|alt|placeholder|for|type|name|value)\s*=\s*["']/i
        ],
        "java": [
            /\bpackage\s+[a-z][\w.]*\s*;/,
            /\bSystem\.out\.print/,
            /\bpublic\s+(?:static\s+)?(?:class|interface|enum)\s+\w+/,
            /\bimport\s+[a-z][\w.]*\.\w+/,
            /@Override\b/,
            /\bnew\s+[A-Z]\w*\s*\(/,
            /\b(?:this|super)\./,
            /\bfinal\s+(?:class|void|static)\b/
        ],
        "javascript": [
            /\b(?:const|let)\s+[\w$]+\s*=/,
            /=>/,
            /\b(?:console|document|window|navigator|localStorage|sessionStorage)\s*\.\s*(?:log|error|warn|info|trace|getElementById|querySelector|querySelectorAll|addEventListener|removeEventListener|setItem|getItem)\b/,
            /\brequire\s*\(/,
            /\bmodule\s*\.\s*exports\b/,
            /\bfunction\s+[\w$]*\s*\(/
        ],
        "json": [
            /["'][\w$-]+["']\s*:\s*["'{\[]/,
            /["'][\w$-]+["']\s*:\s*[\d.+-]/,
            /\btrue\b|\bfalse\b|\bnull\b/,
            /^[\t ]*\{\s*["']/m,
            /^[\t ]*\[\s*[\d"'{\[]/m,
            /[,}\]]\s*["'][\w$-]+["']\s*:/
        ],
        "kotlin": [
            /\bfun\s+\w+\s*\(/,
            /\bval\s+\w+\s*=/,
            /\bdata\s+class\b/,
            /println\s*\(/,
            /\bimport\s+kotlinx?\b/,
            /\bobject\s+\w+\s*\{/,
            /\bvar\s+\w+\s*:\s*[A-Z]/,
            /\bwhen\s*\(/,
            /\bTODO\s*\(/,
            /\bInt\b|\bString\b|\bUnit\b|\bList\s*</
        ],
        "markdown": [
            /^#{1,6}\s/m,
            /\*\*[^*\n]+\*\*/,
            /^\s*[-*]\s+/m,
            /\[[^\]]+\]\([^)\s]+\)/,
            /^\s*```/m
        ],
        "php": [
            /<\?php\b/,
            /\$[A-Za-z_]/,
            /\bfunction\s+\w+\s*\(/,
            /\becho\b/,
            /\$this\b/,
            /\barray\s*\(/,
            /\b(?:public|private|protected)\s+function\b/,
            /\$this->/
        ],
        "powershell": [
            /\bGet-(?:ChildItem|Content|Process|Service|Location|Command|Variable|Item)\b/,
            /\bWrite-(?:Host|Output|Warning|Error|Verbose)\b/,
            /\bforeach\s*\(/,
            /\bparam\s*\(/,
            /\$PSVersionTable/,
            /-(?:split|join|replace)\b/,
            /\bWhere-Object\b|\bSelect-Object\b|\bForEach-Object\b/,
            /\$env:/,
            /\b(?:Get|Set|New|Install|Add|Remove|Update|Enable|Disable|Start|Stop|Test|Select|Where|ForEach|Export|Import|Invoke|Clear|Copy|Move|Read|Send|Show|Wait|Compare|Convert|Measure|Format|Split|Join|Out)\w*-[A-Z]\w*/
        ],
        "python": [
            /\bdef\s+\w+\s*\(/,
            /\bfrom\s+[\w.]+\s+import\s+[\w,*]/,
            /\bif\s+__name__\s*==/,
            /\bself\.[A-Za-z_]/,
            /\bclass\s+\w+\s*:/,
            /\bprint\s*\(/,
            /\blambda\s+[\w$]+\s*:/,
            /\bNone\b/,
            /\bdef\s+\w+\s*\):?/
        ],
        "ruby": [
            /\bdef\s+\w+/,
            /\bputs\b/,
            /\brequire\s+["']/,
            /__END__|__main__\b/,
            /^\s*\$[A-Za-z_]/m,
            /\bclass\s+\w+\b.*\bend\b/m,
            /\bend\b/,
            /\bmodule\s+\w+\b/,
            /\bdo\s*\|/,
            /\battr_(?:accessor|reader|writer)\b/,
            /\bdef\s+\w+\s*\)/
        ],
        "rust": [
            /\bpub\s+(?:fn|struct|enum|mod|use)\b/,
            /\bfn\s+\w+\s*\(/,
            /\blet\s+(?:mut\s+)?\w+\s*=/,
            /\bimpl\s+(?:[A-Za-z_<])/,
            /\buse\s+(?:std|crate|super|self)\b/,
            /\bmatch\s+\w+\s*\{/,
            /\bstruct\s+\w+\s*[;{]/,
            /\bvec!\s*\[/,
            /\bString::new\s*\(|\bformat!\s*\{/,
            /\bOption\s*<\s*[A-Z]\w*\s*>\b/,
            /\bmut\s+\w+\s*=/
        ],
        "sql": [
            /\bSELECT\b/,
            /\bFROM\b/,
            /\bWHERE\b/,
            /\bINSERT\s+INTO\b/i,
            /\bJOIN\b/i,
            /\bCREATE\s+(?:TABLE|INDEX|VIEW)\b/i,
            /\bUPDATE\s+\w+\s+SET\b/i,
            /\bDELETE\s+FROM\b/i,
            /\bGROUP\s+BY\b/i,
            /\bORDER\s+BY\b/i,
            /\bPRIMARY\s+KEY\b/i,
            /\bIS\s+NULL\b/i,
            /\bVALUES\s*\(/i
        ],
        "swift": [
            /\bimport\s+(?:Foundation|UIKit|SwiftUI|Combine)\b/,
            /\bfunc\s+\w+[^{]*->/,
            /\bprint\s*\(/,
            /\bguard\s+let\b/,
            /\bvar\s+\w+\s*:\s*[A-Z]/,
            /\bString\b|\bInt\b|\bDouble\b|\bBool\b|\bAny\b/,
            /\blet\s+\w+\s*=/,
            /\bcase\s+\w+\s*:/,
            /\bstruct\s+\w+\s*[:{]/,
            /\bprotocol\s+\w+\b/,
            /\b@objc|\b@available\b/
        ],
        "typescript": [
            /\binterface\s+[\w$]+\s*(?:<[^{]*>)?\s*\{/i,
            /\btype\s+[\w$]+\s*=/i,
            /\benum\s+[\w$]+\s*\{/i,
            /:\s*(?:string|number|boolean|void|unknown|any|never|object|symbol|bigint)\b/i,
            /\bas\s+const\b/i,
            /\b(?:readonly|abstract)\s+\w+/i,
            /\bnamespace\s+[\w$]+\s*\{/i,
            /\bkeyof\s+[\w$]+\b/i
        ]
    };


    // PENALTIES: per-language foreign-syntax penalties. Each language
    // is penalized
    // by the strongest syntax it does NOT own, so a wrong-language
    // guess with 1–2 accidental marker hits cannot outscore the true
    // language. Deliberately NOT penalized: ruby `=>` (hash syntax),
    // rust `std::` (std is Rust's standard library), go `package`
    // (Go owns it), json `:` (object syntax), sql `AS`/`NULL`/`VALUES`
    // (SQL owns them), markdown `**bold**` / `- item` (markdown owns
    // them), python `def x():` (Python owns it), swift `let x =`
    // (Swift owns it — `var x: T` is the discriminator), kotlin
    // `fun` (Kotlin owns it — `func` is the discriminator), java
    // `import x.y.Z` (Java owns it — Kotlin's `import kotlin` is the
    // discriminator), bash `echo` (Bash owns it), php `$var` (PHP
    // owns it — Ruby's `$var` is line-initial only), c `void`/`NULL`
    // (C owns them), cpp `template` (C++ owns it), go `:=` (Go owns
    // it), rust `match`/`impl`/`pub` (Rust owns them), powershell
    // `foreach (` (PowerShell owns it), javascript `=>` (JS owns it),
    // typescript `: type` (TS owns it), css `@media`/`:hover` (CSS
    // owns them), html `<div`/`class=` (HTML owns them).
    var PENALTIES = {
        "bash":       [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /=>/, /#\s*include\s*[<"]/, /\btype\s+\w+\s+struct\b/, /\b(?:Get|Set|New|Install|Add|Remove|Update|Enable|Disable|Start|Stop|Test|Select|Where|ForEach|Export|Import|Invoke)\w*-[A-Z]\w*/ ],
        "c":          [ /std::/, /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /=>/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /\busing\s+System[.;]/ ],
        "csharp":     [ /std::/, /#\s*include\s*[<"]/, /\bfn\s+[\w$]+\s*\(/, /\bdef\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /<\?php\b/, /=>/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/ ],
        "cpp":        [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /=>/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /\busing\s+System[.;]/ ],
        "css":        [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /#\s*include\s*[<"]/, /=>/, /std::/ ],
        "go":         [ /\bfn\s+[\w$]+\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /=>/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/ ],
        "html":       [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /#\s*include\s*[<"]/, /std::/ ],
        "java":       [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /=>/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /\busing\s+System[.;]/ ],
        "javascript": [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /#\s*include\s*[<"]/, /\busing\s+System[.;]/ ],
        "json":       [ /=>/, /\bfunction\b/, /\bconst\s+\w+/, /\blet\s+\w+/, /#\s*include\s*[<"]/, /\bdef\s+[\w$]+\s*\(/, /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /std::/, /<\?php\b/ ],
        "kotlin":     [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /<\?php\b/, /#\s*include\s*[<"]/, /\busing\s+System[.;]/ ],
        "markdown":   [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /std::/, /#\s*include\s*[<"]/, /\bdef\s+[\w$]+\s*\(/, /\bcomplete\s+-[a-zA-Z]/ ],
        "php":        [ /std::/, /#\s*include\s*[<"]/, /\bfn\s+[\w$]+\s*\(/, /\bdef\s+[\w$]+\s*\(/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /\b(?:Get|Set|New|Install|Add|Remove|Update|Enable|Disable|Start|Stop|Test|Select|Where|ForEach|Export|Import|Invoke)\w*-[A-Z]\w*/ ],
        "powershell": [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /=>/, /#\s*include\s*[<"]/ ],
        "python":     [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /std::/, /=>/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/, /\bputs\b/ ],
        "ruby":       [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /std::/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/ ],
        "rust":       [ /\bdef\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/ ],
        "sql":        [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /=>/, /<\?php\b/, /#\s*include\s*[<"]/ ],
        "swift":      [ /\bdef\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /std::/, /<\?php\b/, /\bfun\s+[\w$]+\s*\(/, /\bval\s+[\w$]+\s*=/ ],
        "typescript": [ /\bfn\s+[\w$]+\s*\(/, /\bfunc\s+[\w$]*\s*\(/, /\bdef\s+[\w$]+\s*\(/, /std::/, /<\?php\b/, /#\s*include\s*[<"]/, /\busing\s+System[.;]/ ]
    };

    // GUESS_PRIORITY: fixed tie-break order (earlier wins ties).
    // Most distinctive first (markdown/html/powershell/php/json/sql
    // own their strongest syntax — no other language scores them);
    // C-family twins adjacent (shared grammar, tie is harmless);
    // TS before JS (JS markers also match TS text);
    // python before ruby (both `def x` — Python's `def x():` is the
    // discriminator; Ruby's `def x` without `():` is the tie-breaker);
    // go before rust (both `fn`-ish — Go's `func x(` + `:=` is the
    // discriminator; Rust's `fn x(` + `let x =` is the tie-breaker);
    // kotlin before swift (both `fun`/`func` — Kotlin's `fun x(` +
    // `val x =` is the discriminator; Swift's `func x() ->` + `let x
    // =` is the tie-breaker);
    // java before kotlin/swift (Java docs use `String` / `new X(` /
    // `int` freely — kotlin/swift's type-name markers would steal the
    // tie; real kotlin/swift docs score higher via fun/val/println or
    // import-Foundation/func->); java before cpp/c (Java's `package x;`
    // + `public class X` is the discriminator; C/C++'s `#include` +
    // `int main(` is the tie-breaker);
    // css before typescript/javascript (CSS owns `@media`/`:hover`
    // — no other language scores them).
    var GUESS_PRIORITY = [
        "markdown", "html", "powershell", "php", "json", "sql", "bash",
        "go", "rust", "typescript", "javascript", "java", "kotlin", "swift",
        "cpp", "csharp", "c", "python", "ruby", "css"
    ];

    // Score every language with its markers (early exit at 3 hits),
    // subtract its foreign-syntax penalties, and keep the strictly
    // best positive score (ties go to the earlier GUESS_PRIORITY
    // entry). Returns null on zero/negative scores = the caller
    // leaves the text unchanged (the safe identity fallback).
    function guessLang(text) {
        var best = null;
        var bestScore = 0;
        for (var p = 0; p < GUESS_PRIORITY.length; p++) {
            var lang = GUESS_PRIORITY[p];
            var markers = MARKERS[lang];
            var score = 0;
            for (var m = 0; m < markers.length && score < 3; m++) {
                if (markers[m].test(text)) score++;
            }
            var pens = PENALTIES[lang];
            for (var q = 0; q < pens.length; q++) {
                if (pens[q].test(text)) score--;
            }
            // A language only wins with a positive score — zero or
            // negative means "not this" (identity fallback below).
            if (score > bestScore) { best = lang; bestScore = score; }
        }
        return best; // null / bestScore <= 0 = identity
    }

    // JSON value-level clean: drop null / empty {} / empty [] / "" per
    // the toggles. Children are cleaned FIRST so {"a":{"b":null}} +
    // removeNull + removeEmptyObject → {}. A removed root → "".
    function jsonDrop(v, o) {
        if (v === null) return o.removeNull === true;
        if (typeof v === "string") return v === "" && o.removeEmptyString === true;
        if (typeof v === "object") {
            if (Array.isArray(v)) return v.length === 0 && o.removeEmptyArray === true;
            return Object.keys(v).length === 0 && o.removeEmptyObject === true;
        }
        return false; // numbers / booleans never drop
    }
    function jsonClean(v, o) {
        if (v !== null && typeof v === "object") {
            var arr = Array.isArray(v);
            var out = arr ? [] : {};
            var keys = arr ? null : Object.keys(v);
            var i, c;
            if (arr) {
                for (i = 0; i < v.length; i++) {
                    c = jsonClean(v[i], o);
                    if (!jsonDrop(c, o)) out.push(c);
                }
            } else {
                for (i = 0; i < keys.length; i++) {
                    c = jsonClean(v[keys[i]], o);
                    if (!jsonDrop(c, o)) out[keys[i]] = c;
                }
            }
            return out;
        }
        return v;
    }

    var LANG_RUNNERS = {
        "html": htmlMinify,
        "css": cssMinify,
        "javascript": jsMinify,
        "typescript": jsMinify,
        "bash": function (t, rc) { return grammarMinify(t, GRAMMARS.bash, rc); },
        "c": function (t, rc) { return grammarMinify(t, GRAMMARS.c, rc); },
        "csharp": function (t, rc, v) { return csharpMinify(t, rc, v); },
        "cpp": function (t, rc) { return grammarMinify(t, GRAMMARS.cpp, rc); },
        "go": function (t, rc) { return grammarMinify(t, GRAMMARS.go, rc); },
        "java": function (t, rc) { return grammarMinify(t, GRAMMARS.java, rc); },
        "json": function (t, rc, v, o) {
            // Remove comments ON = JSONC (// and /* */ stripped,
            // "-strings byte-exact); OFF = collapse only. Any value
            // toggle ON → parse, clean, re-stringify; a parse failure
            // keeps the collapsed text (never corrupts).
            var collapsed = grammarMinify(t, (rc && GRAMMARS.json.jsonc) ? GRAMMARS.jsonc : GRAMMARS.json, rc);
            o = o || {};
            if (!(o.removeNull || o.removeEmptyObject || o.removeEmptyArray || o.removeEmptyString)) return collapsed;
            var parsed;
            try { parsed = JSON.parse(collapsed); } catch (e) { return collapsed; }
            var cleaned = jsonClean(parsed, o);
            return jsonDrop(cleaned, o) ? "" : JSON.stringify(cleaned);
        },
        "kotlin": function (t, rc) { return grammarMinify(t, GRAMMARS.kotlin, rc); },
        "markdown": function (t, rc, v, o) {
            o = o || {};
            if (o.removeStyle === true) return markdownPlainText(t);
            return markdownMinify(t, rc); // OFF = the shipped minify, byte-exact
        },
        "php": function (t, rc) { return grammarMinify(t, GRAMMARS.php, rc); },
        "powershell": function (t, rc) { return grammarMinify(t, GRAMMARS.powershell, rc); },
        "python": function (t, rc) { return grammarMinify(t, GRAMMARS.python, rc); },
        "ruby": function (t, rc) { return grammarMinify(t, GRAMMARS.ruby, rc); },
        "rust": function (t, rc) { return grammarMinify(t, GRAMMARS.rust, rc); },
        "sql": function (t, rc) { return grammarMinify(t, GRAMMARS.sql, rc); },
        "swift": function (t, rc) { return grammarMinify(t, GRAMMARS.swift, rc); }
    };

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("code-minify: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("code-minify", {
        name: "Code minify",
        desc: "Minifies code for the chosen language (Auto guesses it). Strings and regexes stay exact.",
        keywords: "code javascript typescript html css c c# c++ rust go python ruby java kotlin swift bash php powershell sql markdown json jsonc whitespace minify",
        run: function (text, opts) {
            if (!text || !text.trim()) return "";
            opts = opts || {};
            var language = (typeof opts.language === "string" && opts.language) ? opts.language : "auto";
            // version: part of the contract. C# honours it (C#5–C#12
            // bands — see csharpMinify); every other language ignores
            // the value (the seam stays data-driven).
            var version = (typeof opts.version === "string" && opts.version) ? opts.version : "auto";
            var removeComments = opts.removeComments !== false;
            if (language === "auto") {
                // The Auto pool is all 20 supported languages.
                var guessed = guessLang(text);
                if (!guessed) return text; // zero markers: identity — never corrupt
                language = guessed;
            }
            var runner = LANG_RUNNERS[language];
            if (!runner) return text; // unknown language value: identity — safe
            return runner(text, removeComments, version, opts); // opts: json value toggles
        },
        selects: [
            {
                key: "language", label: "Language:",
                choices: [
                    { value: "auto", label: "Auto" },
                    { value: "bash", label: "Bash" },
                    { value: "c", label: "C" },
                    { value: "csharp", label: "C#" },
                    { value: "cpp", label: "C++" },
                    { value: "css", label: "CSS" },
                    { value: "go", label: "Go" },
                    { value: "html", label: "HTML" },
                    { value: "java", label: "Java" },
                    { value: "javascript", label: "JavaScript" },
                    { value: "json", label: "JSON" },
                    { value: "kotlin", label: "Kotlin" },
                    { value: "markdown", label: "Markdown" },
                    { value: "php", label: "PHP" },
                    { value: "powershell", label: "PowerShell" },
                    { value: "python", label: "Python" },
                    { value: "ruby", label: "Ruby" },
                    { value: "rust", label: "Rust" },
                    { value: "sql", label: "SQL" },
                    { value: "swift", label: "Swift" },
                    { value: "typescript", label: "TypeScript" }
                ]
            },
            {
                key: "version", label: "Version:",
                // `choices` is a FUNCTION of the card's current
                // options — the dropdown is language-aware.
                // C# gets the band list (interpolated strings need
                // C#6+, raw strings C#11+ — see csharpMinify); every
                // other language has no versions, so it shows exactly
                // ONE option: Auto (latest). recipe.js rebuilds
                // function-choices selects on option change and
                // enforces value-consistency (a saved value not in the
                // new choices resets to the first choice).
                choices: function (opts) {
                    if (opts && opts.language === "csharp") {
                        return [
                            { value: "auto", label: "Auto (latest)" },
                            { value: "csharp-12", label: "C# 12" },
                            { value: "csharp-11", label: "C# 11" },
                            { value: "csharp-10", label: "C# 10" },
                            { value: "csharp-9", label: "C# 9" },
                            { value: "csharp-8", label: "C# 8" },
                            { value: "csharp-7", label: "C# 7" },
                            { value: "csharp-6", label: "C# 6" },
                            { value: "csharp-5", label: "C# 5" }
                        ];
                    }
                    return [{ value: "auto", label: "Auto (latest)" }];
                }
            }
        ],
        checkboxes: [
            { key: "removeComments", label: "Remove comments" },
            { key: "removeNull", label: "Remove null", def: false, visible: function (o) { return o && o.language === "json"; } },
            { key: "removeEmptyObject", label: "Remove empty object {}", def: false, visible: function (o) { return o && o.language === "json"; } },
            { key: "removeEmptyArray", label: "Remove empty array []", def: false, visible: function (o) { return o && o.language === "json"; } },
            { key: "removeEmptyString", label: "Remove empty string \"\"", def: false, visible: function (o) { return o && o.language === "json"; } },
            { key: "removeStyle", label: "Remove all style (keep text only)", def: false, visible: function (o) { return o && o.language === "markdown"; } }
        ],
        defaultOptions: function () {
            return { language: "auto", version: "auto", removeComments: true, removeNull: false, removeEmptyObject: false, removeEmptyArray: false, removeEmptyString: false, removeStyle: false };
        }
    });
})(window.APM = window.APM || {});
