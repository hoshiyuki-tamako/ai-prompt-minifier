/* ui/dnd.js — HTML5 drag & drop: palette → recipe (append/insert)
   and recipe reordering, with the drop indicator + global guards.
   The palette and recipe modules publish their drag source here via
   APM.dnd.setState; only this module consumes it. */
(function (APM) {
    "use strict";

    var dragState = null; // { from: "palette" | "recipe", id, index }

    function setState(s) { dragState = s; }

    function dropIndexAt(e) {
        var cards = APM.dom.$("rec-list").querySelectorAll(".rec-card");
        for (var i = 0; i < cards.length; i++) {
            var r = cards[i].getBoundingClientRect();
            if (e.clientY < r.top + r.height / 2) return i;
        }
        return cards.length;
    }

    function showIndicator(index) {
        clearIndicator();
        var list = APM.dom.$("rec-list");
        var ind = APM.dom.el("li", "drop-indicator");
        if (index >= APM.state.recipe.length) {
            list.appendChild(ind);
        } else {
            var cards = list.querySelectorAll(".rec-card");
            if (cards[index]) list.insertBefore(ind, cards[index]);
            else list.appendChild(ind);
        }
    }

    function clearIndicator() {
        var existing = APM.dom.$("rec-list").querySelector(".drop-indicator");
        if (existing) existing.remove();
    }

    function initRecipeDnd() {
        var list = APM.dom.$("rec-list");

        list.addEventListener("dragover", function (e) {
            if (!dragState) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = dragState.from === "palette" ? "copy" : "move";
            showIndicator(dropIndexAt(e));
        });

        list.addEventListener("dragleave", function (e) {
            if (e.relatedTarget && list.contains(e.relatedTarget)) return;
            clearIndicator();
        });

        list.addEventListener("drop", function (e) {
            if (!dragState) return;
            e.preventDefault();
            var index = dropIndexAt(e);
            if (dragState.from === "palette") {
                APM.recipe.add(dragState.id, index);
            } else {
                APM.recipe.move(dragState.index, index);
            }
            dragState = null;
            clearIndicator();
        });
    }

    // Global safety net: cancel leftover drag UI, and never let a dropped
    // file navigate the page away.
    function initDragGuards() {
        window.addEventListener("dragend", function () {
            dragState = null;
            clearIndicator();
        });
        ["dragover", "drop"].forEach(function (type) {
            window.addEventListener(type, function (e) {
                var types = e.dataTransfer && e.dataTransfer.types ? Array.prototype.slice.call(e.dataTransfer.types) : [];
                if (types.indexOf("Files") !== -1) e.preventDefault();
            });
        });
    }

    APM.dnd = {
        setState: setState,
        clearIndicator: clearIndicator,
        init: function () { initRecipeDnd(); initDragGuards(); }
    };
})(window.APM = window.APM || {});
