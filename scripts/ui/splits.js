/* ui/splits.js — resizable left columns (expanded view only) + an
   independent hover-peek width.
   - Two 5px .split-gutter separators between the three columns:
     pointer drag (setPointerCapture), keyboard ArrowLeft/Right =
     ±10px, double-click resets BOTH columns to the defaults (24%/26%)
     and clears the persisted value.
   - Column widths are stored as % of the workspace under
     apm.ui.splits = { f: "…%", r: "…" } — a per-browser UI setting,
     never part of hard/soft saves (like apm.ui.leftCollapsed).
   - The compact (rail) view is NOT resizable (gutters hidden). The
     hover-peek surface has its own right-edge handle that sets
     --peek-w (clamped: min 250px, max 60% of the viewport), persisted
     separately as apm.ui.peekWidth; the 44px rails stay fixed.
   - Floors: filters ≥ 220px, recipe ≥ 250px, io ≥ 320px (the CSS
     min-widths are the ultimate floor; JS keeps the persisted % sane
     across window resizes).
   - The I/O panes are vertically resizable too —
     two .pane-gutter separators inside #io (always visible; the compact
     rails don't touch #io). #io carries --pane-p (prefix) / --pane-i
     (input); the output pane absorbs the remainder. Defaults 18%/41%;
     drag, ArrowUp/Down = ±10px, double-click resets both. Stored as
     apm.ui.panes (per-browser, profile-exempt); floors 60/120/120px.
   No libraries, file://-safe (no fetch), plain pointer events.
   Written from scratch (CyberChef's gutters are the interaction
   reference only — nothing copied). */
