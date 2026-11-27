/* =========================================================
   LATEST FIELD NOTES — homepage block.
   Reads /journal/latest.json (written by scripts/build-journal.mjs
   from published entries only) and shows the newest three.
   The section stays hidden when nothing is published or the
   file can't be loaded, so the homepage never shows a broken block.
   ========================================================= */
(function () {
    "use strict";

    var root = document.querySelector("[data-fn]");
    if (!root || !window.fetch) return;
    var list = root.querySelector("[data-fn-list]");

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function item(d) {
        var li = el("li", "fn-item");
        var a = el("a", "fn-item__link");
        a.href = d.url;
        var media = el("div", "fn-item__media");
        if (d.cover) {
            var img = el("img");
            img.src = d.cover; img.alt = d.coverAlt || ""; img.loading = "lazy"; img.decoding = "async";
            media.appendChild(img);
        } else {
            media.classList.add("fn-item__media--plain");
            media.setAttribute("aria-hidden", "true");
            media.appendChild(el("span", "", d.typeLabel));
        }
        var body = el("div", "fn-item__body");
        var meta = el("p", "fn-item__meta");
        meta.appendChild(el("span", "fn-item__type", d.typeLabel));
        var time = el("time", "", d.dateLabel);
        time.dateTime = d.date;
        meta.appendChild(time);
        if (d.readingTime) meta.appendChild(el("span", "", d.readingTime + " min read"));
        body.appendChild(meta);
        body.appendChild(el("h3", "fn-item__title", d.title));
        body.appendChild(el("p", "fn-item__excerpt", d.excerpt));
        var more = el("span", "fn-item__more", "Read more");
        more.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8"/></svg>');
        body.appendChild(more);
        a.appendChild(media); a.appendChild(body);
        li.appendChild(a);
        return li;
    }

    fetch("/journal/latest.json", { headers: { Accept: "application/json" } })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (data) {
            var items = data && Array.isArray(data.items) ? data.items.slice(0, 3) : [];
            if (!items.length) return;
            items.forEach(function (d) { if (d && d.url && d.title) list.appendChild(item(d)); });
            if (list.children.length) root.hidden = false;
        })
        .catch(function () { /* journal not built here (e.g. plain static preview): keep the block hidden */ });
})();
