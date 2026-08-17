/* ui/leftpane.js — collapse the Filters + Recipe columns into 44px
   icon rails (banner button #left-toggle, see index.html).
   This module only flips the #workspace.left-collapsed class and
   persists the choice; the rail look + hover-peek behaviour are pure
   CSS (styles/style.css, "Collapsed left columns" block).
   State key: apm.ui.leftCollapsed (JSON boolean, written immediately
   on toggle). A missing key = expanded = the new-user default.
   Deliberately NOT part of hard/soft saves: the profile carries
   prefix + recipe only, and the collapse setting is per-browser UI. */
(function (APM) {
    "use strict";

    var KEY = "apm.ui.leftCollapsed";

    function workspace() {
        return APM.dom.$("workspace");
    }

    function isCollapsed() {
        return workspace().classList.contains("left-collapsed");
    }

    function syncButton() {
        var btn = APM.dom.$("left-toggle");
        var collapsed = isCollapsed();
        btn.textContent = collapsed ? "\u00bb" : "\u00ab";
        btn.title = collapsed
            ? "Expand Filters + Recipe"
            : "Collapse Filters + Recipe (hover a column to peek the recipe)";
        btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
    }

    function toggle() {
        workspace().classList.toggle("left-collapsed");
        APM.storage.set(KEY, isCollapsed()); // immediate; best-effort
        syncButton();
    }

    function init() {
        if (APM.storage.get(KEY) === true) {
            workspace().classList.add("left-collapsed");
        }
        APM.dom.$("left-toggle").addEventListener("click", toggle);
        syncButton();
    }

    APM.leftpane = { init: init, toggle: toggle, isCollapsed: isCollapsed };
})(window.APM = window.APM || {});
