/*
 * PROJECT FLASHCARDS
 *
 * Hovering and keyboard focus are handled in project-flashcards.css. This file
 * only adds what CSS cannot: tapping a card on a touch device, and Enter/Space
 * for browsers without :has() support.
 */
(function () {
    "use strict";

    var cards = document.querySelectorAll(".project-flashcard");

    if (!cards.length) {
        return;
    }

    var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    // A drag longer than this is the visitor swiping the carousel, not tapping a card
    var DRAG_THRESHOLD = 10;

    function flip(card, state) {
        Array.prototype.forEach.call(cards, function (other) {
            other.classList.toggle("is-flipped", other === card && state);
        });
    }

    Array.prototype.forEach.call(cards, function (card) {
        var startX = 0;
        var startY = 0;
        var dragged = false;

        card.addEventListener("pointerdown", function (e) {
            startX = e.clientX;
            startY = e.clientY;
            dragged = false;
        });

        card.addEventListener("pointermove", function (e) {
            if (
                Math.abs(e.clientX - startX) > DRAG_THRESHOLD ||
                Math.abs(e.clientY - startY) > DRAG_THRESHOLD
            ) {
                dragged = true;
            }
        });

        card.addEventListener("click", function (e) {
            // Mouse visitors already flip on hover
            if (canHover) {
                return;
            }

            if (dragged || e.target.closest("a")) {
                return;
            }

            flip(card, !card.classList.contains("is-flipped"));
        });

        card.addEventListener("keydown", function (e) {
            if (e.target !== card) {
                return;
            }

            if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") {
                return;
            }

            e.preventDefault();
            flip(card, !card.classList.contains("is-flipped"));
        });

        card.addEventListener("keyup", function (e) {
            if (e.key === "Escape") {
                flip(card, false);
            }
        });
    });
})();
