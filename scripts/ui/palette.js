/* ui/palette.js — column 1: searchable filter palette.
   Add a filter to the recipe by drag, double-click, or keyboard
   (focus the item, then Enter/Space). */
(function (APM) {
    "use strict";

    function render(query) {
        var $ = APM.dom.$;
        var el = APM.dom.el;
        var list = $("filter-list");
        list.innerHTML = "";
        var q = (query || "").trim().toLowerCase();
        var visible = 0;

        APM.filters.ids().forEach(function (id) {
            var def = APM.filters.get(id);
            if (q && def.name.toLowerCase().indexOf(q) === -1 &&
                def.desc.toLowerCase().indexOf(q) === -1) {
                return;
            }
            visible++;

            var item = el("li", "op-item");
            item.draggable = true;
            item.dataset.filter = id;
            item.tabIndex = 0; // keyboard: focusable item, Enter/Space adds it
            item.setAttribute("role", "button");
            item.setAttribute("aria-label", "Add " + def.name + " to recipe");
            item.appendChild(el("div", "op-name", def.name));
            item.appendChild(el("div", "op-desc", def.desc));

            item.addEventListener("dragstart", function (e) {
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.setData("application/x-apm-filter", id);
                e.dataTransfer.effectAllowed = "copy";
                APM.dnd.setState({ from: "palette", id: id });
                item.classList.add("dragging");
            });
            item.addEventListener("dragend", function () {
                item.classList.remove("dragging");
            });
            item.addEventListener("dblclick", function () {
                APM.recipe.add(id); // double-click add (CyberChef parity; also touch-friendly)
            });
            item.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); // Space would otherwise scroll the palette
                    APM.recipe.add(id);
                }
            });

            list.appendChild(item);
        });

        $("filter-count").textContent = visible ? "(" + visible + ")" : "";
        $("no-filters").hidden = visible !== 0;
    }

    function init() {
        APM.dom.$("filter-search").addEventListener("input", function () {
            render(this.value);
        });
    }

    APM.palette = { render: render, init: init };
})(window.APM = window.APM || {});
