/* filters/remove-comment.js — registered as "remove-comment".
   Language-aware comment removal. OWN implementation: a single-pass
   character scanner that keeps string literals opaque, so comment
   markers INSIDE strings (URLs with //, hashes in Python strings,
   CSS content values containing comment-like text) are never touched.

   Replacement contract:
   - each removed comment becomes exactly ONE space (tokens never join);
   - line comments keep their terminating newline;
   - an unterminated block comment consumes to the end of the input;
   - all non-comment bytes are preserved exactly (no trimming, no other
     changes) — pair with Minify / Remove extra space to tidy spaces.

   Supports 19 languages (C, C#, C++, CSS, Go, HTML/XML, Java,
   JS/TypeScript, JSON, Kotlin, Markdown, PHP, PowerShell, Python,
   Ruby, Rust, sh/bash, SQL, Swift) plus the two Auto modes.
   C and C++ are split rows; JSON strips line + block comments
   (JSONC); the legacy c-cpp value still works (alias).

   Documented limitations:
   - JS/TS template literals are treated as raw until the closing
     backtick: `${...}` contents are not parsed (a `//` inside `${}`
     is not removed).
   - A stray unquoted quote (C-family / Python apostrophes in prose,
     e.g. "don't") swallows the rest of that line — the scanner stops
     treating it as a string at the first raw newline.
   - CSS `//` is NOT a comment (correct per CSS); HTML/XML has no
     line comments.
   - Regex literals in JS are not distinguished from division; only
     `//` and `/*` sequences are ever treated as comments.
   - sh/bash: a leading `#!` shebang line is kept (code, not comment).
   - SQL: `--` only opens a comment at a word boundary, so `1--2` is
     data; string literals may use the `''` doubling style.
   - Ruby: `=begin` / `=end` only count at the start of a line;
     heredocs are not handled.
   - PowerShell: backtick escapes and here-strings are not handled.
   - Markdown: only `<!-- ... -->` is a comment; `#` headings and
     fenced code are preserved byte-exact.
   - Go: backtick raw strings are kept opaque (no interpolation).

   Auto (default) is a SELECTION layer on top of this scanner:
   cheap marker-regex scoring guesses ONE language for the whole text;
   an all-zero score returns the text UNCHANGED (identity) so a wrong
   guess can never corrupt prose, URLs or #hashtags. The scanner
   itself is language-explicit and unchanged.

   Auto-Multi-Language is the same idea for MIXED pastes: fenced
   blocks map their language tag to a grammar (unknown tags are left
   alone); unfenced blocks are maximal runs of code-like lines (>= 2),
   each guessed per block with the Auto scorer. Everything outside a
   detected block passes through byte-exact, and the work stays cheap:
   one line split, early-exit line checks, one guess and one scanner
   pass per block -- no character walks. */
