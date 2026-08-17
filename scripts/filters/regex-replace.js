/* filters/regex-replace.js — registered as "regex-replace".
   User-defined regular-expression find & replace. One pass of
   String.replace with a forced "g" flag is loop-safe: replaced text is
   never re-scanned, so `a` -> `aX` on "aaa" yields aXaXaX (not a
   runaway). The card inputs (ui/recipe.js) are rendered from this
   file's `inputs` list, so the option metadata lives with the filter,
   not the UI. The returned `meta` is a short live status line for the
   card ("N replacements" / "no match" / hint / error) — it never leaks
   into the output text (registry.js keeps it out of `text`). */
(function (APM) {
    "use strict";

    // Keep only the user-typed flags among g/i/m and force "g" so every
    // match is replaced in the single pass.
    function sanitizeFlags(flags) {
        var kept = String(flags || "").replace(/[^gim]/g, "");
        return kept.indexOf("g") === -1 ? kept + "g" : kept;
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("regex-replace: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("regex-replace", {
        name: "Regex find & replace",
        desc: "Replaces every match of a JavaScript regular expression with a replacement string ($1 back-references work, empty replacement deletes). One pass — replaced text is never re-scanned.",
        status: true,
        inputs: [
            { key: "pattern", label: "Pattern:", placeholder: "e.g. \\s+" },
            { key: "replacement", label: "Replacement:", placeholder: "text for each match (empty = remove)" },
            { key: "flags", label: "Flags:", placeholder: "i, m  (g is automatic)" }
        ],
        run: function (text, opts) {
            var pattern = (opts && typeof opts.pattern === "string") ? opts.pattern : "";
            if (!pattern) {
                return { text: text, meta: "no pattern \u2014 add one" };
            }
            var replacement = (opts && typeof opts.replacement === "string") ? opts.replacement : "";
            var flags = (opts && typeof opts.flags === "string") ? opts.flags : "";
            var re;
            try {
                re = new RegExp(pattern, sanitizeFlags(flags));
            } catch (e) {
                return { text: text, meta: "invalid pattern" };
            }
            var out = text.replace(re, replacement);
            var count = (text.match(re) || []).length;
            var meta = count ? count + " replacement" + (count === 1 ? "" : "s") : "no match";
            return { text: out, meta: meta };
        },
        defaultOptions: function () {
            return { pattern: "", replacement: "", flags: "" };
        }
    });
})(window.APM = window.APM || {});
