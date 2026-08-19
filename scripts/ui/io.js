/* ui/io.js — column 3: live recompute (input → recipe → output; the
   prefix is prepended AFTER the recipe — it is never minified),
   character counters, truncated badge, copy + clear. */
(function (APM) {
    "use strict";

    // M13 (round-7 item 1): the prefix is NEVER run through the recipe.
    // The recipe runs on the input only; the raw prefix is then
    // prepended to the front, byte-exact:
    //   prefix + input non-empty → output = prefix + "\n" + recipe(input)
    //   input empty, prefix set  → output = prefix (no trailing newline)
    //   prefix empty             → output = recipe(input) (legacy anchor)
    // The prefix bytes are never altered by any filter.
    function outputText() {
        var p = APM.state.prefix;
        var i = APM.state.input;
        var r = APM.filters.run(i, APM.state.recipe);
        var out = r.text;
        if (p) out = i ? (p + "\n" + out) : p;
        return { text: out, truncated: r.truncated, metas: r.metas };
    }

    function recompute() {
        var $ = APM.dom.$;
        var result = outputText();
        $("output").value = result.text;
        $("prefix-count").textContent = APM.state.prefix.length.toLocaleString() + " chars";
        $("input-count").textContent = APM.state.input.length.toLocaleString() + " chars";
        $("output-count").textContent = result.text.length.toLocaleString() + " chars";
        // M13 (round-7 item 5): live token estimates — heuristic (the
        // built-in tokenizer, core/tokenize.js); the UI always says "≈".
        if (typeof APM.tokens !== "undefined" && typeof APM.tokens.estimate === "function") {
            $("prefix-tok").textContent = "≈ " + APM.tokens.estimate(APM.state.prefix).toLocaleString() + " tok";
            $("input-tok").textContent = "≈ " + APM.tokens.estimate(APM.state.input).toLocaleString() + " tok";
            $("output-tok").textContent = "≈ " + APM.tokens.estimate(result.text).toLocaleString() + " tok";
        }
        $("truncated-badge").hidden = !result.truncated;
        if (APM.recipe && typeof APM.recipe.setStatuses === "function") {
            APM.recipe.setStatuses(result.metas || []);
        }
        refreshPos();
        APM.saves.persistSoon();
    }

    function init() {
        var $ = APM.dom.$;

        $("prefix").addEventListener("input", function () {
            APM.state.prefix = this.value;
            recompute();
        });

        $("clear-prefix").addEventListener("click", function () {
            // M13 (round-7 item 2): confirm before clearing.
            if (!confirm("Clear the prefix?")) return;
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
            // M13 (round-7 item 2): confirm before clearing.
            if (!confirm("Clear the input?")) return;
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

        // Pane status: selectionchange covers caret/selection moves in
        // the textareas (Chromium/Firefox); the per-textarea fallbacks
        // keep Safari in step. refreshPos only writes 3 tiny strings.
        document.addEventListener("selectionchange", refreshPos);
        ["prefix", "input", "output"].forEach(function (id) {
            var ta = $(id);
            ["input", "focus", "blur", "click", "keyup"].forEach(function (ev) {
                ta.addEventListener(ev, refreshPos);
            });
        });
        refreshPos(); // initial base text ("0 ln" on a fresh boot)
    }

    // M15 (T15.5): pane status — display-only line/caret/selection info
    // in each pane's title bar. Base = "N ln" (total lines; an empty
    // pane reads 0). The FOCUSED pane appends the caret "Ln X, Col Y",
    // or a selection range "Ln A, Col A – Ln B, Col B · K ch" when a
    // range is selected. Pure display: it never feeds the pipeline,
    // state or recipe (CyberChef's pane status is the interaction
    // reference only — nothing copied).
    var PANES = [
        { ta: "prefix", pos: "prefix-pos" },
        { ta: "input", pos: "input-pos" },
        { ta: "output", pos: "output-pos" }
    ];

    // 1-based line/col for a character offset. col = offset − the
    // position of the nearest preceding "\n" (lastIndexOf miss = −1,
    // which yields col = offset + 1 — the first column).
    function lineCol(value, offset) {
        var ln = value.slice(0, offset).split("\n").length;
        var col = offset - value.lastIndexOf("\n", offset - 1);
        return { ln: ln, col: col };
    }

    function paneText(ta) {
        var v = ta.value;
        var base = (v === "" ? 0 : v.split("\n").length) + " ln";
        if (document.activeElement !== ta) return base;
        var s = ta.selectionStart, e = ta.selectionEnd;
        if (s !== e) {
            var a = lineCol(v, s), b = lineCol(v, e);
            return base + " \u00b7 Ln " + a.ln + ", Col " + a.col +
                " \u2013 Ln " + b.ln + ", Col " + b.col + " \u00b7 " + (e - s) + " ch";
        }
        var c = lineCol(v, s);
        return base + " \u00b7 Ln " + c.ln + ", Col " + c.col;
    }

    function refreshPos() {
        var $ = APM.dom.$;
        for (var i = 0; i < PANES.length; i++) {
            $(PANES[i].pos).textContent = paneText($(PANES[i].ta));
        }
    }

    APM.io = { recompute: recompute, init: init, refreshPos: refreshPos };
})(window.APM = window.APM || {});
