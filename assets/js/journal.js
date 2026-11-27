/* =========================================================
   FIELD NOTES — journal listing: type filters + search.
   The list is fully rendered in HTML by scripts/build-journal.mjs;
   this only shows/hides rows. State is mirrored in the URL
   (?type=event&q=llm) so filtered views can be shared.
   ========================================================= */
(function () {
    "use strict";

    var tools = document.querySelector("[data-jn-tools]");
    var rows = document.querySelector("[data-jn-rows]");
    if (!tools || !rows) return;

    var buttons = Array.prototype.slice.call(tools.querySelectorAll("[data-jn-filter]"));
    var input = tools.querySelector("[data-jn-search]");
    var items = Array.prototype.slice.call(rows.children);
    var empty = document.querySelector("[data-jn-empty]");
    var status = document.querySelector("[data-jn-status]");
    var types = buttons.map(function (b) { return b.getAttribute("data-jn-filter"); });

    var state = { type: "all", q: "" };
    try {
        var params = new URLSearchParams(location.search);
        var t = params.get("type");
        if (t && types.indexOf(t) >= 0) state.type = t;
        state.q = (params.get("q") || "").slice(0, 80);
    } catch (e) { /* old browser: defaults */ }
    input.value = state.q;

    function apply(push) {
        var words = state.q.toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
        items.forEach(function (li) {
            var okType = state.type === "all" || li.getAttribute("data-type") === state.type;
            var hay = li.getAttribute("data-search") || "";
            var okText = words.every(function (w) { return hay.indexOf(w) >= 0; });
            var on = okType && okText;
            li.hidden = !on;
            if (on) shown++;
        });
        buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-jn-filter") === state.type ? "true" : "false"); });
        if (empty) empty.hidden = shown > 0;
        if (status) status.textContent = shown + (shown === 1 ? " note" : " notes") + " shown.";
        if (push) {
            try {
                var p = new URLSearchParams();
                if (state.type !== "all") p.set("type", state.type);
                if (state.q) p.set("q", state.q);
                var qs = p.toString();
                history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
            } catch (e) { /* history unavailable */ }
        }
    }

    buttons.forEach(function (b) {
        b.addEventListener("click", function () { state.type = b.getAttribute("data-jn-filter"); apply(true); });
    });
    var timer = 0;
    input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.q = input.value.trim().slice(0, 80); apply(true); }, 120);
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Escape" && input.value) { input.value = ""; state.q = ""; apply(true); } });

    apply(false);
})();
