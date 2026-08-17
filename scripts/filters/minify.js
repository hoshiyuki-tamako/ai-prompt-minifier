/* filters/minify.js — intelligent whitespace minify, registered as "minify".
   Same semantics as the original index.html default behaviour:
   double-quoted strings (with backslash escapes) are kept exactly,
   outside strings whitespace collapses to at most one space, and that
   space is only emitted when both neighbours are word characters. */
(function (APM) {
    "use strict";

    function minify(text) {
        if (!text.trim()) return "";
        var output = [];
        var i = 0;
        var pendingSpace = false;
        while (i < text.length) {
            var char = text[i];
            if (char === '"') {
                if (pendingSpace) pendingSpace = false;
                output.push('"');
                i++;
                while (i < text.length) {
                    var c = text[i];
                    if (c === "\\") {
                        output.push("\\");
                        i++;
                        if (i < text.length) {
                            output.push(text[i]);
                            i++;
                        }
                    } else if (c === '"') {
                        output.push('"');
                        i++;
                        pendingSpace = true;
                        break;
                    } else {
                        output.push(c);
                        i++;
                    }
                }
                continue;
            }
            if (/\s/.test(char)) {
                pendingSpace = true;
                i++;
            } else {
                if (pendingSpace) {
                    var last = output.length > 0 ? output[output.length - 1] : null;
                    if (last && /\w/.test(last) && /\w/.test(char)) output.push(" ");
                    pendingSpace = false;
                }
                output.push(char);
                i++;
            }
        }
        return output.join("").trim();
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("minify: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("minify", {
        name: "Minify",
        desc: "Intelligent whitespace minify — quoted strings stay exact, required spaces between identifiers are kept.",
        run: function (text) {
            return minify(text);
        },
        defaultOptions: function () {
            return {};
        }
    });
})(window.APM = window.APM || {});
