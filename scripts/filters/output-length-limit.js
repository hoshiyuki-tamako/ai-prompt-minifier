/* filters/output-length-limit.js — registered as "limit".
   Truncates the result to a maximum length, measured in characters
   (exact) or estimated tokens (built-in heuristic tokenizer —
   core/tokenize.js). The card options (ui/recipe.js) are rendered
   from this file's `presets` + `units`, so the option metadata lives
   with the filter, not the UI.

   Contract (M13, round-7 item 6):
     - unit "chars"  (default): the legacy byte-exact substring cut —
       behaviour is identical to the M8/M9/M10/M11/M12 contract.
     - unit "tokens": cut at the last WHOLE chunk whose cumulative
       estimated cost fits the budget (core/tokenize.js chunk model);
       `truncated` is true only when the output actually changed.
     - Old saves without a `unit` option behave exactly like "chars"
       (no migration needed). */
(function (APM) {
    "use strict";

    // Length limit presets offered in the recipe card dropdown.
    // Labels are unit-neutral — the unit select decides chars vs tokens.
    var LIMIT_PRESETS = [
        { value: 10000, label: "10,000" },
        { value: 32000, label: "32,000" },
        { value: 100000, label: "100,000" },
        { value: 200000, label: "200,000" },
        { value: 390000, label: "390,000" }
    ];

    // Units offered in the recipe card (M13, round-7 item 6).
    var LIMIT_UNITS = [
        { value: "chars", label: "Characters (exact)" },
        { value: "tokens", label: "Tokens (estimated)" }
    ];

    var DEFAULT_LIMIT = 390000; // same default as the original app
    var DEFAULT_UNIT = "chars"; // legacy behaviour by default

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("output-length-limit: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("limit", {
        name: "Output length limit",
        desc: "Truncates the result to a character or token budget.",
        keywords: "truncate length tokens characters context window budget",
        run: function (text, opts) {
            var limit = 0;
            if (opts) {
                if (String(opts.preset) === "custom") {
                    limit = (typeof opts.custom === "number" && isFinite(opts.custom)) ? Math.floor(opts.custom) : 0;
                } else {
                    var p = parseInt(opts.preset, 10);
                    limit = isNaN(p) ? 0 : p;
                }
            }
            if (!(limit > 0) || !text) return { text: text, truncated: false };

            var unit = (opts && opts.unit === "tokens") ? "tokens" : "chars";
            if (unit === "tokens") {
                if (typeof APM.tokens === "undefined" || typeof APM.tokens.truncate !== "function") {
                    return { text: text, truncated: false }; // tokenizer unavailable: fail safe (identity)
                }
                if (APM.tokens.estimate(text) > limit) {
                    var cut = APM.tokens.truncate(text, limit);
                    return { text: cut, truncated: cut !== text };
                }
                return { text: text, truncated: false };
            }
            // unit "chars" — the legacy path, byte-exact.
            if (text.length > limit) {
                return { text: text.substring(0, limit), truncated: true };
            }
            return { text: text, truncated: false };
        },
        presets: LIMIT_PRESETS,
        units: LIMIT_UNITS,
        defaultLimit: DEFAULT_LIMIT,
        defaultUnit: DEFAULT_UNIT,
        defaultOptions: function () {
            return { unit: DEFAULT_UNIT, preset: String(DEFAULT_LIMIT), custom: DEFAULT_LIMIT };
        }
    });
})(window.APM = window.APM || {});
