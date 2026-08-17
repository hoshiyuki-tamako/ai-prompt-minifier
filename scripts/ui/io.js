/* ui/io.js — column 3: live recompute (prefix above input → recipe → output),
   character counters, truncated badge, copy + clear. */
(function (APM) {
    "use strict";

    // The prefix is placed above the input text (single-newline join).
    // An empty prefix keeps the pipeline byte-identical to input-only.
    function combinedText() {
        var p = APM.state.prefix;
        var i = APM.state.input;
        if (p && i) return p + "\n" + i;
        return p || i;
    }

    function recompute() {
        var $ = APM.dom.$;
        var result = APM.filters.run(combinedText(), APM.state.recipe);
        $("output").value = result.text;
        $("prefix-count").textContent = APM.state.prefix.length.toLocaleString() + " chars";
        $("input-count").textContent = APM.state.input.length.toLocaleString() + " chars";
        $("output-count").textContent = result.text.length.toLocaleString() + " chars";
        $("truncated-badge").hidden = !result.truncated;
        if (APM.recipe && typeof APM.recipe.setStatuses === "function") {
            APM.recipe.setStatuses(result.metas || []);
        }
        APM.saves.persistSoon();
    }

    function init() {
        var $ = APM.dom.$;

        $("prefix").addEventListener("input", function () {
            APM.state.prefix = this.value;
            recompute();
        });

        $("clear-prefix").addEventListener("click", function () {
            APM.state.prefix = "";
            $("prefix").value = "";
            recompute();
            APM.toast.show("Prefix cleared");
        });

        $("input").addEventListener("input", function () {
            APM.state.input = this.value;
            recompute();
        });

        $("clear-input").addEventListener("click", function () {
            APM.state.input = "";
            $("input").value = "";
            recompute();
            APM.toast.show("Input cleared");
        });

        $("copy-output").addEventListener("click", function () {
            var out = $("output");
            APM.dom.copyText(out.value).then(function (ok) {
                if (ok) {
                    APM.toast.show("Copied!");
                } else {
                    out.focus();
                    out.select();
                    APM.toast.show("Copy failed \u2013 select & copy manually", true);
                }
            });
        });
    }

    APM.io = { recompute: recompute, init: init };
})(window.APM = window.APM || {});
