/*
 * PROJECTS UI
 *
 * Renders project content from projects-data.js:
 *   - [data-selected-work]  homepage "Selected Work" (first three featured)
 *   - [data-pj-page]        projects.html: hero counts, featured, filterable archive
 *
 * No dependencies. Needs projects-data.js and project-visuals.js first.
 */
(function () {
    "use strict";

    var DATA = window.PORTFOLIO_PROJECTS;
    var VIS = window.ProjectVisuals;

    if (!DATA || !VIS) {
        return;
    }

    document.documentElement.classList.add("pj-js");

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- markup helpers ---------- */

    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function pad(n) {
        return (n < 10 ? "0" : "") + n;
    }

    var ARROW = '<svg class="pj-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8"/></svg>';

    function tags(p, max) {
        var list = max ? p.technologies.slice(0, max) : p.technologies;
        return '<ul class="pj-tags" aria-label="Technologies">' + list.map(function (t) {
            return "<li>" + esc(t) + "</li>";
        }).join("") + "</ul>";
    }

    function links(p, style) {
        var out = "";
        var cls = style === "button" ? "pj-btn" : "pj-link";

        if (p.githubUrl) {
            out += '<a class="' + cls + '" href="' + esc(p.githubUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(p.title) + ' source code on GitHub (opens in a new tab)">' +
                (style === "button" ? "View repository" : "GitHub") + ARROW + "</a>";
        }

        if (p.liveDemoUrl) {
            out += '<a class="' + cls + (style === "button" ? " pj-btn--ghost" : "") + '" href="' + esc(p.liveDemoUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(p.title) + ' live demo (opens in a new tab)">' +
                "Live demo" + ARROW + "</a>";
        }

        return out ? '<div class="pj-links">' + out + "</div>" : "";
    }

    function plate(p, opts) {
        opts = opts || {};
        var inner;
        var caption;

        if (p.image) {
            inner = '<div class="pj-plate__frame pj-plate__frame--image"><img src="' + esc(p.image.src) + '" alt="' + esc(p.image.alt) + '" width="1440" height="900" loading="' + (opts.eager ? "eager" : "lazy") + '" decoding="async"></div>';
            caption = "Screenshot · " + esc(p.image.caption);
        } else {
            inner = '<div class="pj-plate__frame">' + VIS.render(p) + "</div>";
            caption = esc(VIS.kind(p));
        }

        return '<figure class="pj-plate">' + inner +
            '<figcaption class="pj-plate__cap"><span>Fig. ' + esc(p.number) + "</span><span>" + caption + "</span></figcaption></figure>";
    }

    function status(p) {
        return p.status ? '<span class="pj-status">' + esc(p.status) + "</span>" : "";
    }

    function features(p) {
        return '<ul class="pj-features" aria-label="Key features">' + p.keyFeatures.map(function (f) {
            return "<li>" + esc(f) + "</li>";
        }).join("") + "</ul>";
    }

    /* ---------- reveal on scroll ---------- */

    function reveal(nodes) {
        if (reduceMotion || !("IntersectionObserver" in window)) {
            nodes.forEach(function (n) { n.classList.add("is-in"); });
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add("is-in");
                    io.unobserve(e.target);
                }
            });
        }, { rootMargin: "0px 0px -8% 0px" });

        nodes.forEach(function (n) { io.observe(n); });
    }

    /* =========================================================
       HOMEPAGE — SELECTED WORK
       ========================================================= */

    function selectedWork(root) {
        var list = DATA.featuredProjects().slice(0, 3);

        if (!list.length) {
            return;
        }

        function item(p, i, lead) {
            var top = '<div class="sw-item__top"><span class="sw-index" aria-hidden="true">' + pad(i + 1) + "</span>" +
                '<span class="pj-label pj-label--plain">' + esc(DATA.categoryLabel(p.category)) + "</span></div>";
            var heading = '<div><h3 class="sw-title"><span class="pj-title-link">' + esc(p.title) + "</span></h3>" +
                '<p class="sw-subtitle">' + esc(p.subtitle) + "</p></div>";
            var desc = '<p class="sw-desc">' + esc(p.description) + "</p>";
            var foot = '<div class="sw-foot">' + tags(p, lead ? 4 : 3) + links(p) + "</div>";

            if (lead) {
                return '<article class="sw-item sw-lead pj-hover" data-reveal aria-label="' + esc(p.title) + '">' +
                    top + plate(p) + heading + (p.status ? "<div>" + status(p) + "</div>" : "") + desc + foot + "</article>";
            }

            return '<article class="sw-item sw-item--secondary pj-hover" data-reveal aria-label="' + esc(p.title) + '">' +
                top + heading + '<div class="sw-body">' + plate(p) + desc + "</div>" + foot + "</article>";
        }

        var html = '<div class="sw-grid">' + item(list[0], 0, true) + '<div class="sw-side">';

        for (var i = 1; i < list.length; i++) {
            html += item(list[i], i, false);
        }

        root.innerHTML = html + "</div></div>";

        var total = root.closest("section").querySelectorAll("[data-pj-total]");
        Array.prototype.forEach.call(total, function (n) { n.textContent = pad(DATA.projects.length); });

        reveal(Array.prototype.slice.call(root.querySelectorAll("[data-reveal]")));
    }

    /* =========================================================
       PROJECTS PAGE
       ========================================================= */

    function projectsPage(page) {
        var projects = DATA.projects;
        var cats = DATA.categories;

        /* ---- A. hero: total + category index ---- */

        Array.prototype.forEach.call(page.querySelectorAll("[data-pj-total]"), function (n) {
            n.textContent = pad(projects.length);
        });

        var index = page.querySelector("[data-pj-index]");

        if (index) {
            index.innerHTML = cats.map(function (c) {
                var n = projects.filter(function (p) { return p.category === c.id; }).length;
                return '<li><a href="?category=' + c.id + '#archive" data-jump="' + c.id + '"><span>' + esc(c.label) + "</span><span>" + pad(n) + "</span></a></li>";
            }).join("");
        }

        /* ---- B. featured ---- */

        var featuredRoot = page.querySelector("[data-pj-featured]");

        if (featuredRoot) {
            featuredRoot.innerHTML = DATA.featuredProjects().map(function (p, i) {
                return '<article class="pjf pj-hover' + (i % 2 ? " pjf--flip" : "") + '" data-reveal aria-labelledby="pjf-' + p.id + '">' +
                    '<div class="pjf__media">' + plate(p, { eager: i === 0 }) + "</div>" +
                    '<div class="pjf__body">' +
                        '<div class="pjf__top"><span class="pjf__index" aria-hidden="true">' + pad(i + 1) + "</span>" +
                            '<span class="pj-label pj-label--plain">' + esc(DATA.categoryLabel(p.category)) + "</span>" + status(p) + "</div>" +
                        '<div><h3 class="pjf__title" id="pjf-' + p.id + '"><span class="pj-title-link">' + esc(p.title) + "</span></h3>" +
                            '<p class="pjf__subtitle">' + esc(p.subtitle) + "</p></div>" +
                        '<p class="pjf__desc">' + esc(p.description) + "</p>" +
                        '<p class="pjf__overview">' + esc(p.overview) + "</p>" +
                        features(p) +
                        tags(p) +
                        '<div class="pjf__actions">' + links(p, "button") + "</div>" +
                    "</div></article>";
            }).join("");
        }

        /* ---- C + D. filters, search, archive ---- */

        var grid = page.querySelector("[data-pj-grid]");
        var filtersEl = page.querySelector("[data-pj-filters]");
        var input = page.querySelector("[data-pj-search]");
        var searchWrap = input ? input.closest(".pj-search") : null;
        var clearBtn = page.querySelector("[data-pj-clear]");
        var resultEl = page.querySelector("[data-pj-result]");
        var emptyEl = page.querySelector("[data-pj-empty]");
        var emptyText = page.querySelector("[data-pj-empty-text]");

        if (!grid || !filtersEl || !input) {
            return;
        }

        var state = { cat: "all", q: "" };

        // Read state from the URL so a refresh or shared link keeps the view
        var params = new URLSearchParams(window.location.search);
        if (params.get("category") && cats.some(function (c) { return c.id === params.get("category"); })) {
            state.cat = params.get("category");
        }
        if (params.get("q")) {
            state.q = params.get("q");
            input.value = state.q;
        }

        // Search text for each project: name, subtitle, description, technologies, overview, features, category
        var haystack = {};
        projects.forEach(function (p) {
            haystack[p.id] = [p.title, p.subtitle, p.description, p.technologies.join(" "), p.overview, p.keyFeatures.join(" "), DATA.categoryLabel(p.category)]
                .join(" ")
                .toLowerCase();
        });

        function matchesQuery(p, q) {
            if (!q) return true;
            return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (term) {
                return haystack[p.id].indexOf(term) !== -1;
            });
        }

        // Build every card once; filtering only re-orders and hides them
        var cards = {};

        projects.forEach(function (p) {
            var el = document.createElement("article");
            el.className = "pj-card pj-hover";
            el.setAttribute("aria-labelledby", "pjc-" + p.id);
            el.innerHTML =
                '<div class="pj-card__meta"><span class="pj-card__num" aria-hidden="true">' + esc(p.number) + "</span>" +
                    '<div class="pj-card__cat"><span class="pj-label pj-label--plain">' + esc(DATA.categoryLabel(p.category)) + "</span>" +
                    (p.featured ? '<span class="pj-card__flag">Featured</span>' : "") + status(p) + "</div></div>" +
                plate(p) +
                '<div class="pj-card__text">' +
                    '<div><h3 class="pj-card__title" id="pjc-' + p.id + '"><span class="pj-title-link">' + esc(p.title) + "</span></h3>" +
                    '<p class="pj-card__subtitle">' + esc(p.subtitle) + "</p></div>" +
                    '<p class="pj-card__desc">' + esc(p.description) + "</p>" +
                    tags(p) +
                    '<details class="pj-more"><summary>Overview &amp; key features<span class="pj-more__icon" aria-hidden="true"></span></summary>' +
                        '<div class="pj-more__body"><p>' + esc(p.overview) + "</p>" + features(p) + "</div></details>" +
                    '<div class="pj-card__foot">' + links(p) + (p.year ? '<span class="pj-num">' + esc(p.year) + "</span>" : "") + "</div>" +
                "</div>";
            cards[p.id] = el;
        });

        // Editorial rhythm: rows of different widths instead of one repeated tile.
        // Spans are on a 12-column grid; a lone leftover card takes the full row.
        var ROWS = [[7, 5], [4, 4, 4], [12], [5, 7], [4, 4, 4]];

        function layout(list) {
            var spans = [];
            var r = 0;

            while (spans.length < list.length) {
                var row = ROWS[r % ROWS.length];
                var left = list.length - spans.length;

                if (left < row.length) {
                    row = left === 1 ? [12] : left === 2 ? [7, 5] : row.slice(0, left);
                }

                // Stagger: the narrow card of a pair, or the middle of three, sits lower
                row.forEach(function (s, i) {
                    spans.push({ d: s, offset: (row.length === 2 && s === 5) || (row.length === 3 && i === 1) });
                });

                r++;
            }

            return spans;
        }

        function apply() {
            var q = state.q.trim();
            var byQuery = projects.filter(function (p) { return matchesQuery(p, q); });
            var visible = byQuery.filter(function (p) { return state.cat === "all" || p.category === state.cat; });

            // Filter buttons: counts follow the current search
            Array.prototype.forEach.call(filtersEl.querySelectorAll("[data-filter]"), function (btn) {
                var id = btn.getAttribute("data-filter");
                var n = id === "all" ? byQuery.length : byQuery.filter(function (p) { return p.category === id; }).length;
                var countEl = btn.querySelector(".pj-filter__count");
                if (countEl) countEl.textContent = pad(n);
                btn.setAttribute("aria-pressed", String(id === state.cat));
                btn.setAttribute("aria-label", btn.getAttribute("data-label") + ", " + n + (n === 1 ? " project" : " projects"));
            });

            // Lay out the visible cards
            var spans = layout(visible);
            var previous = {};
            Array.prototype.forEach.call(grid.children, function (c) { previous[c.getAttribute("data-id")] = true; });

            var frag = document.createDocumentFragment();
            var tabletRun = 0;

            visible.forEach(function (p, i) {
                var el = cards[p.id];
                var s = spans[i];
                el.setAttribute("data-id", p.id);
                el.className = "pj-card pj-hover d-" + s.d + (s.offset ? " is-offset" : "");

                // Tablet (2 columns): full-width rows break runs; an odd card at the end of a run spans both columns
                if (s.d === 12) {
                    tabletRun = 0;
                } else {
                    tabletRun++;
                    var next = spans[i + 1];
                    if (tabletRun % 2 === 1 && (!next || next.d === 12)) el.className += " t-2";
                }

                if (!previous[p.id] && !reduceMotion) {
                    el.classList.add("is-entering");
                    el.style.transitionDelay = Math.min(i, 6) * 50 + "ms";
                }

                frag.appendChild(el);
            });

            grid.innerHTML = "";
            grid.appendChild(frag);

            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    Array.prototype.forEach.call(grid.querySelectorAll(".is-entering"), function (el) {
                        el.classList.remove("is-entering");
                    });
                    setTimeout(function () {
                        Array.prototype.forEach.call(grid.children, function (el) { el.style.transitionDelay = ""; });
                    }, 900);
                });
            });

            // Status line + empty state
            var catLabel = state.cat === "all" ? "" : DATA.categoryLabel(state.cat);
            var bits = [];
            if (catLabel) bits.push(esc(catLabel));
            if (q) bits.push("“" + esc(q) + "”");
            resultEl.innerHTML = "Showing <strong>" + pad(visible.length) + "</strong> of " + pad(projects.length) + " projects" + (bits.length ? " · " + bits.join(" · ") : "");

            emptyEl.hidden = visible.length > 0;
            if (!visible.length) {
                emptyText.textContent = "Nothing matches " + (q ? "“" + q + "”" : "this filter") + (catLabel ? " in " + catLabel : "") + ". Try a broader term, such as a language or framework, or show every project.";
            }

            if (searchWrap) searchWrap.classList.toggle("has-value", !!state.q);

            // Keep the URL in sync (replaceState: filtering doesn't flood browser history)
            var url = new URL(window.location.href);
            if (state.cat === "all") url.searchParams.delete("category"); else url.searchParams.set("category", state.cat);
            if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
            if (url.href !== window.location.href) {
                try { history.replaceState(null, "", url.pathname + url.search + url.hash); } catch (e) { /* file:// in some browsers */ }
            }
        }

        // Filter buttons
        filtersEl.innerHTML = [{ id: "all", label: "All" }].concat(cats).map(function (c) {
            return '<button type="button" class="pj-filter" data-filter="' + c.id + '" data-label="' + esc(c.label) + '" aria-pressed="false">' +
                esc(c.label) + ' <span class="pj-filter__count" aria-hidden="true">00</span></button>';
        }).join("");

        filtersEl.addEventListener("click", function (e) {
            var btn = e.target.closest("[data-filter]");
            if (!btn) return;
            state.cat = btn.getAttribute("data-filter");
            apply();
        });

        // Arrow keys move between filters (Tab still works as normal)
        filtersEl.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
            var btns = Array.prototype.slice.call(filtersEl.querySelectorAll("[data-filter]"));
            var i = btns.indexOf(document.activeElement);
            if (i === -1) return;
            e.preventDefault();
            var next = e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length;
            btns[next].focus();
            btns[next].scrollIntoView({ block: "nearest", inline: "nearest" });
        });

        // Search
        var timer;
        input.addEventListener("input", function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                state.q = input.value;
                apply();
            }, 120);
        });

        input.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && input.value) {
                e.preventDefault();
                input.value = "";
                state.q = "";
                apply();
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                input.value = "";
                state.q = "";
                apply();
                input.focus();
            });
        }

        // "/" jumps to search, like most docs sites
        document.addEventListener("keydown", function (e) {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
            var t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            e.preventDefault();
            input.focus();
        });

        // Reset from the empty state
        Array.prototype.forEach.call(page.querySelectorAll("[data-pj-reset]"), function (b) {
            b.addEventListener("click", function () {
                input.value = "";
                state = { cat: "all", q: "" };
                apply();
                input.focus();
            });
        });

        // Hero category index: filter in place instead of reloading
        if (index) {
            index.addEventListener("click", function (e) {
                var a = e.target.closest("[data-jump]");
                if (!a) return;
                e.preventDefault();
                state.cat = a.getAttribute("data-jump");
                apply();
                var target = page.querySelector("#archive");
                if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
            });
        }

        apply();

        // Give the sticky toolbar a backing only while it is stuck to the top
        var toolbar = page.querySelector(".pj-toolbar");
        if (toolbar && "IntersectionObserver" in window) {
            var sentinel = document.createElement("div");
            sentinel.setAttribute("aria-hidden", "true");
            toolbar.parentNode.insertBefore(sentinel, toolbar);
            new IntersectionObserver(function (entries) {
                var e = entries[0];
                toolbar.classList.toggle("is-stuck", !e.isIntersecting && e.boundingClientRect.top < 0);
            }).observe(sentinel);
        }

        // If the page was opened with a filter, land on the archive
        if ((state.cat !== "all" || state.q) && window.location.hash === "#archive") {
            var a = page.querySelector("#archive");
            if (a) a.scrollIntoView();
        }

        reveal(Array.prototype.slice.call(page.querySelectorAll("[data-reveal]")));
    }

    /* ---------- boot ---------- */

    var sw = document.querySelector("[data-selected-work]");
    if (sw) selectedWork(sw);

    var page = document.querySelector("[data-pj-page]");
    if (page) projectsPage(page);
})();
