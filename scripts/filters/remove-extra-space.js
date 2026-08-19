/* filters/remove-extra-space.js — registered as "remove-extra-space".
   Aggressive whitespace collapse: every run of spaces, tabs and
   newlines (space/tab/CR/LF) becomes N spaces — in EVERY context,
   even inside string literals and comments (that is the point: it is
   the "flatten it all" filter) — then the result is trimmed at both
   ends. Pair with "Minify" if you want the context-aware behaviour
   instead.

   Contract (M13, round-7 item 4):
     - card option "Spaces:" = integer N (default 1, minimum 0):
         N >= 1 → every \s+ run → exactly N spaces, ends fully trimmed
         N = 0  → every \s+ run → removed entirely (the "giant blob")
     - N is floor-parsed (0.5 → 0); negative or invalid → 1.
     - N = 1 (and missing/invalid N) is byte-exact identical to the
       M8–M12 contract. */
(function (APM) {
    "use strict";

    function removeExtraSpace(text, spaces) {
        var N = parseInt(spaces, 10);
        if (isNaN(N) || N < 0) N = 1;
        if (N === 0) return text.replace(/\s+/g, "");
        return text.replace(/\s+/g, " ".repeat(N)).trim();
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("remove-extra-space: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("remove-extra-space", {
        name: "Remove extra space",
        desc: "Collapses runs of spaces and newlines into one (0 removes them all).",
        keywords: "spaces whitespace collapse trim",
        run: function (text, opts) {
            return removeExtraSpace(text, opts && opts.spaces);
        },
        inputs: [
            { key: "spaces", label: "Spaces:", type: "number", min: 0, step: 1, placeholder: "1" }
        ],
        defaultOptions: function () {
            return { spaces: 1 };
        }
    });
})(window.APM = window.APM || {});
