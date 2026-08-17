/* ui/theme.js — top-bar theme switch; choice persisted in apm.theme.
   The pre-paint bootstrap in index.html applies the saved class
   before first paint; this module wires the select and exposes
   apply(name)/current() for runtime switching (profiles never carry a
   theme — see scripts/ui/saves.js). */
(function (APM) {
    "use strict";

    var THEMES = {
        "": "Dark",
        light: "Light",
        midnight: "Midnight",
        paper: "Paper"
    };

    function valid(name) {
        return typeof name === "string" && Object.prototype.hasOwnProperty.call(THEMES, name);
    }

    // Set the theme: validate, apply the class, persist, sync the select,
    // and toast. Invalid names fall back to the default (dark).
    function apply(name) {
        if (!valid(name)) name = "";
        document.documentElement.className = name;
        APM.storage.set("apm.theme", name);
        APM.dom.$("theme-select").value = name;
        APM.toast.show("Theme: " + THEMES[name]);
    }

    // The theme currently applied on <html> ("" = default dark).
    function current() {
        var name = document.documentElement.className || "";
        return valid(name) ? name : "";
    }

    function init() {
        var saved = APM.storage.get("apm.theme");
        var name = valid(saved) ? saved : "";
        document.documentElement.className = name;
        APM.dom.$("theme-select").value = name;

        APM.dom.$("theme-select").addEventListener("change", function () {
            apply(this.value);
        });
    }

    APM.theme = { init: init, apply: apply, current: current, names: THEMES };
})(window.APM = window.APM || {});