/* ============================================================
   main.js — boot. Loaded LAST (after core/, filters/, ui/).
   Wires every module, then restores the working state
   (apm.lastState) or falls back to the first-run default
   recipe [Minify], and renders the palette + save list.
   ============================================================ */
(function (APM) {
    "use strict";

    function boot() {
        APM.theme.init();
        APM.saves.init();
        APM.palette.init();
        APM.recipe.init();
        APM.dnd.init();
        APM.leftpane.init(); // collapse state (apm.ui.leftCollapsed); class-only, order-safe
        APM.io.init();

        // Restore the last working state, or start with the original app's
        // default behaviour (recipe = [Minify]).
        var last = APM.storage.get("apm.lastState");
        if (last && typeof last === "object") {
            APM.state.restore(last);
        } else {
            APM.state.recipe = [{ id: "minify", options: {} }];
            APM.recipe.render();
            APM.io.recompute();
        }

        APM.palette.render("");
        APM.saves.refresh();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window.APM);