(function (APM) {
    "use strict";

    // Dropdown choices — 21 options: the two Auto modes plus 19
    // languages sorted by value (C and C++ are split rows;
    // JSON = JSONC comment strip).
    var LANGUAGES = [
        { value: "auto", label: "Auto" },
        { value: "auto-multi", label: "Auto-Multi-Language" },
        { value: "c", label: "C" },
        { value: "c-sh", label: "C#" },
        { value: "cpp", label: "C++" },
        { value: "css", label: "CSS" },
        { value: "go", label: "Go" },
        { value: "html-xml", label: "HTML/XML" },
        { value: "java", label: "Java" },
        { value: "js-ts", label: "JS/TypeScript" },
        { value: "json", label: "JSON" },
        { value: "kotlin", label: "Kotlin" },
        { value: "markdown", label: "Markdown" },
        { value: "php", label: "PHP" },
        { value: "powershell", label: "PowerShell" },
        { value: "python", label: "Python" },
        { value: "ruby", label: "Ruby" },
        { value: "rust", label: "Rust" },
        { value: "sh", label: "sh/bash" },
        { value: "sql", label: "SQL" },
        { value: "swift", label: "Swift" }
    ];

    var DEFAULT_LANGUAGE = "auto";

    // Per-language grammar table for the scanner (17 languages).
    //   lineStarts — line-comment starters (empty/absent = none);
    //     a line comment opens at the FIRST matching starter
    //   blockStart / blockEnd — block delimiters (null = none)
    //   nested — block comments nest (Rust, Swift, Kotlin)
    //   backtick — backtick template/raw strings (JS/TS, Go)
    //   triple — triple-quoted strings (Python, Swift, Kotlin)
    //   wordStart — line starters only open at a word boundary, i.e. NOT
    //     right after a word character (SQL: `1--2` is data, ` -- x` is a
    //     comment)
    //   shebang — a `#!` at the very start of the text is code, not a
    //     comment (sh/bash)
    //   lineScoped — the block delimiters only count at the start of a
    //     line, on open AND close (Ruby =begin / =end)
    var GRAMMAR = {
        "c-sh":       { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: false, triple: false },
        "c":          { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: false, triple: false },
        "java":       { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: false, triple: false },
        "js-ts":      { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: true,  triple: false },
        "rust":       { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: true,  backtick: false, triple: false },
        "python":     { lineStarts: ["#"],    blockStart: null,   blockEnd: null,    nested: false, backtick: false, triple: true  },
        "css":        { lineStarts: [],       blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: false, triple: false },
        "html-xml":   { lineStarts: [],       blockStart: "<!--", blockEnd: "-->",  nested: false, backtick: false, triple: false },
        "go":         { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: true,  triple: false },
        "php":        { lineStarts: ["//", "#"], blockStart: "/*", blockEnd: "*/", nested: false, backtick: false, triple: false },
        "sql":        { lineStarts: ["--"],   blockStart: "/*",   blockEnd: "*/",    nested: false, backtick: false, triple: false, wordStart: true },
        "markdown":   { lineStarts: [],       blockStart: "<!--", blockEnd: "-->",  nested: false, backtick: false, triple: false },
        "swift":      { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: true,  backtick: false, triple: true  },
        "kotlin":     { lineStarts: ["//"],   blockStart: "/*",   blockEnd: "*/",    nested: true,  backtick: false, triple: true  },
        "sh":         { lineStarts: ["#"],    blockStart: null,   blockEnd: null,    nested: false, backtick: false, triple: false, shebang: true },
        "powershell": { lineStarts: ["#"],    blockStart: "<#",   blockEnd: "#>",    nested: false, backtick: false, triple: false },
        "ruby":       { lineStarts: ["#"],    blockStart: "=begin", blockEnd: "=end", nested: false, backtick: false, triple: false, lineScoped: true }
    };
    // C/C++ split — cpp and the legacy c-cpp value (old saves)
    // alias the single C-family row; JSON = JSONC comment strip
    // (// and /* */ removed, "-strings byte-exact).
    GRAMMAR["cpp"] = GRAMMAR["c"];
    GRAMMAR["c-cpp"] = GRAMMAR["c"];
    GRAMMAR["json"] = { lineStarts: ["//"], blockStart: "/*", blockEnd: "*/", nested: false, backtick: false, triple: false };

    // Auto-language markers: distinctive source-level syntax per
    // language (plain, non-global regexes so .test() is stateless).
    // The guess is a handful of linear regex scans per language with an
    // early exit at 3 hits -- cheap, never a character walk.
    var MARKERS = {
        "c-sh": [
            /\busing\s+System\./,
            /\bnamespace\s+[A-Za-z_][\w.]*\s*\{/,
            /\bpublic\s+(?:static\s+)?(?:void|class|enum|struct|interface)\s+\w+/,
            /\bConsole\.Write(?:Line|Error)?\s*\(/
        ],
        "c-cpp": [
            /#\s*include\s*[<"]/,
            /\bstd::[A-Za-z_]/,
            /\bint\s+main\s*\(/,
            /#\s*define\s+\w+/,
            /->\s*[A-Za-z_]/
        ],
        "css": [
            /@media\s*\(/,
            /@keyframes\s+[A-Za-z-]/,
            /@font-face\s*\{/,
            /font-family\s*:/,
            /[.#][A-Za-z][\w-]*\s*\{/,
            /!important\b/
        ],
        "html-xml": [
            /<!DOCTYPE\s+html/i,
            /<\/?(?:html|head|body|div|span|meta|link|script|style|ul|li|p|table|form|input|img)\b/i,
            /<\/[A-Za-z][\w-]*>/,
            /<\?xml[\s>]/
        ],
        "java": [
            /\bpackage\s+[a-z][\w.]*\s*;/,
            /\bSystem\.out\.print/,
            /\bpublic\s+(?:static\s+)?(?:class|interface|enum)\s+\w+/,
            /\bimport\s+[a-z][\w.]*\.\w+/,
            /@Override\b/
        ],
        "js-ts": [
            /\bfunction\s+\w+\s*\(/,
            /=>/,
            /\b(?:const|let|var)\s+\w+\s*=/,
            /\bconsole\.(?:log|error|warn|info)\s*\(/,
            /\brequire\s*\(/,
            /\bimport\s+[\w{*=\s]+\s+from\s+["']/
        ],
        "python": [
            /\bdef\s+\w+\s*\(/,
            /\bfrom\s+[\w.]+\s+import\s+[\w,*]/,
            /\bif\s+__name__\s*==/,
            /\bself\.[A-Za-z_]/,
            /\bclass\s+\w+\s*:/
        ],
        "rust": [
            /\bpub\s+(?:fn|struct|enum|mod|use)\b/,
            /\bfn\s+\w+\s*\(/,
            /\blet\s+(?:mut\s+)?\w+\s*=/,
            /\bimpl\s+(?:[A-Za-z_<])/,
            /\buse\s+(?:std|crate|super|self)\b/,
            /\bmatch\s+\w+\s*\{/
        ],
        "go": [
            /\bpackage\s+[a-z][\w]*/,
            /\bfunc\s+\w+\s*\(/,
            /:=/,
            /\bfmt\.Print/,
            /\bdefer\s+\w/
        ],
        "php": [
            /<\?php\b/,
            /\$[A-Za-z_]/,
            /\bfunction\s+\w+\s*\(/,
            /\becho\b/,
            /\barray\s*\(/,
            /\$this\b/
        ],
        "sql": [
            /\bSELECT\b/,
            /\bFROM\b/,
            /\bWHERE\b/,
            /\bINSERT\s+INTO\b/i,
            /\bJOIN\b/i,
            /\bCREATE\s+(?:TABLE|INDEX|VIEW)\b/i
        ],
        "markdown": [
            /^#{1,6}\s/m,
            /\*\*[^*\n]+\*\*/,
            /^\s*[-*]\s+/m,
            /\[[^\]]+\]\([^)\s]+\)/,
            /^\s*```/m
        ],
        "swift": [
            /\bimport\s+(?:Foundation|UIKit|SwiftUI|Combine)\b/,
            /\bfunc\s+\w+[^{]*->/,
            /\bprint\s*\(/,
            /\bguard\s+let\b/,
            /\bvar\s+\w+\s*:\s*[A-Z]/
        ],
        "kotlin": [
            /\bfun\s+\w+\s*\(/,
            /\bval\s+\w+\s*=/,
            /\bdata\s+class\b/,
            /println\s*\(/,
            /\bimport\s+kotlinx?\b/,
            /\bobject\s+\w+\s*\{/ 
        ],
        "sh": [
            /^#!\s*\/bin\//m,
            /\bset\s+-[a-z]/,
            /\b(?:then|else|fi|do|done)\b/,
            /\$\(/,
            /\becho\b/,
            /^\s*\[[^\]]*\]\s+(?:-|then)/m
        ],
        "powershell": [
            /\bGet-(?:ChildItem|Content|Process|Service|Location|Command)\b/,
            /\bWrite-(?:Host|Output|Error|Warning)\b/,
            /\bforeach\s*\(/,
            /\bparam\s*\(/,
            /\$PSVersionTable/,
            /-split|-join|-replace\b/
        ],
        "ruby": [
            /\bdef\s+\w+/,
            /\bputs\s+/,
            /\brequire\s+["']/,
            /__END__/,
            /^\s*\$[A-Za-z_]/m,
            /\bclass\s+\w+\b.*\bend\b/m
        ]
    };

    // Tie-break priority when scores are equal: C-family first (those
    // scanners share semantics, so a C-family tie is harmless). Only a
    // strictly better score replaces the current best, so the earlier
    // language wins ties.
    var GUESS_PRIORITY = ["c-sh", "c-cpp", "java", "go", "js-ts", "swift", "kotlin", "rust", "php", "ruby", "python", "sql", "powershell", "sh", "css", "markdown", "html-xml"];

    // Guess the single language of a text by marker scoring.
    // Returns a grammar key, or null when nothing scores (the caller
    // then leaves the text unchanged -- the safe identity fallback).
    function guessLanguage(text) {
        var best = null;
        var bestScore = 0;
        for (var p = 0; p < GUESS_PRIORITY.length; p++) {
            var lang = GUESS_PRIORITY[p];
            var markers = MARKERS[lang];
            var score = 0;
            for (var m = 0; m < markers.length && score < 3; m++) {
                if (markers[m].test(text)) score++;
            }
            if (score > bestScore) {
                bestScore = score;
                best = lang;
            }
        }
        return bestScore > 0 ? best : null;
    }

    // Auto-Multi-Language: strip comments only inside detected
    // code blocks; everything else passes through byte-exact.
    //   - fenced blocks: an opening "```lang" fence maps the tag to a
    //     grammar (unknown tag -> block left untouched); the fence
    //     lines themselves are always preserved
    //   - unfenced blocks: maximal runs of code-like lines (blank lines
    //     inside do not break the run); the run is split at blank
    //     lines into segments and each segment of >= 2 code-like lines
    //     is guessed with guessLanguage() (null -> segment left
    //     untouched), so adjacent blocks in different languages keep
    //     their own grammar
    // Cheap by design: one line split, per-line early-exit checks, one
    // guess per block, one scanner pass per block. No character walks.

    var FENCE_TAGS = {
        "python": "python",
        "rust": "rust",
        "c": "c-cpp",
        "cpp": "c-cpp",
        "c++": "c-cpp",
        "cs": "c-sh",
        "csharp": "c-sh",
        "java": "java",
        "js": "js-ts",
        "ts": "js-ts",
        "javascript": "js-ts",
        "typescript": "js-ts",
        "css": "css",
        "html": "html-xml",
        "xml": "html-xml",
        "go": "go",
        "golang": "go",
        "php": "php",
        "sql": "sql",
        "md": "markdown",
        "markdown": "markdown",
        "swift": "swift",
        "kotlin": "kotlin",
        "sh": "sh",
        "shell": "sh",
        "bash": "sh",
        "powershell": "powershell",
        "pwsh": "powershell",
        "ps1": "powershell",
        "ruby": "ruby",
        "rb": "ruby"
    };

    function isFenceLine(t) {
        return t.length >= 3 && t.charAt(0) === "`" && t.charAt(1) === "`" && t.charAt(2) === "`";
    }

    function isCodeLine(line) {
        var t = line.replace(/\r$/, "").trim();
        if (!t) return false;
        if (line.charAt(0) === " " || line.charAt(0) === "\t") return true;
        if (/[;{}]/.test(t) || /=>/.test(t)) return true;
        if (/\b(?:def|fn|func|class|public|static|void|int|return|const|let|var)\s/.test(t)) return true;
        if (/#\s*include/.test(t)) return true;
        if (/<\/?[A-Za-z][\w-]*/.test(t)) return true;
        if (/(?<!:)\/\/|\/\*/.test(t)) return true;
        if (/[\"']/.test(t) && t.indexOf("=") !== -1) return true;
        // (Go / sh / PHP+PS vars / SQL keywords / Kotlin) —
        // each an O(line) check with the same early-exit style.
        if (/:=/.test(t)) return true;
        if (/^#!\//.test(t)) return true;
        if (/\$[A-Za-z_]/.test(t)) return true;
        if (/\b(?:SELECT|INSERT|CREATE|UPDATE|DELETE|FROM|WHERE)\b/.test(t)) return true;
        if (/\bfun\s/.test(t)) return true;
        // Comment-continuation shapes keep multi-line comments inside one
        // run: "* JSDoc" style lines and a closing "*/".
        if (t.charAt(0) === "*") return true;
        if (t.length >= 2 && t.charAt(t.length - 2) === "*" && t.charAt(t.length - 1) === "/") return true;
        return false;
    }

    function runMulti(text) {
        var lines = text.split("\n");
        var n = lines.length;
        var out = [];
        var i = 0;
        while (i < n) {
            var t = lines[i].replace(/\r$/, "").trim();
            if (isFenceLine(t)) {
                var tag = t.replace(/^`+/, "").trim().toLowerCase();
                var grammar = FENCE_TAGS[tag] || null;
                var j = i + 1;
                var block = [];
                var closed = false;
                while (j < n) {
                    var jt = lines[j].replace(/\r$/, "").trim();
                    if (isFenceLine(jt) && jt.replace(/`+/g, "").trim() === "") { closed = true; break; }
                    block.push(lines[j]);
                    j++;
                }
                var blockText = block.join("\n");
                if (grammar) blockText = removeComments(blockText, grammar);
                out.push(lines[i]);
                out.push(blockText);
                if (closed) out.push(lines[j]);
                i = closed ? j + 1 : n;
                continue;
            }
            var start = i;
            var codeCount = 0;
            var k = i;
            while (k < n) {
                var kt = lines[k].replace(/\r$/, "").trim();
                if (isFenceLine(kt)) break;
                if (!kt) { k++; continue; }
                if (isCodeLine(lines[k])) { codeCount++; k++; }
                else break;
            }
            if (k === i) {
                out.push(lines[i]);
                i++;
                continue;
            }
            if (codeCount >= 2) {
                // Blank lines split the region into segments, each guessed
                // and stripped independently -- so adjacent blocks in
                // DIFFERENT languages (separated by a blank line) each get
                // their own grammar instead of one whole-region guess.
                var region = lines.slice(start, k);
                var parts = [];
                var segStart = 0;
                for (var s = 0; s <= region.length; s++) {
                    var blank = (s === region.length) || !region[s].replace(/\r$/, "").trim();
                    if (!blank) continue;
                    if (s > segStart) {
                        var segText = region.slice(segStart, s).join("\n");
                        if (s - segStart >= 2) {
                            var lang = guessLanguage(segText);
                            if (lang) segText = removeComments(segText, lang);
                        }
                        parts.push(segText);
                    }
                    if (s < region.length) parts.push(region[s]); // the blank line itself
                    segStart = s + 1;
                }
                out.push(parts.join("\n"));
            } else {
                out.push(lines.slice(start, k).join("\n"));
            }
            i = k;
        }
        return out.join("\n");
    }

    function startsWith(text, i, s) {
        if (i + s.length > text.length) return false;
        for (var k = 0; k < s.length; k++) {
            if (text[i + k] !== s[k]) return false;
        }
        return true;
    }

    // Length of the string literal starting at i (per this grammar), or 0
    // if position i does not start a string. Backslash escapes are honored;
    // a raw newline inside a non-multiline string means "not a string".
    function stringLength(text, i, g) {
        if (g.triple && (text[i] === "'" || text[i] === '"')) {
            var triple = text.substr(i, 3);
            if (triple === "'''" || triple === '"""') {
                var t = i + 3;
                while (t < text.length) {
                    if (text[t] === "\\") { t += 2; continue; }
                    if (startsWith(text, t, triple)) return t + 3 - i;
                    t++;
                }
                return text.length - i; // unterminated: consume to end
            }
        }
        var q = text[i];
        if (q === '"' || q === "'" || (g.backtick && q === "`")) {
            var multiline = g.backtick && q === "`"; // only templates span raw newlines
            var k = i + 1;
            while (k < text.length) {
                var c = text[k];
                if (c === "\\") { k += 2; continue; }
                if (c === "\n" && !multiline) return 0;
                if (c === q) return k + 1 - i;
                k++;
            }
            return multiline ? text.length - i : 0;
        }
        return 0;
    }

    function removeComments(text, language) {
        // Unknown keys (e.g. corrupt saved options) fall back to JS/TS.
        var g = GRAMMAR[language] || GRAMMAR["js-ts"];
        var n = text.length;
        var out = [];
        var i = 0;
        while (i < n) {
            // 1) string literal — always opaque.
            var s = stringLength(text, i, g);
            if (s > 0) {
                out.push(text.substr(i, s));
                i += s;
                continue;
            }
            // 2) line comment — to end of line (newline itself preserved).
            //    A grammar may have several starters (PHP: // and #); the
            //    first match wins. wordStart (SQL) requires the char before
            //    the starter not to be a word character (1--2 is data);
            //    shebang (sh) keeps a leading #! line as code.
            var lineStartHit = null;
            if (g.lineStarts) {
                for (var L = 0; L < g.lineStarts.length; L++) {
                    if (startsWith(text, i, g.lineStarts[L])) { lineStartHit = g.lineStarts[L]; break; }
                }
            }
            if (lineStartHit) {
                var wordOk = true;
                if (g.wordStart && i > 0 && /[A-Za-z0-9_]/.test(text.charAt(i - 1))) wordOk = false;
                var shebangOk = !(g.shebang && i === 0 && n > 1 && text.charAt(1) === "!");
                if (wordOk && shebangOk) {
                    var nl = text.indexOf("\n", i);
                    out.push(" ");
                    if (nl === -1) break; // to end of input
                    i = nl;               // the newline is emitted as normal text
                    continue;
                }
            }
            // 3) block comment — to matching close (Rust/Swift/Kotlin nest).
            //    lineScoped (Ruby) requires the delimiters at line start.
            if (g.blockStart && startsWith(text, i, g.blockStart)) {
                var scopeOk = !g.lineScoped || i === 0 || text.charAt(i - 1) === "\n";
                if (scopeOk) {
                var depth = 1;
                var j = i + g.blockStart.length;
                var end = -1;
                while (j < n) {
                    if (g.nested && startsWith(text, j, g.blockStart)) {
                        depth++;
                        j += g.blockStart.length;
                        continue;
                    }
                    if (startsWith(text, j, g.blockEnd)) {
                        // lineScoped: a close delimiter mid-line (Ruby
                        // `x = 1 # =end`) is not a real close.
                        if (g.lineScoped && j > 0 && text.charAt(j - 1) !== "\n") {
                            j += g.blockEnd.length;
                            continue;
                        }
                        depth--;
                        if (depth === 0) { end = j + g.blockEnd.length; break; }
                        j += g.blockEnd.length;
                        continue;
                    }
                    j++;
                }
                out.push(" ");
                if (end === -1) break; // unterminated: consume to end
                i = end;
                continue;
                } // end scopeOk (lineScoped open guard)
            }
            // 4) ordinary character.
            out.push(text[i]);
            i++;
        }
        return out.join("");
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("remove-comment: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("remove-comment", {
        name: "Remove comments",
        desc: "Removes comments — Auto (default) guesses the language, or pick one for exact control.",
        keywords: "strip comments auto multi-language c c# c++ css go html xml java javascript typescript json jsonc kotlin markdown php powershell python ruby rust sh bash sql swift",
        run: function (text, opts) {
            var language = (opts && typeof opts.language === "string") ? opts.language : DEFAULT_LANGUAGE;
            if (language === "auto-multi") {
                return runMulti(text);
            }
            if (language === "auto") {
                var guessed = guessLanguage(text);
                if (!guessed) return text; // zero markers: identity -- never corrupt
                return removeComments(text, guessed);
            }
            return removeComments(text, language);
        },
        selects: [
            { key: "language", label: "Language:", choices: LANGUAGES }
        ],
        defaultOptions: function () {
            return { language: DEFAULT_LANGUAGE };
        }
    });
})(window.APM = window.APM || {});
