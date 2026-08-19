/* core/tokenize.js — heuristic token estimator.
   Zero dependencies, pure, no DOM, no globals other than window.APM.
   Deterministic and single-pass O(n); safe on `file://`.

   Contract (the UI shows "≈ N tok" — this is an ESTIMATE, not an
   exact tokenizer, and the app never claims otherwise):
     - The text is partitioned left-to-right into whole chunks:
         word runs       [A-Za-z0-9_]+
         whitespace runs \s+
         symbol runs     [^A-Za-z0-9_\s]+
       (the three classes partition the string — chunks are contiguous,
       so joining a chunk prefix reproduces the original bytes exactly).
     - Chunk costs:
         word       = 1 + floor((len − 1) / 4)   (~4 chars per token)
         symbol run = ceil(len / 2)              (~2 symbols per token)
         whitespace = 0                          (attaches to the next
                                                  chunk — no double count)
     - estimate(text)  = sum of chunk costs (empty/blank-only → 0).
     - truncate(text, budget) = the original text up to (and incl.) the
       last WHOLE chunk whose cumulative cost stays ≤ budget, with any
       trailing separator-whitespace chunks stripped ("fit N tokens" must
       not leave a dangling space) — always a byte-exact prefix of the
       input; "" when no chunk fits (or only whitespace fits).
     - Non-decreasing under appending (each cost is monotone in chunk
       length and appending only extends the final chunk or starts one). */
(function (APM) {
    "use strict";

    var CHUNK_RE = /[A-Za-z0-9_]+|\s+|[^A-Za-z0-9_\s]+/g;

    function chunkCost(chunk) {
        var len = chunk.length;
        var first = chunk.charAt(0);
        if (/\s/.test(first)) return 0;
        if (/[A-Za-z0-9_]/.test(first)) return 1 + Math.floor((len - 1) / 4);
        return Math.ceil(len / 2);
    }

    function chunks(text) {
        var out = [];
        if (!text) return out;
        CHUNK_RE.lastIndex = 0;
        var m;
        while ((m = CHUNK_RE.exec(text)) !== null) out.push(m[0]);
        return out;
    }

    function estimate(text) {
        if (!text) return 0;
        var parts = chunks(text);
        var total = 0;
        for (var i = 0; i < parts.length; i++) total += chunkCost(parts[i]);
        return total;
    }

    function truncate(text, budget) {
        if (!text || !(budget > 0)) return "";
        var parts = chunks(text);
        var total = 0;
        var cut = -1;
        for (var i = 0; i < parts.length; i++) {
            total += chunkCost(parts[i]);
            if (total <= budget) cut = i;
            else break;
        }
        if (cut === -1) return "";
        // Strip trailing zero-cost separator chunks: "fit N tokens" must
        // not leave a dangling space (the result stays a byte-exact
        // prefix of the input either way).
        while (cut >= 0 && /\s/.test(parts[cut].charAt(0))) cut--;
        if (cut === -1) return "";
        // Chunks are contiguous: joining the prefix reproduces the
        // original bytes exactly (no copy/normalisation drift).
        return parts.slice(0, cut + 1).join("");
    }

    APM.tokens = {
        chunks: chunks,
        estimate: estimate,
        truncate: truncate
    };
})(window.APM = window.APM || {});
