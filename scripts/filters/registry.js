/* filters/registry.js — filter registry + pipeline.
   Loaded FIRST among the filters: minify.js, output-length-limit.js
   and strip-html.js register themselves into it at load time. */
(function (APM) {
    "use strict";

    var registry = {}; // insertion order = palette order

    function register(id, def) {
        if (registry[id]) throw new Error("APM.filters.register: duplicate filter id \"" + id + "\"");
        registry[id] = def;
    }

    function get(id) {
        return registry[id] || null;
    }

    function ids() {
        return Object.keys(registry);
    }

    // Runs the recipe in order; a filter may return a string,
    // { text, truncated }, or { text, truncated, meta } — meta is a short
    // live status for the card (regex-replace) and is never part of the
    // output. Returns { text, truncated, metas } (metas = [] when none).
    function run(text, recipe) {
        var out = text;
        var truncated = false;
        var metas = [];
        for (var i = 0; i < recipe.length; i++) {
            var def = registry[recipe[i].id];
            if (!def) continue;
            var result = def.run(out, recipe[i].options || {});
            if (result && typeof result === "object") {
                truncated = truncated || !!result.truncated;
                if (typeof result.meta === "string" && result.meta) metas.push({ index: i, meta: result.meta });
                out = result.text;
            } else {
                out = result;
            }
        }
        return { text: out, truncated: truncated, metas: metas };
    }

    APM.filters = { register: register, get: get, ids: ids, run: run };
})(window.APM = window.APM || {});
