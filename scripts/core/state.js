/* core/state.js — the single source of truth for the working
   document: { prefix, input, recipe:[{id, options}] } + snapshot/restore.
   The prefix is the optional "System Prompt / Prefix" text that is
   placed above the input before the recipe runs (see ui/io.js).
   Cross-module references resolve at call time (all modules are
   loaded before scripts/main.js boots the app). */
(function (APM) {
    "use strict";

    var state = {
        prefix: "",
        input: "",
        recipe: [] // ordered: [{ id: string, options: object }]
    };

    function snapshot() {
        return {
            version: 2,
            savedAt: new Date().toISOString(),
            prefix: state.prefix,
            input: state.input,
            recipe: state.recipe.map(function (e) {
                return { id: e.id, options: e.options || {} };
            })
        };
    }

    // opts.keepInput (hard-save load): leave state.input and #input exactly
    // as they are — the hard save deliberately excludes the input text.
    function restore(snap, opts) {
        if (!snap || typeof snap !== "object") return;
        opts = opts || {};
        state.prefix = typeof snap.prefix === "string" ? snap.prefix : "";
        APM.dom.$("prefix").value = state.prefix;
        if (!opts.keepInput) {
            state.input = typeof snap.input === "string" ? snap.input : "";
            APM.dom.$("input").value = state.input;
        }
        state.recipe = Array.isArray(snap.recipe)
            ? snap.recipe
                .filter(function (e) {
                    return e && typeof e.id === "string" && APM.filters.get(e.id);
                })
                .map(function (e) {
                    return {
                        id: e.id,
                        options: (e.options && typeof e.options === "object") ? e.options : APM.filters.get(e.id).defaultOptions()
                    };
                })
            : [];
        APM.recipe.render();
        APM.io.recompute();
    }

    state.snapshot = snapshot;
    state.restore = restore;
    APM.state = state;
})(window.APM = window.APM || {});
