/* ui/recipe.js — column 2: the applied filters as ordered cards.
   Owns the card operations (add / move / remove / render) that the
   palette, dnd and saves modules call into. */
(function (APM) {
    "use strict";

    function render() {
        var $ = APM.dom.$;
        var list = $("rec-list");
        list.innerHTML = "";
        APM.state.recipe.forEach(function (entry, index) {
            list.appendChild(buildCard(entry, index));
        });
        $("recipe-empty").hidden = APM.state.recipe.length > 0;
    }

    function buildCard(entry, index) {
        var el = APM.dom.el;
        var def = APM.filters.get(entry.id);
        var card = el("li", "rec-card");
        card.dataset.index = String(index);

        // Head: drag handle + name + delete. The head (not the card) is the
        // drag source so the options below stay fully usable.
        var head = el("div", "rec-head");
        head.draggable = true;
        var handle = el("span", "rec-handle", "\u2261");
        handle.title = "Drag to reorder";
        head.appendChild(handle);
        head.appendChild(el("span", "rec-name", def ? def.name : entry.id));

        var del = el("button", "rec-delete", "\u00d7");
        del.type = "button";
        del.title = "Remove from recipe";
        del.setAttribute("aria-label", "Remove " + (def ? def.name : entry.id) + " from recipe");
        del.addEventListener("click", function () {
            remove(index);
        });
        head.appendChild(del);

        head.addEventListener("dragstart", function (e) {
            // Collapsed mode = settings-only: no reorder mid-session.
            if (APM.leftpane && APM.leftpane.isCollapsed()) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData("text/plain", "recipe:" + index);
            e.dataTransfer.effectAllowed = "move";
            APM.dnd.setState({ from: "recipe", index: index });
            card.classList.add("dragging");
        });
        head.addEventListener("dragend", function () {
            card.classList.remove("dragging");
        });

        card.appendChild(head);
        if (def && def.desc) card.appendChild(el("div", "rec-desc", def.desc));

        // M16 (T16.2): function-choices support. A select descriptor
        // may declare `choices` as a FUNCTION of the card's current
        // options (code-minify's Version: C# → the C# band list, every
        // other language incl. Auto → the single "Auto (latest)").
        // refreshDynamic() rebuilds each such select's options on any
        // option change and enforces value-consistency: a saved value
        // not among the new choices resets to the first choice (a
        // legacy csharp-N on a non-C# card → "auto"; a behaviour no-op
        // — only C# honours the version value). Static-choices
        // selects (remove-comment, dedup, …) never enter this list.
        var dynamicSelects = [];
        function refreshDynamic() {
            dynamicSelects.forEach(function (d) {
                var choices = d.sel.choices(entry.options);
                var has = false;
                for (var i = 0; i < choices.length; i++) {
                    if (choices[i].value === String(entry.options[d.sel.key])) { has = true; break; }
                }
                if (!has) entry.options[d.sel.key] = choices[0].value;
                d.select.innerHTML = "";
                choices.forEach(function (c) {
                    var o = el("option", null, c.label);
                    o.value = c.value;
                    if (String(entry.options[d.sel.key]) === c.value) o.selected = true;
                    d.select.appendChild(o);
                });
            });
        }

        // Per-filter options: "limit" has a bespoke preset+custom pair;
        // any other filter may declare generic select options via its
        // definition's `selects` list (e.g. remove-comment's language).
        if (entry.id === "limit") {
            entry.options = entry.options || {};
            var opts = el("div", "rec-options");

            // M13 (round-7 item 6): unit selector, rendered FIRST —
            // "Characters (exact)" is the legacy default; "Tokens
            // (estimated)" truncates via the built-in tokenizer.
            var uLabel = el("label", null, "Unit:");
            var uSel = el("select");
            uSel.id = "limit-unit-" + index;
            uLabel.htmlFor = uSel.id;
            (def.units || []).forEach(function (c) {
                var uo = el("option", null, c.label);
                uo.value = c.value;
                if (String(entry.options.unit || def.defaultUnit || "chars") === c.value) uo.selected = true;
                uSel.appendChild(uo);
            });
            uSel.addEventListener("change", function () {
                entry.options.unit = uSel.value;
                APM.io.recompute();
            });
            opts.appendChild(uLabel);
            opts.appendChild(uSel);

            var label = el("label", null, "Max length:");
            var sel = el("select");
            sel.id = "limit-preset-" + index;
            label.htmlFor = sel.id;

            def.presets.forEach(function (p) {
                var o = el("option", null, p.label);
                o.value = String(p.value);
                if (String(entry.options.preset) === String(p.value)) o.selected = true;
                sel.appendChild(o);
            });
            var customOpt = el("option", null, "Custom\u2026");
            customOpt.value = "custom";
            if (String(entry.options.preset) === "custom") customOpt.selected = true;
            sel.appendChild(customOpt);

            var num = el("input");
            num.type = "number";
            num.min = "1000";
            num.step = "1000";
            num.placeholder = "number";
            num.value = String(entry.options.custom || def.defaultLimit);
            var isCustom = String(entry.options.preset) === "custom";
            num.hidden = !isCustom;

            opts.appendChild(label);
            opts.appendChild(sel);
            opts.appendChild(num);

            sel.addEventListener("change", function () {
                entry.options.preset = sel.value;
                num.hidden = sel.value !== "custom";
                APM.io.recompute();
            });
            num.addEventListener("input", function () {
                entry.options.custom = parseInt(num.value, 10) || 0;
                APM.io.recompute();
            });

            card.appendChild(opts);
        }
        // M11: options descriptors render as INDEPENDENT blocks — a
        // filter may combine several kinds (code-minify = 2 selects +
        // 1 checkbox). The limit branch above stays bespoke + first.
        if (def && def.selects) {
            entry.options = entry.options || {};
            var optsBox = el("div", "rec-options");
            def.selects.forEach(function (sel) {
                var label = el("label", null, sel.label);
                var select = el("select");
                select.id = entry.id + "-" + sel.key + "-" + index;
                label.htmlFor = select.id;
                var isDyn = typeof sel.choices === "function";
                var choices = isDyn ? sel.choices(entry.options) : sel.choices;
                // Value-consistency at render time (legacy saves):
                // a stored value absent from the current choices
                // converges to the first choice ("auto").
                if (isDyn) {
                    var has = false;
                    for (var i = 0; i < choices.length; i++) {
                        if (choices[i].value === String(entry.options[sel.key])) { has = true; break; }
                    }
                    if (!has) entry.options[sel.key] = choices[0].value;
                }
                choices.forEach(function (c) {
                    var o = el("option", null, c.label);
                    o.value = c.value;
                    if (String(entry.options[sel.key]) === c.value) o.selected = true;
                    select.appendChild(o);
                });
                if (isDyn) dynamicSelects.push({ sel: sel, select: select });
                select.addEventListener("change", function () {
                    entry.options[sel.key] = select.value;
                    refreshDynamic(); // no-op when the card has none
                    APM.io.recompute();
                });
                optsBox.appendChild(label);
                optsBox.appendChild(select);
            });
            card.appendChild(optsBox);
        }
        if (def && def.inputs) {
            // Generic text-input options (regex-replace's pattern /
            // replacement / flags). Live on every keystroke, no commit.
            entry.options = entry.options || {};
            var inputsBox = el("div", "rec-options");
            def.inputs.forEach(function (inp) {
                var label = el("label", null, inp.label);
                var input = el("input");
                // M13 (round-7 item 4): number inputs (min/step) for
                // integer options like remove-extra-space's "Spaces:";
                // the text path (regex-replace) is untouched.
                input.type = (inp.type === "number") ? "number" : "text";
                if (inp.type === "number") {
                    if (inp.min != null) input.min = String(inp.min);
                    if (inp.step != null) input.step = String(inp.step);
                }
                input.spellcheck = false;
                input.id = entry.id + "-" + inp.key + "-" + index;
                label.htmlFor = input.id;
                if (inp.placeholder) input.placeholder = inp.placeholder;
                // `!= null` (not `||`) so a saved 0 renders as 0, not blank.
                input.value = String(entry.options[inp.key] != null ? entry.options[inp.key] : (inp.placeholder || ""));
                input.addEventListener("input", function () {
                    entry.options[inp.key] = (inp.type === "number") ? parseInt(input.value, 10) : input.value;
                    refreshDynamic(); // no-op when the card has none
                    APM.io.recompute();
                });
                inputsBox.appendChild(label);
                inputsBox.appendChild(input);
            });
            card.appendChild(inputsBox);
        }
        if (def && def.checkboxes) {
            // Generic checkbox/toggle options (code-minify's
            // "Remove comments"). checked = options[key] !== false,
            // so a missing key (old saves) renders the default ON.
            entry.options = entry.options || {};
            var cbsBox = el("div", "rec-options");
            def.checkboxes.forEach(function (cb) {
                var label = el("label", null, cb.label);
                var input = el("input");
                input.type = "checkbox";
                input.id = entry.id + "-" + cb.key + "-" + index;
                label.htmlFor = input.id;
                input.checked = entry.options[cb.key] !== false;
                input.addEventListener("change", function () {
                    entry.options[cb.key] = input.checked;
                    refreshDynamic(); // no-op when the card has none
                    APM.io.recompute();
                });
                cbsBox.appendChild(label);
                cbsBox.appendChild(input);
            });
            card.appendChild(cbsBox);
        }

        // Live status line (only for defs with status: true — currently
        // regex-replace). Populated by setStatuses() after each run.
        if (def && def.status) {
            var statusEl = el("div", "rec-status", "");
            statusEl.hidden = true;
            card.appendChild(statusEl);
        }

        return card;
    }

    function add(id, at) {
        if (!APM.filters.get(id)) return;
        var entry = { id: id, options: APM.filters.get(id).defaultOptions() };
        var index = (at === undefined || at === null) ? APM.state.recipe.length : at;
        index = Math.max(0, Math.min(index, APM.state.recipe.length));
        APM.state.recipe.splice(index, 0, entry);
        render();
        APM.io.recompute();
    }

    function move(from, to) {
        var recipe = APM.state.recipe;
        if (from === undefined || from < 0 || from >= recipe.length) return;
        if (to > from) to--; // removal shifts everything after `from`
        to = Math.max(0, Math.min(to, recipe.length - 1));
        if (to === from) return;
        var entry = recipe.splice(from, 1)[0];
        recipe.splice(to, 0, entry);
        render();
        APM.io.recompute();
    }

    function remove(index) {
        APM.state.recipe.splice(index, 1);
        render();
        APM.io.recompute();
    }

    // Live per-card status lines. metas = [{ index, meta }] from the
    // pipeline (registry.run); every card with a status element is
    // cleared first, then the fresh metas are applied with a tone:
    // err = invalid pattern, ok = N>0 replacements or dedup removals,
    // none = hints/no match.
    function setStatuses(metas) {
        var $ = APM.dom.$;
        var list = $("rec-list");
        var cards = list.querySelectorAll(".rec-card");
        for (var i = 0; i < cards.length; i++) {
            var st = cards[i].querySelector(".rec-status");
            if (st) {
                st.textContent = "";
                st.className = "rec-status";
                st.hidden = true;
            }
        }
        (metas || []).forEach(function (m) {
            var card = list.querySelector('.rec-card[data-index="' + m.index + '"]');
            if (!card) return;
            var st = card.querySelector(".rec-status");
            if (!st) return;
            var tone = /invalid/i.test(m.meta) ? "err"
                     : /^\d+ (replacement|duplicate)/.test(m.meta) ? "ok"
                     : "none";
            st.textContent = m.meta;
            st.className = "rec-status " + tone;
            st.hidden = false;
        });
    }

    function init() {
        APM.dom.$("clear-recipe").addEventListener("click", function () {
            if (!APM.state.recipe.length) {
                APM.toast.show("Recipe is already empty", true);
                return;
            }
            if (!confirm("Remove all filters from the recipe?")) return;
            APM.state.recipe = [];
            render();
            APM.io.recompute();
            APM.toast.show("Recipe cleared");
        });
    }

    APM.recipe = { render: render, add: add, move: move, remove: remove, setStatuses: setStatuses, init: init };
})(window.APM = window.APM || {});
