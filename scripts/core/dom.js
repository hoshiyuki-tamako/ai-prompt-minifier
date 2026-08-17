/* core/dom.js — tiny shared DOM helpers.
   Part of the APM namespace (scripts/main.js boots the app last). */
(function (APM) {
    "use strict";

    function $(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    // Shared clipboard helper (output Copy button + saves export
    // modal). Clipboard API first (secure contexts only), then the
    // execCommand("copy") fallback via a temporary textarea. Resolves
    // true on success, false otherwise — callers own the toasts.
    function copyText(text) {
        var t = String(text);
        function fallback() {
            var ta = null;
            try {
                ta = document.createElement("textarea");
                ta.value = t;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                var ok = false;
                if (document.execCommand) ok = document.execCommand("copy");
                return ok;
            } catch (err) {
                return false;
            } finally {
                if (ta && ta.parentNode) ta.parentNode.removeChild(ta);
            }
        }
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(t).then(
                function () { return true; },
                function () { return fallback(); }
            );
        }
        return Promise.resolve(fallback());
    }

    APM.dom = { $: $, el: el, copyText: copyText };
})(window.APM = window.APM || {});
