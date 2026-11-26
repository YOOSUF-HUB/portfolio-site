/* =========================================================
   EDUCATION — "The Learning Signal"

   Draws a delicate signal line through the academic milestones
   of #educationScroll and links its reveal to scroll position:
   - the line extends as the section moves through the viewport;
   - each milestone node lights when the line reaches it, and
     its record panel reveals (staggered, once);
   - a few faint particles drift around the lit nodes, and once
     the line is complete a single pulse travels along it now
     and then — a quiet echo of the hero's neural network.

   Layout is measured from the DOM, so the same code draws the
   horizontal time axis (≥768px) and the vertical rail (phones).
   All content is in the HTML; this file is purely decorative.
   prefers-reduced-motion: everything is shown at once, static.
   No dependencies.
   ========================================================= */

(function () {
    "use strict";

    var root = document.querySelector("[data-ls]");
    if (!root) return;

    var stage = root.querySelector("[data-ls-stage]");
    var svg = root.querySelector("[data-ls-svg]");
    var canvas = root.querySelector("[data-ls-canvas]");
    var axis = root.querySelector(".ls-axis");
    var legend = root.querySelector(".ls-legend");
    var records = Array.prototype.slice.call(root.querySelectorAll("[data-ls-record]"));
    if (!stage || !svg || !canvas || !axis) return;

    document.documentElement.classList.add("ls-js");

    var NS = "http://www.w3.org/2000/svg";
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var phone = window.matchMedia("(max-width: 767px)");
    var ctx = canvas.getContext("2d");

    var CONFIG = {
        step: 3,                 // px between path samples
        ripple: { amp: 9, width: 46, freq: 0.17 },   // wavelet at each node
        mobileRipple: { amp: 5, width: 30, freq: 0.24 },
        noise: 0.55,             // px of baseline jitter
        ease: 0.12,              // smoothing toward the scroll target
        particles: 16,           // per node
        mobileParticles: 10,
        pulseEvery: [3800, 6400],// ms between travelling pulses
        pulseSpeed: 0.55,        // px per ms
    };

    /* ---------- State ---------- */
    var geo = null;              // { pts, cum, len, nodes:[{id,el,at,x,y}], ... }
    var els = {};                // svg elements
    var target = 0, progress = 0;
    var visible = false, running = false, raf = 0;
    var particles = [];
    var pulse = null, nextPulse = 0;
    var lit = {};                // id -> 0..1 glow, eased
    var hover = {};              // id -> bool
    var dpr = 1, W = 0, H = 0;

    /* ---------- Helpers ---------- */
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    function seeded(seed) {
        var s = seed % 2147483647;
        if (s <= 0) s += 2147483646;
        return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    }

    function el(name, attrs) {
        var n = document.createElementNS(NS, name);
        for (var k in attrs) n.setAttribute(k, attrs[k]);
        return n;
    }

    function centre(node) {
        var s = stage.getBoundingClientRect();
        var r = node.getBoundingClientRect();
        return { x: r.left + r.width / 2 - s.left, y: r.top + r.height / 2 - s.top };
    }

    function rel(node) {
        var s = stage.getBoundingClientRect();
        var r = node.getBoundingClientRect();
        return { top: r.top - s.top, bottom: r.bottom - s.top, left: r.left - s.left, right: r.right - s.left };
    }

    function d(pts) {
        var out = "";
        for (var i = 0; i < pts.length; i++) out += (i ? "L" : "M") + pts[i][0].toFixed(1) + " " + pts[i][1].toFixed(1);
        return out;
    }

    /* Point on the sampled path at a given length */
    function at(len) {
        var pts = geo.pts, cum = geo.cum;
        if (len <= 0) return pts[0];
        if (len >= geo.len) return pts[pts.length - 1];
        var lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < len) lo = mid; else hi = mid; }
        var t = (len - cum[lo]) / (cum[hi] - cum[lo] || 1);
        return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
    }

    /* ---------- Geometry ---------- */
    function build() {
        var vertical = phone.matches;
        var s = stage.getBoundingClientRect();
        W = s.width; H = s.height;

        // Place the time axis between the two record rows (desktop).
        // The minor record sits in the first row, the degree in the last.
        if (!vertical) {
            var upper = rel(root.querySelector(".ls-record--minor"));
            axis.style.top = upper.bottom + "px";
            if (legend) legend.style.top = (upper.bottom - legend.offsetHeight - 36) + "px";
        }

        var nodeEls = Array.prototype.slice.call(
            root.querySelectorAll(vertical ? "[data-ls-node-m]" : "[data-ls-node]")
        );
        var nodes = nodeEls.map(function (n) {
            var c = centre(n);
            return { id: n.getAttribute(vertical ? "data-ls-node-m" : "data-ls-node"), el: n, x: c.x, y: c.y };
        });
        nodes.sort(function (a, b) { return vertical ? a.y - b.y : a.x - b.x; });

        var rp = vertical ? CONFIG.mobileRipple : CONFIG.ripple;
        var rand = seeded(17);
        var phase = [rand() * 6.28, rand() * 6.28, rand() * 6.28];

        // Main axis coordinate u runs from u0 to u1; the line sits at fixed v.
        var u0, u1, uFuture, v;
        if (vertical) {
            v = nodes[0].x;
            u0 = Math.max(0, nodes[0].y - 120);
            var last = rel(records[records.length - 1]);   // lowest record on the rail
            u1 = last.bottom;
            uFuture = null;
        } else {
            v = nodes[0].y;
            u0 = 0;
            u1 = centre(root.querySelector("[data-ls-now]")).x;
            uFuture = centre(root.querySelector("[data-ls-end]")).x;
        }

        function offset(u) {
            var o = 0;
            for (var i = 0; i < nodes.length; i++) {
                var dist = u - (vertical ? nodes[i].y : nodes[i].x);
                var env = Math.exp(-(dist * dist) / (rp.width * rp.width));
                o += rp.amp * env * Math.sin(dist * rp.freq);
            }
            // faint baseline jitter, damped to zero at the nodes
            var n = CONFIG.noise * (Math.sin(u * 0.043 + phase[0]) + 0.6 * Math.sin(u * 0.111 + phase[1]) + 0.3 * Math.sin(u * 0.27 + phase[2])) / 1.9;
            for (var j = 0; j < nodes.length; j++) {
                var dn = Math.abs(u - (vertical ? nodes[j].y : nodes[j].x));
                n *= clamp(dn / 14, 0, 1);
            }
            return o + n;
        }

        function point(u) { return vertical ? [v + offset(u), u] : [u, v + offset(u)]; }

        function sample(a, b) {
            var out = [], count = Math.max(2, Math.ceil(Math.abs(b - a) / CONFIG.step));
            for (var i = 0; i <= count; i++) out.push(point(a + (b - a) * (i / count)));
            return out;
        }

        var pts = sample(u0, u1);
        var cum = [0];
        for (var i = 1; i < pts.length; i++) {
            var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
            cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
        }
        var len = cum[cum.length - 1];

        nodes.forEach(function (n) {
            var u = vertical ? n.y : n.x;
            var idx = Math.round(((u - u0) / (u1 - u0)) * (pts.length - 1));
            n.at = cum[clamp(idx, 0, cum.length - 1)];
        });

        // Wires: node → its record panel
        var wires = nodes.map(function (n) {
            var rec = root.querySelector('[data-ls-record="' + n.id + '"] .ls-panel');
            var r = rel(rec);
            var to;
            if (vertical) to = [[n.x + 11, n.y], [r.left, n.y]];
            else if (r.bottom < n.y) to = [[n.x, n.y - 15], [n.x, r.bottom]];
            else to = [[n.x, n.y + 15], [n.x, r.top]];
            return { id: n.id, pts: to };
        });

        geo = {
            vertical: vertical, pts: pts, cum: cum, len: len, nodes: nodes, wires: wires,
            future: uFuture ? sample(u1, uFuture) : null,
            fade: vertical ? [0, u0, 0, u0 + 90] : [u0, 0, u0 + 120, 0],
        };

        draw();
        seedParticles();
        sizeCanvas();
    }

    function draw() {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        svg.setAttribute("viewBox", "0 0 " + W.toFixed(1) + " " + H.toFixed(1));
        svg.setAttribute("width", W);
        svg.setAttribute("height", H);

        var defs = el("defs", {});
        var g = el("linearGradient", {
            id: "lsFade", gradientUnits: "userSpaceOnUse",
            x1: geo.fade[0], y1: geo.fade[1], x2: geo.fade[2], y2: geo.fade[3],
        });
        g.appendChild(el("stop", { offset: "0", "stop-color": "#f5f5f5", "stop-opacity": "0" }));
        g.appendChild(el("stop", { offset: "1", "stop-color": "#f5f5f5", "stop-opacity": "1" }));
        defs.appendChild(g);
        svg.appendChild(defs);

        var pathD = d(geo.pts);
        svg.appendChild(el("path", { class: "ls-signal ls-signal--ghost", d: pathD }));

        if (geo.future) svg.appendChild(el("path", { class: "ls-signal ls-signal--future", d: d(geo.future) }));

        els.wires = {};
        geo.wires.forEach(function (w) {
            var p = el("path", { class: "ls-wire", d: d(w.pts), pathLength: "1" });
            svg.appendChild(p);
            els.wires[w.id] = p;
        });

        els.line = el("path", {
            class: "ls-signal", d: pathD, stroke: "url(#lsFade)",
            "stroke-dasharray": geo.len.toFixed(1) + " " + (geo.len + 10).toFixed(1),
        });
        svg.appendChild(els.line);

        els.halo = el("circle", { class: "ls-tip-halo", r: "6" });
        els.tip = el("circle", { class: "ls-tip", r: "1.8" });
        svg.appendChild(els.halo);
        svg.appendChild(els.tip);

        apply(true);
    }

    /* ---------- Progress → visuals ---------- */
    function measureTarget() {
        if (reduce.matches) return 1;
        var vh = window.innerHeight || 1;
        var s = stage.getBoundingClientRect();
        if (geo.vertical) {
            // The line's tip follows a point 68% down the viewport.
            var tipY = vh * 0.68 - s.top;
            var y0 = geo.pts[0][1], y1 = geo.pts[geo.pts.length - 1][1];
            return clamp((tipY - y0) / (y1 - y0 || 1), 0, 1);
        }
        // Horizontal: draw while the axis travels from 88% to 38% of the viewport.
        var axisY = s.top + geo.nodes[0].y;
        return clamp((vh * 0.88 - axisY) / (vh * 0.5), 0, 1);
    }

    function apply(force) {
        if (!geo || !els.line) return;
        var drawn = progress * geo.len;
        els.line.setAttribute("stroke-dashoffset", (geo.len - drawn).toFixed(1));

        var tipOn = progress > 0.002 && progress < 0.998;
        var p = at(drawn);
        els.tip.setAttribute("cx", p[0].toFixed(1));
        els.tip.setAttribute("cy", p[1].toFixed(1));
        els.halo.setAttribute("cx", p[0].toFixed(1));
        els.halo.setAttribute("cy", p[1].toFixed(1));
        els.tip.classList.toggle("is-on", tipOn);
        els.halo.classList.toggle("is-on", tipOn);

        geo.nodes.forEach(function (n) {
            var on = drawn >= n.at - 0.5;
            n.el.classList.toggle("is-lit", on);
            if (els.wires[n.id]) els.wires[n.id].classList.toggle("is-lit", on);
            if (on) {
                var rec = root.querySelector('[data-ls-record="' + n.id + '"]');
                if (rec) rec.classList.add("is-on");   // reveal once
            }
        });

        stage.classList.toggle("is-complete", progress >= 0.998);
        if (force) syncHover();
    }

    /* ---------- Particles ---------- */
    function sizeCanvas() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        renderParticles(performance.now());
    }

    function seedParticles() {
        var rand = seeded(91);
        var per = geo.vertical ? CONFIG.mobileParticles : CONFIG.particles;
        particles = [];
        geo.nodes.forEach(function (n) {
            if (lit[n.id] == null) lit[n.id] = 0;
            for (var i = 0; i < per; i++) {
                particles.push({
                    id: n.id,
                    a: rand() * Math.PI * 2,
                    r: 14 + Math.pow(rand(), 0.8) * (geo.vertical ? 26 : 44),
                    w: (rand() - 0.5) * 0.00018,        // angular drift, rad/ms
                    br: 0.6 + rand() * 0.6,             // breathing phase speed
                    ph: rand() * 6.28,
                    size: 0.5 + rand() * 0.9,
                    tone: rand() < 0.35 ? 255 : 150 + Math.round(rand() * 60),
                    alpha: 0.18 + rand() * 0.42,
                });
            }
        });
    }

    function nodeById(id) {
        for (var i = 0; i < geo.nodes.length; i++) if (geo.nodes[i].id === id) return geo.nodes[i];
        return null;
    }

    function renderParticles(now) {
        if (!geo) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        var t = reduce.matches ? 0 : now;

        // positions
        var pos = [];
        for (var i = 0; i < particles.length; i++) {
            var p = particles[i], n = nodeById(p.id);
            var g = lit[p.id] || 0;
            if (!n || g < 0.01) { pos.push(null); continue; }
            var spread = hover[p.id] ? 1.12 : 1;
            var r = p.r * spread * (0.92 + 0.08 * Math.sin(t * 0.001 * p.br + p.ph));
            var a = p.a + t * p.w;
            pos.push([n.x + Math.cos(a) * r, n.y + Math.sin(a) * r * 0.82, g * (hover[p.id] ? 1.5 : 1)]);
        }

        // faint links between near neighbours of the same node
        ctx.lineWidth = 0.5;
        for (var a1 = 0; a1 < pos.length; a1++) {
            if (!pos[a1]) continue;
            for (var b1 = a1 + 1; b1 < pos.length; b1++) {
                if (!pos[b1] || particles[a1].id !== particles[b1].id) continue;
                var dx = pos[a1][0] - pos[b1][0], dy = pos[a1][1] - pos[b1][1];
                var dd = dx * dx + dy * dy;
                if (dd > 400) continue;
                ctx.strokeStyle = "rgba(255,255,255," + (0.07 * (1 - dd / 400) * pos[a1][2]).toFixed(3) + ")";
                ctx.beginPath();
                ctx.moveTo(pos[a1][0], pos[a1][1]);
                ctx.lineTo(pos[b1][0], pos[b1][1]);
                ctx.stroke();
            }
        }

        for (var k = 0; k < pos.length; k++) {
            if (!pos[k]) continue;
            var q = particles[k], c = q.tone;
            ctx.fillStyle = "rgba(" + c + "," + c + "," + c + "," + Math.min(0.85, q.alpha * pos[k][2]).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(pos[k][0], pos[k][1], q.size, 0, 6.2832);
            ctx.fill();
        }

        // travelling pulse
        if (pulse) {
            var head = pulse.s;
            for (var j = 0; j < 14; j++) {
                var pp = at(head - j * 5);
                if (head - j * 5 < 0) break;
                ctx.fillStyle = "rgba(255,255,255," + (0.75 * (1 - j / 14)).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(pp[0], pp[1], 1.4 - j * 0.06, 0, 6.2832);
                ctx.fill();
            }
        }
    }

    function updatePulse(now, dt) {
        if (reduce.matches || progress < 0.998) { pulse = null; return; }
        if (!pulse) {
            if (!nextPulse) nextPulse = now + 1200;
            if (now >= nextPulse) pulse = { s: 0 };
            return;
        }
        var prev = pulse.s;
        pulse.s += CONFIG.pulseSpeed * dt;
        geo.nodes.forEach(function (n) {
            if (prev < n.at && pulse.s >= n.at) {
                n.el.classList.add("is-pulse");
                setTimeout(function () { n.el.classList.remove("is-pulse"); }, 520);
            }
        });
        if (pulse.s > geo.len + 70) {
            pulse = null;
            var r = CONFIG.pulseEvery;
            nextPulse = now + r[0] + Math.random() * (r[1] - r[0]);
        }
    }

    /* ---------- Loop ---------- */
    var last = 0;
    function frame(now) {
        raf = 0;
        if (!geo) return;
        var dt = last ? Math.min(now - last, 64) : 16;
        last = now;

        target = measureTarget();
        var diff = target - progress;
        progress = Math.abs(diff) < 0.0008 ? target : progress + diff * CONFIG.ease;
        apply(false);

        geo.nodes.forEach(function (n) {
            var goal = n.el.classList.contains("is-lit") ? 1 : 0;
            var v = lit[n.id] || 0;
            v += (goal - v) * 0.06;
            if (Math.abs(goal - v) < 0.005) v = goal;
            lit[n.id] = v;
        });

        updatePulse(now, dt);
        renderParticles(now);

        if (visible && !document.hidden) raf = requestAnimationFrame(frame);
        else { running = false; last = 0; }
    }

    function start() {
        if (reduce.matches) { still(); return; }
        if (running) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
    }

    function still() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        pulse = null;
        progress = target = 1;
        if (!geo) return;
        geo.nodes.forEach(function (n) { lit[n.id] = 1; });
        apply(true);
        renderParticles(0);
    }

    /* ---------- Hover: record ↔ node ---------- */
    function syncHover() {
        if (!geo) return;
        geo.nodes.forEach(function (n) {
            n.el.classList.toggle("is-hover", !!hover[n.id]);
            if (els.wires[n.id]) els.wires[n.id].classList.toggle("is-hover", !!hover[n.id]);
        });
        if (reduce.matches) renderParticles(0);
    }

    records.forEach(function (rec) {
        var id = rec.getAttribute("data-ls-record");
        function on() { hover[id] = true; rec.classList.add("is-hover"); syncHover(); }
        function off() { hover[id] = false; rec.classList.remove("is-hover"); syncHover(); }
        rec.addEventListener("mouseenter", on);
        rec.addEventListener("mouseleave", off);
        rec.addEventListener("focusin", on);
        rec.addEventListener("focusout", off);
    });

    /* ---------- Intro reveal ---------- */
    var reveals = root.querySelectorAll("[data-ls-reveal]");
    if ("IntersectionObserver" in window && !reduce.matches) {
        var ro = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) { e.target.classList.add("is-in"); ro.unobserve(e.target); }
            });
        }, { rootMargin: "0px 0px -12% 0px" });
        Array.prototype.forEach.call(reveals, function (r) { ro.observe(r); });
    } else {
        Array.prototype.forEach.call(reveals, function (r) { r.classList.add("is-in"); });
    }

    /* ---------- Wiring ---------- */
    var resizeTimer = 0;
    function relayout() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            build();
            if (reduce.matches) still(); else start();
        }, 60);
    }

    build();

    if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
            visible = entries[0].isIntersecting;
            if (visible) start();
        }, { rootMargin: "120px 0px 120px 0px" }).observe(stage);
    } else {
        visible = true;
    }

    if ("ResizeObserver" in window) {
        var lastW = 0, lastH = 0;
        new ResizeObserver(function (entries) {
            var r = entries[0].contentRect;
            if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
            lastW = r.width; lastH = r.height;
            relayout();
        }).observe(stage);
    } else {
        window.addEventListener("resize", relayout);
    }

    window.addEventListener("scroll", function () { if (visible) start(); }, { passive: true });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && visible) start(); });
    window.addEventListener("load", relayout);   // fonts / images can shift the layout

    function onMotion() { if (reduce.matches) still(); else { progress = 0; start(); } }
    if (reduce.addEventListener) reduce.addEventListener("change", onMotion);
    else if (reduce.addListener) reduce.addListener(onMotion);

    if (reduce.matches) still(); else start();
})();
