/* core/storage.js — throw-safe JSON localStorage.
   `localStorage` can throw (private mode / some file:// contexts),
   so every access goes through these helpers. */
(function (APM) {
    "use strict";

    function get(key) {
        try {
            var raw = localStorage.getItem(key);
            if (raw === null) return null;
            return JSON.parse(raw);
        } catch (err) {
            return null;
        }
    }

    function set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err) {
            return false;
        }
    }

    APM.storage = { get: get, set: set };
})(window.APM = window.APM || {});
