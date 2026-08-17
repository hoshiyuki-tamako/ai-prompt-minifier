/* ui/saves.js — local save/load, two distinct models:
   HARD save (Save button, apm.saves: name → snapshot): the user's
   reusable setup — prefix + recipe (with option values), v3 shape.
   Deliberately NO input text; loading one never touches #input.
   Theme is NOT part of a profile: apm.theme is an independent
   auto-saved setting (see scripts/ui/theme.js); loading a profile
   never changes the user's theme.
   SOFT save (auto, apm.lastState): the working state — prefix +
   input + recipe — debounced ~5 s after the last change and flushed
   on pagehide/beforeunload, so closing the tab resumes where the
   user left off. Best-effort only: a failed soft save never blocks
   or toasts; the app just has less to resume next time. */
(function (APM) {
    "use strict";

    var SOFT_DEBOUNCE_MS = 5000; // "around 5 seconds" per the requirement

    function refresh() {
        var saves = APM.storage.get("apm.saves") || {};
        var sel = APM.dom.$("save-list");
        sel.innerHTML = "";
        var none = APM.dom.el("option", null, "-- Load --");
        none.value = "";
        sel.appendChild(none);
        Object.keys(saves).sort().forEach(function (name) {
            var o = APM.dom.el("option", null, name);
            o.value = name;
            sel.appendChild(o);
        });
    }

    // HARD save: prefix + recipe (copied). No input, no theme — by
    // design the theme lives in its own auto-saved key (apm.theme).
    // v3 shape; v2 saves (stray "theme" key) still load — the key is
    // simply ignored, no migration.
    function hardSnapshot(name) {
        var base = APM.state.snapshot();
        return {
            version: 3,
            savedAt: base.savedAt,
            name: name,
            prefix: base.prefix,
            recipe: base.recipe
        };
    }

    // SOFT save: the full working state incl. the input box.
    // Never throws: a failed soft save is non-critical by contract —
    // the app just has less to resume next time.
    function persistNow() {
        try {
            APM.storage.set("apm.lastState", APM.state.snapshot());
        } catch (err) {
            // best-effort; ignore
        }
    }

    function persistSoon() {
        if (persistSoon.timer) clearTimeout(persistSoon.timer);
        persistSoon.timer = setTimeout(function () {
            persistSoon.timer = null;
            persistNow();
        }, SOFT_DEBOUNCE_MS);
    }

    // ---------- Export / import (apm.saves as JSON) ----------
    // The modal is the only place the whole apm.saves map travels as
    // text: click-to-copy, Blob download, and wipe-replace import
    // (ONE always-ask confirm; working state + theme are NEVER touched).

    function savesJson() {
        return JSON.stringify(APM.storage.get("apm.saves") || {});
    }

    function openModal() {
        var $ = APM.dom.$;
        var ta = $("saves-json");
        ta.readOnly = true;
        ta.value = savesJson();
        $("save-modal-hint").textContent = "Click the text to copy it.";
        $("import-confirm-row").hidden = true;
        $("save-modal").hidden = false;
        ta.focus();
    }

    function closeModal() {
        APM.dom.$("save-modal").hidden = true;
    }

    function startImport() {
        var $ = APM.dom.$;
        var ta = $("saves-json");
        ta.readOnly = false;
        $("save-modal-hint").textContent = "Paste your JSON here, then confirm.";
        $("import-confirm-row").hidden = false;
        ta.focus();
    }

    function cancelImport() {
        var $ = APM.dom.$;
        var ta = $("saves-json");
        ta.readOnly = true;
        ta.value = savesJson(); // discard whatever was pasted
        $("save-modal-hint").textContent = "Click the text to copy it.";
        $("import-confirm-row").hidden = true;
    }

    // Validate an imported map: { name: { prefix?: string,
    // recipe?: [{ id: known filter, options?: object }] } }. Invalid
    // entries (and unknown filter ids) are SKIPPED, never fatal. The
    // accepted entries are rebuilt as clean { prefix, recipe } pairs so
    // a later hard load needs nothing else.
    function validateSaves(raw) {
        var valid = {};
        var skipped = 0;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
            return { valid: valid, skipped: 1, badRoot: true };
        }
        Object.keys(raw).forEach(function (name) {
            var n = String(name).trim().slice(0, 80);
            var v = raw[name];
            if (!n || !v || typeof v !== "object" || Array.isArray(v)) { skipped++; return; }
            var hasPrefix = Object.prototype.hasOwnProperty.call(v, "prefix");
            var hasRecipe = Object.prototype.hasOwnProperty.call(v, "recipe");
            if (!hasPrefix && !hasRecipe) { skipped++; return; }
            if (hasPrefix && typeof v.prefix !== "string") { skipped++; return; }
            var recipeOk = true;
            if (hasRecipe) {
                if (!Array.isArray(v.recipe)) {
                    recipeOk = false;
                } else {
                    v.recipe.forEach(function (e) {
                        if (!e || typeof e !== "object" || Array.isArray(e) ||
                            typeof e.id !== "string" || !APM.filters.get(e.id)) {
                            recipeOk = false;
                            return;
                        }
                        if (e.options !== undefined &&
                            (typeof e.options !== "object" || e.options === null || Array.isArray(e.options))) {
                            recipeOk = false;
                        }
                    });
                }
            }
            if (!recipeOk) { skipped++; return; }
            valid[n] = {
                prefix: hasPrefix ? v.prefix : "",
                recipe: hasRecipe ? v.recipe.map(function (e) {
                    return { id: e.id, options: (e.options && typeof e.options === "object") ? e.options : {} };
                }) : []
            };
        });
        return { valid: valid, skipped: skipped, badRoot: false };
    }

    function confirmImport() {
        var $ = APM.dom.$;
        var raw;
        try {
            raw = JSON.parse($("saves-json").value);
        } catch (err) {
            APM.toast.show("Invalid JSON \u2014 import cancelled", true);
            return;
        }
        var parsed = validateSaves(raw);
        if (parsed.badRoot) {
            APM.toast.show("Invalid JSON \u2014 expected a {name: {prefix, recipe}} map", true);
            return;
        }
        // Wipe-replace by user contract: one always-ask confirm before
        // anything is removed.
        var current = Object.keys(APM.storage.get("apm.saves") || {}).length;
        if (!confirm("Import will REPLACE the saved profiles in this browser (" + current + " current save(s) will be removed). Continue?")) return;
        var imported = parsed.valid;
        if (APM.storage.set("apm.saves", imported)) {
            refresh();
            closeModal();
            APM.toast.show("Imported " + Object.keys(imported).length + " save(s) (" + parsed.skipped + " skipped)");
        } else {
            APM.toast.show("Import failed (storage blocked?)", true);
        }
    }

    function init() {
        var $ = APM.dom.$;

        $("save-btn").addEventListener("click", function () {
            var raw = prompt("Save prefix + recipe as:", "my-prompt");
            if (raw === null) return;
            var name = raw.trim().slice(0, 80);
            if (!name) {
                APM.toast.show("Enter a save name", true);
                return;
            }
            var saves = APM.storage.get("apm.saves") || {};
            if (saves[name] && !confirm("Overwrite existing save \u201c" + name + "\u201d?")) return;
            saves[name] = hardSnapshot(name);
            if (APM.storage.set("apm.saves", saves)) {
                refresh();
                $("save-list").value = name;
                APM.toast.show("Saved \u201c" + name + "\u201d");
            } else {
                APM.toast.show("Saving failed (storage blocked?)", true);
            }
        });

        $("load-btn").addEventListener("click", function () {
            var name = $("save-list").value;
            if (!name) {
                // M10: empty "-- Load --" selection = reset prefix +
                // recipe to the new-user defaults (empty prefix,
                // [Minify]) — the input box AND the theme are left
                // untouched (the theme is an independent auto-saved
                // setting, never part of a profile).
                APM.state.restore({ prefix: "", recipe: [{ id: "minify", options: {} }] }, { keepInput: true });
                APM.toast.show("Reset prefix + recipe (input + theme kept)");
                return;
            }
            var saves = APM.storage.get("apm.saves") || {};
            var snap = saves[name];
            if (!snap || typeof snap !== "object") {
                refresh();
                APM.toast.show("Save not found", true);
                return;
            }
            // Hard load: prefix + recipe; the input box AND the theme
            // are left exactly as the user left them (v2 saves' stray
            // "theme" key is ignored).
            APM.state.restore(snap, { keepInput: true });
            APM.toast.show("Loaded \u201c" + name + "\u201d");
        });

        $("delete-save-btn").addEventListener("click", function () {
            var name = $("save-list").value;
            if (!name) {
                APM.toast.show("Choose a saved state to delete", true);
                return;
            }
            if (!confirm("Delete save \u201c" + name + "\u201d?")) return;
            var saves = APM.storage.get("apm.saves") || {};
            delete saves[name];
            APM.storage.set("apm.saves", saves);
            refresh();
            APM.toast.show("Deleted \u201c" + name + "\u201d");
        });

        // Closing/hiding the tab: flush the soft save immediately so a
        // resume finds the latest state. Non-critical either way.
        window.addEventListener("pagehide", function () { persistNow(); });
        window.addEventListener("beforeunload", function () { persistNow(); });

        // ---- Export / import modal ----
        $("saves-io-btn").addEventListener("click", function () { openModal(); });
        $("save-modal-close").addEventListener("click", closeModal);
        $("saves-import-btn").addEventListener("click", startImport);
        $("saves-import-cancel").addEventListener("click", cancelImport);
        $("saves-import-confirm").addEventListener("click", confirmImport);

        // Click the (export-mode) textarea = auto-copy the whole map.
        $("saves-json").addEventListener("click", function () {
            if (!this.readOnly) return; // import mode: clicks position the caret
            var n = Object.keys(APM.storage.get("apm.saves") || {}).length;
            APM.dom.copyText(this.value).then(function (ok) {
                if (ok) APM.toast.show("Copied " + n + " save(s)");
                else APM.toast.show("Copy failed \u2013 select the text manually", true);
            });
        });

        // Download = Blob + a[download]; the object URL is revoked right
        // after the click so nothing lingers.
        $("saves-download-btn").addEventListener("click", function () {
            var value = $("saves-json").value;
            var blob = new Blob([value], { type: "application/json" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "ai-prompt-minifier-saves.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            APM.toast.show("Downloaded ai-prompt-minifier-saves.json");
        });

        // Copy button (explicit, same path as the textarea click)
        $("saves-copy-btn").addEventListener("click", function () {
            var n = Object.keys(APM.storage.get("apm.saves") || {}).length;
            APM.dom.copyText($("saves-json").value).then(function (ok) {
                if (ok) APM.toast.show("Copied " + n + " save(s)");
                else APM.toast.show("Copy failed \u2013 select the text manually", true);
            });
        });

        // Close paths: overlay click (only when it lands on the overlay
        // itself, not the dialog) and Esc while open.
        $("save-modal").addEventListener("click", function (e) {
            if (e.target === this) closeModal();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !$("save-modal").hidden) closeModal();
        });
    }

    APM.saves = { refresh: refresh, init: init, persistNow: persistNow, persistSoon: persistSoon };
})(window.APM = window.APM || {});