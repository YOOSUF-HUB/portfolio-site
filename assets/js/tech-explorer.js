/* =========================================================
   TECH STACK — "Explore my toolkit"
   Category tabs + one panel of tools, with a search that
   works across every category. Data: tech-stack-data.js.
   ========================================================= */
(function () {
    "use strict";

    var root = document.querySelector("[data-tx]");
    var data = window.TECH_STACK;
    if (!root || !data) return;

    var cats = data.categories;
    var icons = data.icons;
    var catsEl = root.querySelector("[data-tx-cats]");
    var panel = root.querySelector("[data-tx-panel]");
    var grid = root.querySelector("[data-tx-grid]");
    var numEl = root.querySelector("[data-tx-num]");
    var titleEl = root.querySelector("[data-tx-title]");
    var countEl = root.querySelector("[data-tx-count]");
    var emptyEl = root.querySelector("[data-tx-empty]");
    var emptyQ = root.querySelector("[data-tx-empty-q]");
    var input = root.querySelector("[data-tx-q]");
    var clearBtn = root.querySelector("[data-tx-clear]");
    var resetBtn = root.querySelector("[data-tx-reset]");
    var live = root.querySelector("[data-tx-live]");
    var totalEl = root.querySelector("[data-tx-total]");

    var SVG_NS = "http://www.w3.org/2000/svg";
    var active = 0;
    var tabs = [];
    var liveTimer = 0;

    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function plural(n) { return pad(n) + (n === 1 ? " tool" : " tools"); }

    var total = cats.reduce(function (sum, c) { return sum + c.tools.length; }, 0);
    if (totalEl) totalEl.textContent = total + " tools · " + cats.length + " categories";

    /* ---------- Category tabs ---------- */
    cats.forEach(function (cat, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tx-cat";
        b.id = "tx-tab-" + cat.id;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-controls", "tx-panel");
        b.innerHTML =
            '<span class="tx-cat__num" aria-hidden="true">' + pad(i + 1) + "</span>" +
            '<span class="tx-cat__label"></span>' +
            '<span class="tx-cat__count"><span aria-hidden="true">' + pad(cat.tools.length) + '</span><span class="tx-sr">, ' + cat.tools.length + " tools</span></span>";
        b.querySelector(".tx-cat__label").textContent = cat.label;
        b.addEventListener("click", function () { select(i, false); });
        b.addEventListener("keydown", onTabKey);
        catsEl.appendChild(b);
        tabs.push(b);
    });

    // Fills the odd seventh slot of the two-column mobile grid.
    var summary = document.createElement("div");
    summary.className = "tx-cats__sum";
    summary.setAttribute("aria-hidden", "true");
    summary.innerHTML = "<strong>" + total + "</strong><span>tools across<br>" + cats.length + " categories</span>";
    catsEl.appendChild(summary);

    function onTabKey(e) {
        var i = tabs.indexOf(e.currentTarget), n = tabs.length, to = -1;
        switch (e.key) {
            case "ArrowRight": case "ArrowDown": to = (i + 1) % n; break;
            case "ArrowLeft": case "ArrowUp": to = (i - 1 + n) % n; break;
            case "Home": to = 0; break;
            case "End": to = n - 1; break;
            default: return;
        }
        e.preventDefault();
        select(to, true);
    }

    /* ---------- Tool items ---------- */
    function toolItem(name, catLabel, k) {
        var li = document.createElement("li");
        li.className = "tx-tool";
        li.style.setProperty("--i", k);

        var svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        svg.setAttribute("class", "tx-tool__icon");
        svg.innerHTML = icons[name] || "";
        li.appendChild(svg);

        var label = document.createElement("span");
        label.className = "tx-tool__name";
        label.textContent = name;
        li.appendChild(label);

        if (catLabel) {
            var c = document.createElement("span");
            c.className = "tx-tool__cat";
            c.textContent = catLabel;
            li.appendChild(c);
        }
        return li;
    }

    function fill(list) {
        grid.textContent = "";
        var frag = document.createDocumentFragment();
        list.forEach(function (t, k) { frag.appendChild(toolItem(t.name, t.cat, k)); });
        grid.appendChild(frag);
        // Restart the entrance animation.
        grid.classList.remove("is-in");
        void grid.offsetWidth;
        grid.classList.add("is-in");
    }

    function announce(msg) {
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () { live.textContent = msg; }, 350);
    }

    /* ---------- Category view ---------- */
    function select(i, focusTab) {
        if (input.value) clearSearch(true);
        active = i;
        tabs.forEach(function (t, k) {
            var on = k === i;
            t.setAttribute("aria-selected", on ? "true" : "false");
            t.tabIndex = on ? 0 : -1;
            t.classList.toggle("is-active", on);
        });
        if (focusTab) tabs[i].focus();
        panel.setAttribute("aria-labelledby", tabs[i].id);

        var cat = cats[i];
        numEl.textContent = pad(i + 1);
        titleEl.textContent = cat.label;
        countEl.textContent = plural(cat.tools.length);
        emptyEl.hidden = true;
        grid.hidden = false;
        fill(cat.tools.map(function (name) { return { name: name }; }));
    }

    /* ---------- Search (all categories) ---------- */
    function norm(s) { return s.toLowerCase().replace(/[\s.\-_]+/g, ""); }

    function search() {
        var raw = input.value.trim();
        clearBtn.hidden = !input.value;
        if (!raw) { leaveSearch(); return; }

        root.classList.add("is-searching");
        var q = norm(raw), hits = [];
        cats.forEach(function (cat) {
            cat.tools.forEach(function (name) {
                var n = norm(name);
                if (n.indexOf(q) !== -1 || norm(cat.label).indexOf(q) !== -1) {
                    hits.push({ name: name, cat: cat.label, rank: n.indexOf(q) === 0 ? 0 : n.indexOf(q) !== -1 ? 1 : 2 });
                }
            });
        });
        hits.sort(function (a, b) { return a.rank - b.rank; });

        panel.removeAttribute("aria-labelledby");
        panel.setAttribute("aria-label", "Search results");
        numEl.textContent = "—";
        titleEl.textContent = "Search results";
        countEl.textContent = hits.length === 1 ? "01 match" : pad(hits.length) + " matches";

        if (hits.length) {
            emptyEl.hidden = true;
            grid.hidden = false;
            fill(hits);
            announce(hits.length + (hits.length === 1 ? " match" : " matches"));
        } else {
            grid.hidden = true;
            grid.textContent = "";
            emptyQ.textContent = raw;
            emptyEl.hidden = false;
            announce("No technologies match " + raw);
        }
    }

    function leaveSearch() {
        root.classList.remove("is-searching");
        panel.removeAttribute("aria-label");
        select(active, false);
    }

    function clearSearch(silent) {
        input.value = "";
        clearBtn.hidden = true;
        root.classList.remove("is-searching");
        panel.removeAttribute("aria-label");
        if (!silent) { leaveSearch(); announce(""); }
    }

    input.addEventListener("input", search);
    input.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && input.value) { e.preventDefault(); clearSearch(false); }
    });
    clearBtn.addEventListener("click", function () { clearSearch(false); input.focus(); });
    resetBtn.addEventListener("click", function () { clearSearch(false); input.focus(); });

    root.classList.add("is-ready");
    select(0, false);
})();
