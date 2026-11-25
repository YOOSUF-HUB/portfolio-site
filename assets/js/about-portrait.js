/* =========================================================
   ABOUT — portrait tilt
   Tilts the portrait a few degrees toward the cursor.
   Skipped on touch devices and with reduced motion.
   ========================================================= */

(function () {
    "use strict";

    var card = document.querySelector(".section-about-me .portrait-card");
    if (!card) return;

    var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var MAX = 6; // degrees

    card.addEventListener("mousemove", function (e) {
        if (!fine.matches || reduce.matches) return;

        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;  // -0.5 … 0.5
        var y = (e.clientY - r.top) / r.height - 0.5;

        card.style.setProperty("--tilt-y", (x * MAX * 2).toFixed(2) + "deg");
        card.style.setProperty("--tilt-x", (-y * MAX * 2).toFixed(2) + "deg");
    });

    card.addEventListener("mouseleave", function () {
        card.style.setProperty("--tilt-x", "0deg");
        card.style.setProperty("--tilt-y", "0deg");
    });
})();
