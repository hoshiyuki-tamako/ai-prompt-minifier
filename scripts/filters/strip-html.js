/* filters/strip-html.js — registered as "strip-html".
   Own implementation: removes comments and tags, then decodes the
   common named entities and numeric character references. A lone
   "&" that is not an entity is left alone. */
(function (APM) {
    "use strict";

    var NAMED_ENTITIES = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: "\"",
        apos: "'",
        nbsp: " "
    };

    function safeCodePoint(cp) {
        if (isNaN(cp) || cp < 0 || cp > 0x10FFFF) return " ";
        try {
            return String.fromCodePoint(cp);
        } catch (err) {
            return " ";
        }
    }

    function stripHtml(text) {
        if (!text) return "";
        var t = text.replace(/<!--[\s\S]*?(?:-->|$)/g, " ");
        t = t.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*[^<>]*>|<!DOCTYPE[^<>]*>/gi, " ");
        t = t.replace(/&#(\d+);/g, function (m, d) {
            return safeCodePoint(parseInt(d, 10));
        });
        t = t.replace(/&#x([0-9a-fA-F]+);/g, function (m, d) {
            return safeCodePoint(parseInt(d, 16));
        });
        t = t.replace(/&([a-zA-Z]+);/g, function (m, name) {
            var key = name.toLowerCase();
            return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
        });
        return t;
    }

    if (!APM.filters || typeof APM.filters.register !== "function") {
        throw new Error("strip-html: scripts/filters/registry.js must be loaded first");
    }
    APM.filters.register("strip-html", {
        name: "Strip HTML",
        desc: "Removes HTML comments and tags, decodes common entities.",
        keywords: "html tags entities decode",
        run: function (text) {
            return stripHtml(text);
        },
        defaultOptions: function () {
            return {};
        }
    });
})(window.APM = window.APM || {});
