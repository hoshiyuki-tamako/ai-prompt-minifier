/* filters/dedup.js — registered as "dedup".
   Duplicate line dedup: removes exact duplicate LINES, or exact
   duplicate BLOCKS (maximal runs of consecutive non-blank lines),
   keeping the first occurrence and reporting the removal count on
   the card (status: true). Matching is BYTE-EXACT — no trimming,
   no casefolding — so a CRLF line and its LF twin are DIFFERENT
   lines. A blank line is empty or whitespace-only. "Ignore blank
   lines" (ON by default) exempts blank lines in lines mode, and in
   blocks mode lets a removed duplicate block eat one adjacent blank
   separator (the one before it if present, else the one after) so
   the paragraph rhythm stays sane. */
(function (APM) {
    "use strict";

    function isBlank(line) { return line.trim() === ""; }

    // lines mode: first occurrence of each byte-exact line wins;
    // blanks are exempt (always kept, never registered) when the
    // option is ON.
    function dedupLines(text, ignoreBlank) {
        var lines = text.split("\n");
        var seen = Object.create(null);
        var out = [];
        var removed = 0;
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (isBlank(line) && ignoreBlank) { out.push(line); continue; }
            if (seen[line]) { removed++; continue; }
            seen[line] = true;
            out.push(line);
        }
        return { text: out.join("\n"), removed: removed };
    }

    // blocks mode: a block = maximal run of consecutive non-blank
    // lines; identity = the lines joined with "\n". A later identical
    // block is removed; with the option ON it also eats one adjacent
    // blank separator (before-preferred, after-fallback).
    function dedupBlocks(text, ignoreBlank) {
        var lines = text.split("\n");
        var seen = Object.create(null);
        var out = [];
        var removed = 0;
        var i = 0;
        while (i < lines.length) {
            if (isBlank(lines[i])) { out.push(lines[i]); i++; continue; }
            var j = i;
            while (j + 1 < lines.length && !isBlank(lines[j + 1])) j++;
            var block = lines.slice(i, j + 1);
            var id = block.join("\n");
            if (!seen[id]) {
                seen[id] = true;
                out = out.concat(block);
            } else {
                removed++;
                if (ignoreBlank) {
                    if (out.length && isBlank(out[out.length - 1])) {
                        out.pop(); // the blank separator right before it
                    } else if (j + 1 < lines.length && isBlank(lines[j + 1])) {
                        j++; // the blank separator right after it
                    }
                }
            }
            i = j + 1;
        }
        return { text: out.join("\n"), removed: removed };
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("dedup: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("dedup", {
        name: "Duplicate line dedup",
        desc: "Removes duplicate lines or blocks, keeping the first occurrence.",
        keywords: "duplicate lines blocks dup",
        status: true,
        selects: [
            {
                key: "mode", label: "Mode:",
                choices: [
                    { value: "lines", label: "Lines — exact duplicate lines (first kept)" },
                    { value: "blocks", label: "Blocks — exact duplicate runs of consecutive non-blank lines" }
                ]
            }
        ],
        checkboxes: [
            { key: "ignoreBlank", label: "Ignore blank lines" }
        ],
        run: function (text, opts) {
            if (!text || !text.trim()) return "";
            opts = opts || {};
            var mode = (opts.mode === "blocks") ? "blocks" : "lines";
            var ignoreBlank = opts.ignoreBlank !== false;
            var r = (mode === "blocks") ? dedupBlocks(text, ignoreBlank) : dedupLines(text, ignoreBlank);
            var noun = (mode === "blocks") ? "block" : "line";
            var meta = r.removed ?
                r.removed + " duplicate " + noun + (r.removed === 1 ? "" : "s") + " removed" :
                "no duplicate " + noun + "s";
            return { text: r.text, meta: meta };
        },
        defaultOptions: function () {
            return { mode: "lines", ignoreBlank: true };
        }
    });
})(window.APM = window.APM || {});