(function (APM) {
    "use strict";

    var SPLITS_KEY = "apm.ui.splits";
    var PEEK_KEY = "apm.ui.peekWidth";
    var DEFAULTS = { f: "24%", r: "26%" };
    var FLOOR = { f: 220, r: 250, io: 320 }; // px hard floors
    var GUTTERS_PX = 10; // the two 5px separators
    var PEEK_MIN_PX = 250;
    var PEEK_MAX_PCT = 60;

    function ws() { return APM.dom.$("workspace"); }

    function round1(n) { return Math.round(n * 10) / 10; }
    function fmt(n) { return round1(n) + "%"; }

    function read() {
        var v = APM.storage.get(SPLITS_KEY);
        if (v && typeof v === "object" &&
            typeof v.f === "string" && typeof v.r === "string" &&
            v.f.slice(-1) === "%" && v.r.slice(-1) === "%") {
            return { f: v.f, r: v.r };
        }
        return { f: DEFAULTS.f, r: DEFAULTS.r };
    }

    function apply(v) {
        ws().style.setProperty("--col-f", v.f);
        ws().style.setProperty("--col-r", v.r);
    }

    // Clamp a (f, r) % pair against the px floors at the current
    // workspace width. If both columns are over-allocated, the excess
    // is shaved off proportionally above their floors so io keeps its
    // 320px floor.
    function clampPair(fPct, rPct) {
        var w = ws().clientWidth || 1000;
        var fPx = fPct / 100 * w;
        var rPx = rPct / 100 * w;
        fPx = Math.max(FLOOR.f, Math.min(fPx, w - FLOOR.r - FLOOR.io - GUTTERS_PX));
        rPx = Math.max(FLOOR.r, Math.min(rPx, w - FLOOR.f - FLOOR.io - GUTTERS_PX));
        var over = fPx + rPx - (w - FLOOR.io - GUTTERS_PX);
        if (over > 0) {
            var fExtra = Math.max(0, fPx - FLOOR.f);
            var rExtra = Math.max(0, rPx - FLOOR.r);
            var total = fExtra + rExtra;
            var fCut = total ? Math.min(fExtra, over * fExtra / total) : over;
            var rCut = Math.min(rExtra, Math.max(0, over - fCut));
            fPx -= fCut;
            rPx -= rCut;
        }
        return { f: fmt(fPx / w * 100), r: fmt(rPx / w * 100) };
    }

    function setPair(fPct, rPct) {
        var v = clampPair(parseFloat(fPct), parseFloat(rPct));
        apply(v);
        APM.storage.set(SPLITS_KEY, v); // best-effort (throw-safe storage)
        return v;
    }

    function clearPersisted() {
        try { localStorage.removeItem(SPLITS_KEY); } catch (err) { /* blocked */ }
        // Drop the inline vars so the CSS defaults (or the
        // narrow-window media-query defaults) win again.
        ws().style.removeProperty("--col-f");
        ws().style.removeProperty("--col-r");
    }

    function bindGutter(el, which) {
        el.addEventListener("pointerdown", function (e) {
            if (APM.leftpane.isCollapsed()) return; // compact: no resize
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            el.classList.add("dragging");
            var move = function (ev) {
                var rect = ws().getBoundingClientRect();
                var x = ev.clientX - rect.left;
                var cur = read();
                if (which === "f") {
                    setPair(x / rect.width * 100, cur.r);
                } else {
                    // left edge of this gutter = filters basis + one 5px
                    // gutter, so the recipe basis is what lies before it.
                    var fPx = parseFloat(cur.f) / 100 * rect.width;
                    setPair(cur.f, Math.max(0, (x - 5 - fPx) / rect.width * 100));
                }
            };
            var up = function (ev) {
                el.classList.remove("dragging");
                if (el.releasePointerCapture) el.releasePointerCapture(ev.pointerId);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
                el.removeEventListener("pointercancel", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
        });
        el.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            if (APM.leftpane.isCollapsed()) return;
            e.preventDefault();
            var w = ws().clientWidth || 1000;
            var delta = (e.key === "ArrowRight" ? 10 : -10) / w * 100;
            var cur = read();
            if (which === "f") {
                setPair(parseFloat(cur.f) + delta, cur.r);
            } else {
                setPair(cur.f, parseFloat(cur.r) + delta);
            }
        });
        el.addEventListener("dblclick", function () {
            clearPersisted(); // reset BOTH columns to the CSS defaults
        });
    }

    // Peek width: % of the workspace, clamped to [250px, 60% of the
    // viewport]. Only ever used by the collapsed hover-peek surface.
    function peekPct(pct) {
        var vw = window.innerWidth || 1000;
        var min = PEEK_MIN_PX / vw * 100;
        if (pct < min) pct = min;
        if (pct > PEEK_MAX_PCT) pct = PEEK_MAX_PCT;
        return round1(pct);
    }

    function bindPeek() {
        var el = APM.dom.$("recipe-peek-handle");
        el.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            var move = function (ev) {
                var rect = ws().getBoundingClientRect();
                var pct = peekPct((ev.clientX - rect.left) / rect.width * 100);
                ws().style.setProperty("--peek-w", pct + "%");
                APM.storage.set(PEEK_KEY, pct + "%");
            };
            var up = function (ev) {
                if (el.releasePointerCapture) el.releasePointerCapture(ev.pointerId);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
                el.removeEventListener("pointercancel", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
        });
    }

    // ---------- Vertically resizable I/O panes ----------
    var PANES_KEY = "apm.ui.panes";
    var PANES_DEFAULTS = { p: "18%", i: "41%" };
    var PANE_FLOOR = { p: 60, i: 120, o: 120 }; // px hard floors
    var PANE_GUTTERS_PX = 10; // the two 5px separators

    function io() { return APM.dom.$("io"); }

    function readPanes() {
        var v = APM.storage.get(PANES_KEY);
        if (v && typeof v === "object" &&
            typeof v.p === "string" && typeof v.i === "string" &&
            v.p.slice(-1) === "%" && v.i.slice(-1) === "%") {
            return { p: v.p, i: v.i };
        }
        return { p: PANES_DEFAULTS.p, i: PANES_DEFAULTS.i };
    }

    function applyPanes(v) {
        io().style.setProperty("--pane-p", v.p);
        io().style.setProperty("--pane-i", v.i);
    }

    // Clamp a (p, i) % pair against the px floors at the current io
    // height. The output pane absorbs the remainder, so the joint
    // constraint is p + i ≤ (height − output floor − gutters).
    function clampPanes(pPct, iPct) {
        var h = io().clientHeight || 600;
        var maxTotal = h - PANE_FLOOR.o - PANE_GUTTERS_PX;
        var pPx = pPct / 100 * h;
        var iPx = iPct / 100 * h;
        pPx = Math.max(PANE_FLOOR.p, Math.min(pPx, maxTotal - PANE_FLOOR.i));
        iPx = Math.max(PANE_FLOOR.i, Math.min(iPx, maxTotal - PANE_FLOOR.p));
        var over = pPx + iPx - maxTotal;
        if (over > 0) {
            var pExtra = Math.max(0, pPx - PANE_FLOOR.p);
            var iExtra = Math.max(0, iPx - PANE_FLOOR.i);
            var total = pExtra + iExtra;
            var pCut = total ? Math.min(pExtra, over * pExtra / total) : over;
            var iCut = Math.min(iExtra, Math.max(0, over - pCut));
            pPx -= pCut;
            iPx -= iCut;
        }
        return { p: fmt(pPx / h * 100), i: fmt(iPx / h * 100) };
    }

    function setPanes(pPct, iPct) {
        var v = clampPanes(parseFloat(pPct), parseFloat(iPct));
        applyPanes(v);
        APM.storage.set(PANES_KEY, v); // best-effort (throw-safe storage)
        return v;
    }

    function clearPanes() {
        try { localStorage.removeItem(PANES_KEY); } catch (err) { /* blocked */ }
        // Drop the inline vars so the CSS defaults (18%/41%) win again.
        io().style.removeProperty("--pane-p");
        io().style.removeProperty("--pane-i");
    }

    // which: "p" (the gutter below the prefix pane) or "i" (the gutter
    // below the input pane). Dragging resizes the pane ABOVE the
    // gutter; the output pane absorbs the remainder. Unlike the column
    // gutters there is no collapsed guard — #io is untouched by the
    // left-rail collapse, so the pane gutters are always live.
    function bindPaneGutter(el, which) {
        el.addEventListener("pointerdown", function (e) {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);
            el.classList.add("dragging");
            var move = function (ev) {
                var rect = io().getBoundingClientRect();
                var y = ev.clientY - rect.top;
                var cur = readPanes();
                if (which === "p") {
                    setPanes(y / rect.height * 100, cur.i);
                } else {
                    // Top edge of this gutter = prefix basis + one 5px
                    // gutter, so the input basis is what lies before it.
                    var pPx = parseFloat(cur.p) / 100 * rect.height;
                    setPanes(cur.p, Math.max(0, (y - 5 - pPx) / rect.height * 100));
                }
            };
            var up = function (ev) {
                el.classList.remove("dragging");
                if (el.releasePointerCapture) el.releasePointerCapture(ev.pointerId);
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
                el.removeEventListener("pointercancel", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
            el.addEventListener("pointercancel", up);
        });
        el.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            var h = io().clientHeight || 600;
            var delta = (e.key === "ArrowDown" ? 10 : -10) / h * 100;
            var cur = readPanes();
            if (which === "p") {
                setPanes(parseFloat(cur.p) + delta, cur.i);
            } else {
                setPanes(cur.p, parseFloat(cur.i) + delta);
            }
        });
        el.addEventListener("dblclick", function () {
            clearPanes(); // reset BOTH panes to the CSS defaults
        });
    }

    // Window resize: re-clamp the stored % against the new dimensions
    // so a size persisted on a large window can't squeeze a pane below
    // its floor on a small one.
    function onResize() {
        var cur = read();
        if (cur.f !== DEFAULTS.f || cur.r !== DEFAULTS.r) {
            var v = clampPair(parseFloat(cur.f), parseFloat(cur.r));
            apply(v);
            APM.storage.set(SPLITS_KEY, v);
        }
        var pc = readPanes();
        if (pc.p !== PANES_DEFAULTS.p || pc.i !== PANES_DEFAULTS.i) {
            var pv = clampPanes(parseFloat(pc.p), parseFloat(pc.i));
            applyPanes(pv);
            APM.storage.set(PANES_KEY, pv);
        }
    }

    function init() {
        var cur = read();
        if (cur.f !== DEFAULTS.f || cur.r !== DEFAULTS.r) apply(cur);
        bindGutter(APM.dom.$("split-filters"), "f");
        bindGutter(APM.dom.$("split-recipe"), "r");
        bindPeek();
        var pw = APM.storage.get(PEEK_KEY);
        if (typeof pw === "string" && pw) ws().style.setProperty("--peek-w", pw);
        var pc = readPanes();
        if (pc.p !== PANES_DEFAULTS.p || pc.i !== PANES_DEFAULTS.i) applyPanes(pc);
        bindPaneGutter(APM.dom.$("pane-split-prefix"), "p");
        bindPaneGutter(APM.dom.$("pane-split-input"), "i");
        window.addEventListener("resize", onResize);
    }

    APM.splits = {
        init: init,
        read: read,
        setPair: setPair,
        clampPair: clampPair,
        clearPersisted: clearPersisted,
        peekPct: peekPct,
        readPanes: readPanes,
        setPanes: setPanes,
        clampPanes: clampPanes,
        clearPanes: clearPanes
    };
})(window.APM = window.APM || {});
