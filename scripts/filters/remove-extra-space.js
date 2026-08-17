/* filters/remove-extra-space.js — registered as "remove-extra-space".
   Aggressive whitespace collapse: every run of spaces, tabs and
   newlines (space/tab/CR/LF) becomes a single space — in EVERY
   context, even inside string literals and comments (that is the
   point: it is the "flatten it all" filter) — then the result is
   trimmed at both ends. Pair with "Minify" if you want the
   context-aware behaviour instead. */
(function (APM) {
    "use strict";

    function removeExtraSpace(text) {
        return text.replace(/\s+/g, " ").trim();
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("remove-extra-space: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("remove-extra-space", {
        name: "Remove extra space",
        desc: "Collapses every run of spaces, tabs and newlines — in any context, even inside strings — to one space, then trims.",
        run: function (text) {
            return removeExtraSpace(text);
        },
        defaultOptions: function () {
            return {};
        }
    });
})(window.APM = window.APM || {});
