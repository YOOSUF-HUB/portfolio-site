/* =========================================================
   FIELD NOTES — fullscreen image viewer for journal entries.
   Enhances every a[data-jn-lb] (cover, inline figures, gallery).
   Without JS those links simply open the original image.

   · click / Enter opens; Escape closes; ← → move; Home / End
   · touch: swipe left / right to move, swipe down to close
   · focus is trapped inside and returned to the image on close
   · page scrolling is locked while open
   · caption + alt text shown; neighbours preloaded
   · prefers-reduced-motion: no transitions
   ========================================================= */
(function () {
    "use strict";

    var links = Array.prototype.slice.call(document.querySelectorAll("a[data-jn-lb]"));
    if (!links.length) return;

    var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    var items = links.map(function (a) {
        var img = a.querySelector("img");
        return { href: a.getAttribute("href"), alt: img ? img.getAttribute("alt") || "" : "", caption: a.getAttribute("data-caption") || "", link: a };
    });

    var box, stage, imgEl, capEl, altEl, countEl, prevBtn, nextBtn, closeBtn, statusEl;
    var index = -1, lastFocus = null, scrollY = 0, closing = 0;

    function build() {
        box = document.createElement("div");
        box.className = "jn-lb";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.setAttribute("aria-label", "Image viewer");
        box.hidden = true;
        box.innerHTML =
            '<div class="jn-lb__bar">' +
            '  <p class="jn-lb__count" aria-hidden="true"></p>' +
            '  <button type="button" class="jn-lb__btn jn-lb__close" aria-label="Close image viewer"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>' +
            "</div>" +
            '<div class="jn-lb__stage">' +
            '  <button type="button" class="jn-lb__btn jn-lb__nav jn-lb__prev" aria-label="Previous image"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M10 3 5 8l5 5"/></svg></button>' +
            '  <figure class="jn-lb__figure"><img class="jn-lb__img" alt=""><figcaption class="jn-lb__cap"><span class="jn-lb__caption"></span><span class="jn-lb__alt"></span></figcaption></figure>' +
            '  <button type="button" class="jn-lb__btn jn-lb__nav jn-lb__next" aria-label="Next image"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3l5 5-5 5"/></svg></button>' +
            "</div>" +
            '<p class="jn-sr" aria-live="polite"></p>';
        document.body.appendChild(box);
        stage = box.querySelector(".jn-lb__stage");
        imgEl = box.querySelector(".jn-lb__img");
        capEl = box.querySelector(".jn-lb__caption");
        altEl = box.querySelector(".jn-lb__alt");
        countEl = box.querySelector(".jn-lb__count");
        prevBtn = box.querySelector(".jn-lb__prev");
        nextBtn = box.querySelector(".jn-lb__next");
        closeBtn = box.querySelector(".jn-lb__close");
        statusEl = box.querySelector("[aria-live]");

        closeBtn.addEventListener("click", close);
        prevBtn.addEventListener("click", function () { go(-1); });
        nextBtn.addEventListener("click", function () { go(1); });
        // click on the dark backdrop (not on the image or a control) closes
        stage.addEventListener("click", function (e) { if (e.target === stage) close(); });
        box.addEventListener("keydown", onKey);
        imgEl.addEventListener("load", function () { box.classList.remove("is-loading"); });
        imgEl.addEventListener("error", function () { box.classList.remove("is-loading"); });
        swipe();
    }

    function show(i) {
        index = (i + items.length) % items.length;
        var it = items[index];
        box.classList.add("is-loading");
        imgEl.removeAttribute("src");
        imgEl.alt = it.alt;
        imgEl.src = it.href;
        if (imgEl.complete) box.classList.remove("is-loading");
        capEl.textContent = it.caption;
        // alt text is shown when it adds something beyond the caption
        altEl.textContent = it.alt && it.alt !== it.caption ? it.alt : "";
        capEl.hidden = !it.caption; altEl.hidden = !altEl.textContent;
        var multi = items.length > 1;
        countEl.textContent = multi ? (index + 1) + " / " + items.length : "";
        prevBtn.hidden = nextBtn.hidden = !multi;
        statusEl.textContent = "Image " + (index + 1) + " of " + items.length + (it.caption ? ": " + it.caption : it.alt ? ": " + it.alt : "");
        // warm the cache for the neighbours
        if (multi) [index - 1, index + 1].forEach(function (n) { var p = new Image(); p.src = items[(n + items.length) % items.length].href; });
    }
    function go(d) { if (items.length > 1) show(index + d); }

    function lockScroll(on) {
        var de = document.documentElement;
        if (on) {
            scrollY = window.pageYOffset;
            var bar = window.innerWidth - de.clientWidth;
            de.classList.add("jn-lb-open");
            if (bar > 0) de.style.paddingRight = bar + "px";
        } else {
            de.classList.remove("jn-lb-open");
            de.style.paddingRight = "";
            // the site uses smooth scrolling; restore the position instantly
            try { window.scrollTo({ top: scrollY, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, scrollY); }
        }
    }

    function open(i) {
        if (!box) build();
        clearTimeout(closing);
        lastFocus = document.activeElement;
        show(i);
        box.hidden = false;
        lockScroll(true);
        // next frame so the opening transition runs
        requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add("is-open"); }); });
        closeBtn.focus({ preventScroll: true });
    }
    function close() {
        if (!box || box.hidden) return;
        box.classList.remove("is-open");
        var done = function () {
            box.hidden = true;
            imgEl.removeAttribute("src");
            lockScroll(false);
            var target = items[index] && items[index].link;
            if (target && target.focus) target.focus({ preventScroll: true });
            else if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
        };
        if (reduceMQ.matches) done(); else closing = setTimeout(done, 260);
    }

    function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
        else if (e.key === "Home") { e.preventDefault(); show(0); }
        else if (e.key === "End") { e.preventDefault(); show(items.length - 1); }
        else if (e.key === "Tab") { // keep focus inside the dialog
            var f = [closeBtn, prevBtn, nextBtn].filter(function (b) { return !b.hidden; });
            var i = f.indexOf(document.activeElement);
            e.preventDefault();
            f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
        }
    }

    function swipe() {
        var sx = 0, sy = 0, id = null, dx = 0, dy = 0;
        stage.addEventListener("pointerdown", function (e) {
            if (e.pointerType === "mouse" || e.target.closest("button")) return;
            id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0;
        });
        stage.addEventListener("pointermove", function (e) {
            if (e.pointerId !== id) return;
            dx = e.clientX - sx; dy = e.clientY - sy;
            if (!reduceMQ.matches) imgEl.style.transform = Math.abs(dx) > Math.abs(dy) ? "translateX(" + dx * 0.4 + "px)" : dy > 0 ? "translateY(" + dy * 0.4 + "px)" : "";
        });
        function end(e) {
            if (e.pointerId !== id) return;
            id = null; imgEl.style.transform = "";
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
            else if (dy > 90 && dy > Math.abs(dx) * 1.2) close();
        }
        stage.addEventListener("pointerup", end);
        stage.addEventListener("pointercancel", end);
    }

    links.forEach(function (a, i) {
        a.addEventListener("click", function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return; // let "open in new tab" work
            e.preventDefault();
            open(i);
        });
    });
})();
