/* filters/remove-emoji.js — removes emoji, registered as "remove-emoji".
   Each maximal emoji sequence → exactly one space (the app's
   token-separation convention); zero-emoji input is byte-identical. */
(function (APM) {
    "use strict";

    // Base emoji ranges (curated): the SMP emoji blocks, misc symbols
    // + dingbats, misc technical, misc symbols and pictographs.
    function isBase(cp) {
        return (cp >= 0x1F000 && cp <= 0x1FAFF)
            || (cp >= 0x2600 && cp <= 0x27BF)
            || (cp >= 0x2300 && cp <= 0x23FF)
            || (cp >= 0x2B00 && cp <= 0x2BFF);
    }
    function isAttached(cp) {
        return cp === 0xFE0F // variation selector-16
            || cp === 0x20E3 // combining enclosing keycap
            || (cp >= 0x1F3FB && cp <= 0x1F3FF) // skin tones
            || (cp >= 0x1F1E6 && cp <= 0x1F1FF); // regional indicators (flag pairs)
    }
    function removeEmoji(text) {
        if (!text) return "";
        var out = [];
        var i = 0, n = text.length;
        while (i < n) {
            var cp = text.codePointAt(i);
            var w = cp > 0xFFFF ? 2 : 1;
            if (isBase(cp)) {
                i += w;
                var joinBase = false; // a consumed ZWJ joins the next base into this sequence
                while (i < n) {
                    var c2 = text.codePointAt(i);
                    var w2 = c2 > 0xFFFF ? 2 : 1;
                    if (joinBase && isBase(c2)) { joinBase = false; i += w2; continue; }
                    if (c2 === 0x200D) { // ZWJ: joins the following base
                        if (i + w2 < n && isBase(text.codePointAt(i + w2))) { joinBase = true; i += w2; continue; }
                        break;
                    }
                    if (isAttached(c2)) { i += w2; continue; }
                    break;
                }
                out.push(" "); // one space per sequence
                continue;
            }
            out.push(text.slice(i, i + w)); // non-emoji kept (incl. astral non-emoji)
            i += w;
        }
        return out.join("");
    }

    APM.filters.register("remove-emoji", {
        name: "Remove emoji",
        desc: "Removes emoji, each sequence becomes a space.",
        keywords: "emoji smiley unicode symbol flag zwj variation selector keycap skin tone",
        run: function (text) {
            if (!text || !text.trim()) return "";
            return removeEmoji(text);
        },
        defaultOptions: function () {
            return {};
        }
    });
})(window.APM = window.APM || {});
