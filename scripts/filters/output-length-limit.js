/* filters/output-length-limit.js — registered as "limit".
   Truncates the result to a maximum number of characters. The card
   dropdown (ui/recipe.js) is rendered from this file's `presets`, so
   the option metadata lives with the filter, not the UI. */
(function (APM) {
    "use strict";

    // Length limit presets offered in the recipe card dropdown.
    var LIMIT_PRESETS = [
        { value: 10000, label: "10,000 chars" },
        { value: 32000, label: "32,000 chars" },
        { value: 100000, label: "100,000 chars" },
        { value: 200000, label: "200,000 chars" },
        { value: 390000, label: "390,000 chars" }
    ];

    var DEFAULT_LIMIT = 390000; // same default as the original app

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("output-length-limit: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("limit", {
        name: "Output length limit",
        desc: "Truncates the result to a maximum number of characters (for strict context windows).",
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
            if (limit > 0 && text.length > limit) {
                return { text: text.substring(0, limit), truncated: true };
            }
            return { text: text, truncated: false };
        },
        presets: LIMIT_PRESETS,
        defaultLimit: DEFAULT_LIMIT,
        defaultOptions: function () {
            return { preset: String(DEFAULT_LIMIT), custom: DEFAULT_LIMIT };
        }
    });
})(window.APM = window.APM || {});
