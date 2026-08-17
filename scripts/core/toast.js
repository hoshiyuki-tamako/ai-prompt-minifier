/* core/toast.js — top-centre toast (look of the original app). */
(function (APM) {
    "use strict";

    var timer = null;

    function show(message, isError) {
        var toast = APM.dom.$("toast");
        toast.textContent = message;
        toast.classList.toggle("error", !!isError);
        toast.style.opacity = "1";
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () {
            toast.style.opacity = "0";
        }, 2000);
    }

    APM.toast = { show: show };
})(window.APM = window.APM || {});
