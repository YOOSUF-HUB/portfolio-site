/* =========================================================
   NEURAL ORBIT — Code in motion  (ACTIVITY ARCHIVE / 003)

   The last 365 days of GitHub contributions (YOOSUF-HUB) as one
   Canvas 2D scene:

   ORBIT   every date is one particle. 53 week columns run
           clockwise from the top; 7 concentric tracks are the
           weekdays (Sun inside → Sat outside). Brightness and
           size encode the day's real contribution count.
   FIELD   neural fibres grown from the same data. Each week owns
           one dendrite rooted on the outer "spine": its length
           follows the weekly total, every active day of the week
           sprouts a child branch (length ∝ that day's count, tip
           = activation point), very active days add twigs.
           Consecutive active days are joined inside the ring,
           consecutive active weeks by faint temporal arcs.
           Quiet weeks keep a short dark stub. Geometry is seeded
           from the week's date, so shapes are stable per data.
   SIGNAL  a white head with a silver trail travels clockwise
           along the spine at irregular intervals, flares active
           days as it passes and sometimes branches into a week.
           Selecting a day traces its streak → spine → branch.
           New activity found by a refresh fires once per change.

   Data: GET /api/github-contributions (token stays server-side).
   Last good payload cached in localStorage for offline fallback;
   nothing is generated when no data is available.
   Pauses off-screen / hidden tab; prefers-reduced-motion keeps
   every interaction but drops the ambient animation.
   ========================================================= */

(function () {
    "use strict";

    var root = document.querySelector("[data-no]");
    if (!root) return;

    var stage = root.querySelector("[data-no-stage]");
    var canvas = root.querySelector("[data-no-canvas]");
    var ctx = canvas && canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;

    var $ = function (s) { return root.querySelector(s); };
    var el = {
        total: $("[data-no-total]"), period: $("[data-no-period]"),
        sync: $("[data-no-sync]"), syncText: $("[data-no-sync-text]"), retry: $("[data-no-retry]"),
        tip: $("[data-no-tip]"), tipK: $("[data-no-tip-k]"), tipV: $("[data-no-tip-v]"), tipNav: $("[data-no-tip-nav]"),
        commits: $("[data-no-commits]"), active: $("[data-no-active]"), streak: $("[data-no-streak]"), updated: $("[data-no-updated]"),
        months: $("[data-no-months]"), live: $("[data-no-live]"), from: $("[data-no-from]"),
    };

    var API = "/api/github-contributions";
    var LS_DATA = "neural-orbit:data:v1";
    var LS_SEEN = "neural-orbit:seen:v1";
    var REFRESH_MS = 30 * 60 * 1000;
    var TAU = Math.PI * 2;

    var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    var reduce = reduceMQ.matches;

    var fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    var fmtLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    var fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    var fmtStamp = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var TIER_NAMES = ["No activity", "Low intensity", "Moderate intensity", "High intensity", "Exceptional intensity"];

    function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
    function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
    function mulberry(seed) {
        return function () {
            seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

    /* ---------- Polyline paths (sampled once, reused every frame) ---------- */

    function Path(cap) { this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.l = new Float32Array(cap); this.n = 0; this.len = 0; }
    Path.prototype.push = function (x, y) {
        var n = this.n;
        if (n >= this.x.length) { // grow (only during construction)
            var c = this.x.length * 2, nx = new Float32Array(c), ny = new Float32Array(c), nl = new Float32Array(c);
            nx.set(this.x); ny.set(this.y); nl.set(this.l); this.x = nx; this.y = ny; this.l = nl;
        }
        if (n > 0) {
            var dx = x - this.x[n - 1], dy = y - this.y[n - 1], d = Math.sqrt(dx * dx + dy * dy);
            if (d < 0.01) return;
            this.len += d;
        }
        this.x[n] = x; this.y[n] = y; this.l[n] = this.len; this.n = n + 1;
    };
    Path.prototype.bez = function (x0, y0, x1, y1, x2, y2, x3, y3, segs) {
        for (var i = this.n ? 1 : 0; i <= segs; i++) {
            var t = i / segs, u = 1 - t;
            this.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
                u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
        }
        return this;
    };
    Path.prototype.append = function (p, from, to) { for (var i = from; i <= to; i++) this.push(p.x[i], p.y[i]); return this; };
    Path.prototype.index = function (s) { // last index with l <= s
        var lo = 0, hi = this.n - 1;
        if (s <= 0) return 0;
        if (s >= this.len) return hi;
        while (lo < hi) { var m = (lo + hi + 1) >> 1; if (this.l[m] <= s) lo = m; else hi = m - 1; }
        return lo;
    };
    var PT = { x: 0, y: 0 };
    Path.prototype.at = function (s, out) {
        var i = this.index(s), j = Math.min(i + 1, this.n - 1), seg = this.l[j] - this.l[i];
        var t = seg > 0 ? (s - this.l[i]) / seg : 0;
        out.x = this.x[i] + (this.x[j] - this.x[i]) * t; out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
        return out;
    };
    function strokePath(c, p, i0, i1) {
        if (p.n < 2) return;
        if (i0 === undefined) { i0 = 0; i1 = p.n - 1; }
        c.moveTo(p.x[i0], p.y[i0]);
        for (var i = i0 + 1; i <= i1; i++) c.lineTo(p.x[i], p.y[i]);
    }

    /* ---------- Glow sprite ---------- */

    var sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    (function () {
        var g = sprite.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.18, "rgba(255,255,255,0.55)");
        gr.addColorStop(0.45, "rgba(255,255,255,0.12)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    })();
    function glow(c, x, y, size, a) { if (a <= 0.003) return; c.globalAlpha = a; c.drawImage(sprite, x - size / 2, y - size / 2, size, size); }

    /* =========================================================
       DATA
       ========================================================= */

    var D = null;          // payload in use
    var status = "loading";
    var N = 0, W = 0, WD0 = 0;
    var counts, tiers, weekOf, wdOf, monthOf, streakOf, dateMs;
    var weekTotal, weekActive, weekMaxDay;
    var months = [], streaks = [];
    var maxDay = 1, maxWeek = 1;

    function prepare(p) {
        var days = p.days;
        N = days.length;
        counts = new Int32Array(N); tiers = new Uint8Array(N); weekOf = new Int16Array(N); wdOf = new Uint8Array(N);
        monthOf = new Int16Array(N); streakOf = new Int16Array(N); dateMs = new Float64Array(N);
        WD0 = new Date(days[0].date + "T00:00:00Z").getUTCDay();
        W = Math.floor((N - 1 + WD0) / 7) + 1;
        weekTotal = new Int32Array(W); weekActive = new Uint8Array(W); weekMaxDay = new Int16Array(W).fill(-1);
        months = []; streaks = [];
        maxDay = 1; maxWeek = 1;

        var active = [];
        for (var i = 0; i < N; i++) {
            var c = days[i].count | 0, g = i + WD0;
            counts[i] = c; dateMs[i] = Date.parse(days[i].date + "T00:00:00Z");
            weekOf[i] = Math.floor(g / 7); wdOf[i] = g % 7;
            if (c > 0) active.push(c);
            if (c > maxDay) maxDay = c;
        }
        active.sort(function (a, b) { return a - b; });
        var p90 = active.length ? active[Math.floor(0.9 * (active.length - 1))] : Infinity;

        var cur = -1, st = null;
        for (i = 0; i < N; i++) {
            c = counts[i];
            var lvl = days[i].level | 0, w = weekOf[i];
            tiers[i] = c === 0 ? 0 : lvl <= 1 ? 1 : lvl === 2 ? 2 : (lvl >= 4 && c >= p90 ? 4 : 3);
            weekTotal[w] += c;
            if (c > 0) { weekActive[w]++; if (weekMaxDay[w] < 0 || c > counts[weekMaxDay[w]]) weekMaxDay[w] = i; }

            var d = new Date(dateMs[i]), key = d.getUTCFullYear() * 12 + d.getUTCMonth();
            if (key !== cur) { cur = key; months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth(), first: i, last: i, total: 0, active: 0 }); }
            var mo = months[months.length - 1]; mo.last = i; mo.total += c; if (c > 0) mo.active++;
            monthOf[i] = months.length - 1;

            if (c > 0) {
                if (!st) { st = { start: i, end: i, total: 0 }; streaks.push(st); }
                st.end = i; st.total += c; streakOf[i] = streaks.length - 1;
            } else { st = null; streakOf[i] = -1; }
        }
        for (w = 0; w < W; w++) if (weekTotal[w] > maxWeek) maxWeek = weekTotal[w];
    }

    /* =========================================================
       GEOMETRY
       ========================================================= */

    var G = { size: 0, dpr: 1, cx: 0, cy: 0, R: 0, rIn: 0, rOut: 0, step: 0, rSpine: 0, rField: 0, rLabel: 0, a0: 0, sweep: 0, k: 1, mobile: false };
    var trackR = new Float32Array(7);
    var dayX, dayY, dayRad;
    var spine = null;
    var weeks = [];       // per week: { rootX, rootY, ang, trunk:Path, children:[], arc:Path|null, twigs:[] }
    var dayRoute = [];    // per day: Path (trunk→child route) used for highlights / signals
    var dayChild = [];    // per day: child object or null
    var streakSeg = [];   // per day i: Path joining i-1 → i inside the ring (when both active)
    var monthEdges = [];  // per month (except first): Path stepped boundary
    var font = "11px sans-serif";

    function ang(w) { return G.a0 + ((w + 0.5) / W) * G.sweep; }
    function edge(w) { return G.a0 + (w / W) * G.sweep; }
    function px(r, a) { return G.cx + Math.cos(a) * r; }
    function py(r, a) { return G.cy + Math.sin(a) * r; }

    function layout() {
        var size = Math.round(stage.clientWidth);
        if (!size) return false;
        G.size = size;
        G.dpr = Math.min(window.devicePixelRatio || 1, 2);
        G.mobile = size < 560;
        G.cx = G.cy = size / 2;
        G.R = size / 2 - 2;
        var R = G.R;
        if (G.mobile) { G.rIn = 0.475 * R; G.rOut = 0.8 * R; G.rSpine = 0.815 * R; G.rField = 0.99 * R; G.sweep = TAU - 0.36; G.k = 0.82; }
        else { G.rIn = 0.47 * R; G.rOut = 0.71 * R; G.rSpine = 0.745 * R; G.rField = 0.985 * R; G.sweep = TAU - 0.42; G.k = Math.max(0.72, Math.min(1.15, R / 330)); }
        G.rLabel = G.rIn - 0.055 * R;
        G.a0 = -Math.PI / 2 + (TAU - G.sweep) / 2;
        G.step = (G.rOut - G.rIn) / 6;
        for (var t = 0; t < 7; t++) trackR[t] = G.rIn + G.step * t;

        var w = Math.round(size * G.dpr);
        [canvas, baseA, baseB].forEach(function (cv) { if (cv.width !== w) { cv.width = w; cv.height = w; } });

        var ff = getComputedStyle(root).fontFamily || "sans-serif";
        font = "500 " + (G.mobile ? 7.5 : 9.5) + "px " + ff;
        spine = new Path(400);
        for (var i = 0; i <= 360; i++) { var a = G.a0 + (i / 360) * G.sweep; spine.push(px(G.rSpine, a), py(G.rSpine, a)); }
        if (D) build();
        return true;
    }

    function build() {
        var R = G.R, k = G.k, i, w;
        dayX = new Float32Array(N); dayY = new Float32Array(N); dayRad = new Float32Array(N);
        var RAD = [0.95, 1.5, 2.0, 2.55, 3.2];
        for (i = 0; i < N; i++) {
            var a = ang(weekOf[i]), r = trackR[wdOf[i]];
            dayX[i] = px(r, a); dayY[i] = py(r, a);
            var extra = tiers[i] === 3 ? 0.4 * Math.sqrt(counts[i] / maxDay) : 0;
            dayRad[i] = (RAD[tiers[i]] + extra) * k;
        }

        // ---- dendrites ----
        weeks = []; dayRoute = new Array(N); dayChild = new Array(N);
        var maxL = G.rField - G.rSpine, TRUNK_SEGS = 28;
        for (w = 0; w < W; w++) {
            var aw = ang(w), first = Math.max(0, w * 7 - WD0), seedDay = first < N ? first : N - 1;
            var rnd = mulberry(hash("w" + dateMs[seedDay]));
            var rx = px(G.rSpine, aw), ry = py(G.rSpine, aw);
            var wk = { ang: aw, rootX: rx, rootY: ry, trunk: new Path(TRUNK_SEGS + 2), children: [], twigs: [], arc: null, quiet: weekTotal[w] === 0, t: 0 };
            weeks.push(wk);
            if (wk.quiet) {
                var sl = (0.022 + 0.014 * rnd()) * R;
                wk.trunk.push(rx, ry); wk.trunk.push(px(G.rSpine + sl, aw + 0.01), py(G.rSpine + sl, aw + 0.01));
                continue;
            }
            var t = Math.sqrt(weekTotal[w] / maxWeek); wk.t = t;
            var L = (0.2 + 0.8 * t) * maxL * (0.86 + 0.22 * rnd());
            var lean = (0.16 + 0.2 * rnd()) * (rnd() < 0.8 ? 1 : -0.7);
            var P = trunkPoints(rx, ry, aw, lean, L);
            for (var tries = 0; tries < 6 && Math.hypot(P[6] - G.cx, P[7] - G.cy) > G.rField; tries++) { L *= 0.88; P = trunkPoints(rx, ry, aw, lean, L); }
            wk.trunk.bez(P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], TRUNK_SEGS);

            // one child per active day (mobile: the three most active days)
            var daysIn = [];
            for (i = first; i < Math.min(N, w * 7 + 7 - WD0); i++) if (counts[i] > 0) daysIn.push(i);
            if (G.mobile && daysIn.length > 3) daysIn = daysIn.slice().sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 3).sort(function (a, b) { return a - b; });
            for (var j = 0; j < daysIn.length; j++) {
                var di = daysIn[j], wd = wdOf[di];
                var f = Math.min(0.9, 0.2 + 0.64 * (wd / 6) + 0.06 * (rnd() - 0.5));
                var si = Math.round(f * TRUNK_SEGS);
                var sx = wk.trunk.x[si], sy = wk.trunk.y[si];
                var j2 = Math.min(si + 1, wk.trunk.n - 1), j1 = Math.max(si - 1, 0);
                var ta = Math.atan2(wk.trunk.y[j2] - wk.trunk.y[j1], wk.trunk.x[j2] - wk.trunk.x[j1]);
                var side = (wd % 2 ? 1 : -1) * (rnd() < 0.18 ? -1 : 1);
                var ca = ta + side * (0.5 + 0.38 * rnd());
                var cl = L * (0.22 + 0.5 * Math.sqrt(counts[di] / maxDay)) * (1 - f * 0.3);
                var C = childPoints(sx, sy, ca, side, cl);
                for (tries = 0; tries < 6 && Math.hypot(C[6] - G.cx, C[7] - G.cy) > G.rField; tries++) { cl *= 0.85; C = childPoints(sx, sy, ca, side, cl); }
                var cp = new Path(24).bez(C[0], C[1], C[2], C[3], C[4], C[5], C[6], C[7], 16);
                var route = new Path(TRUNK_SEGS + 20).append(wk.trunk, 0, si).append(cp, 0, cp.n - 1);
                var child = { day: di, path: cp, route: route, tipX: C[6], tipY: C[7], twigs: [] };
                if (!G.mobile && tiers[di] >= 3) {
                    var nt = tiers[di] === 4 ? 2 : 1;
                    for (var q = 0; q < nt; q++) {
                        var tf = 0.45 + 0.3 * q + 0.1 * rnd(), ti = Math.round(tf * (cp.n - 1));
                        var tq = Math.min(ti + 1, cp.n - 1), tp = Math.max(ti - 1, 0);
                        var tA = Math.atan2(cp.y[tq] - cp.y[tp], cp.x[tq] - cp.x[tp]) + (q % 2 ? 1 : -1) * side * (0.55 + 0.3 * rnd());
                        var tl = cl * (0.28 + 0.12 * rnd()), bx = cp.x[ti], by = cp.y[ti];
                        child.twigs.push(new Path(14).bez(bx, by, bx + Math.cos(tA) * tl * 0.4, by + Math.sin(tA) * tl * 0.4,
                            bx + Math.cos(tA - side * 0.2) * tl * 0.75, by + Math.sin(tA - side * 0.2) * tl * 0.75,
                            bx + Math.cos(tA - side * 0.35) * tl, by + Math.sin(tA - side * 0.35) * tl, 10));
                    }
                }
                wk.children.push(child);
                dayChild[di] = child; dayRoute[di] = route;
            }
        }
        for (i = 0; i < N; i++) if (!dayRoute[i]) dayRoute[i] = weeks[weekOf[i]].trunk;

        // temporal arcs between consecutive active weeks
        for (w = 0; w < W - 1; w++) {
            var A = weeks[w], B = weeks[w + 1];
            if (A.quiet || B.quiet) continue;
            var ia = Math.round(A.trunk.n * 0.42), ib = Math.round(B.trunk.n * 0.42);
            var ax = A.trunk.x[ia], ay = A.trunk.y[ia], bx2 = B.trunk.x[ib], by2 = B.trunk.y[ib];
            var mx = (ax + bx2) / 2, my = (ay + by2) / 2, ma = Math.atan2(my - G.cy, mx - G.cx), push = 0.035 * R;
            A.arc = new Path(14).bez(ax, ay, mx + Math.cos(ma) * push, my + Math.sin(ma) * push, mx + Math.cos(ma) * push, my + Math.sin(ma) * push, bx2, by2, 12);
        }

        // streak joins inside the ring
        streakSeg = new Array(N);
        for (i = 1; i < N; i++) if (counts[i] > 0 && counts[i - 1] > 0) streakSeg[i] = streakPath(i - 1, i);

        // stepped month boundaries
        monthEdges = [];
        var hs = G.step / 2;
        for (var m = 1; m < months.length; m++) {
            var fi = months[m].first, fw = weekOf[fi], fk = wdOf[fi], e = new Path(48);
            var rI = G.rIn - hs, rO = G.rOut + hs;
            if (fk === 0) { e.push(px(rI, edge(fw)), py(rI, edge(fw))); e.push(px(rO, edge(fw)), py(rO, edge(fw))); }
            else {
                var rb = (trackR[fk - 1] + trackR[fk]) / 2, e1 = edge(fw + 1), e0 = edge(fw);
                e.push(px(rI, e1), py(rI, e1)); e.push(px(rb, e1), py(rb, e1));
                for (var s = 1; s <= 8; s++) { var aa = e1 + (e0 - e1) * (s / 8); e.push(px(rb, aa), py(rb, aa)); }
                e.push(px(rO, e0), py(rO, e0));
            }
            monthEdges.push(e);
        }
    }

    var TP = new Float64Array(8);
    function trunkPoints(x, y, a, lean, L) {
        TP[0] = x; TP[1] = y;
        TP[2] = x + Math.cos(a) * L * 0.38; TP[3] = y + Math.sin(a) * L * 0.38;
        TP[4] = x + Math.cos(a + lean) * L * 0.72; TP[5] = y + Math.sin(a + lean) * L * 0.72;
        TP[6] = x + Math.cos(a + lean * 1.45) * L; TP[7] = y + Math.sin(a + lean * 1.45) * L;
        return TP;
    }
    var CP = new Float64Array(8);
    function childPoints(x, y, a, side, l) {
        CP[0] = x; CP[1] = y;
        CP[2] = x + Math.cos(a) * l * 0.45; CP[3] = y + Math.sin(a) * l * 0.45;
        CP[4] = x + Math.cos(a - side * 0.25) * l * 0.8; CP[5] = y + Math.sin(a - side * 0.25) * l * 0.8;
        CP[6] = x + Math.cos(a - side * 0.45) * l; CP[7] = y + Math.sin(a - side * 0.45) * l;
        return CP;
    }
    function streakPath(a, b) {
        var p = new Path(16);
        if (weekOf[a] === weekOf[b]) {
            var ux = dayX[b] - dayX[a], uy = dayY[b] - dayY[a], d = Math.hypot(ux, uy) || 1, ta = (dayRad[a] + 1.2) / d, tb = (dayRad[b] + 1.2) / d;
            if (ta + tb >= 1) { p.push(dayX[a], dayY[a]); p.push(dayX[b], dayY[b]); return p; }
            p.push(dayX[a] + ux * ta, dayY[a] + uy * ta); p.push(dayX[b] - ux * tb, dayY[b] - uy * tb);
            return p;
        }
        var aa = ang(weekOf[a]), ab = ang(weekOf[b]), am = (aa + ab) / 2, r6 = trackR[wdOf[a]], r0 = trackR[wdOf[b]];
        return p.bez(dayX[a], dayY[a], px(r6, am), py(r6, am), px(r0, am), py(r0, am), dayX[b], dayY[b], 14);
    }

    /* =========================================================
       BASE LAYER (static scene, re-rendered only when focus changes)
       ========================================================= */

    var baseA = document.createElement("canvas"), baseB = document.createElement("canvas");
    var baseCur = baseA, basePrev = baseB, fade = 1, baseKey = "";

    var focus = { month: -1, week: -1 };
    function inFocus(i) {
        if (focus.month >= 0) return monthOf[i] === focus.month;
        if (focus.week >= 0) return weekOf[i] === focus.week;
        return true;
    }
    function weekFocus(w) {
        if (focus.month >= 0) { var mo = months[focus.month]; return w >= weekOf[mo.first] && w <= weekOf[mo.last]; }
        if (focus.week >= 0) return w === focus.week;
        return true;
    }

    function drawBase(cv) {
        var c = cv.getContext("2d"), R = G.R, k = G.k, i, w, a;
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        c.clearRect(0, 0, G.size, G.size);
        c.lineCap = "round"; c.lineJoin = "round";
        var anyFocus = focus.month >= 0 || focus.week >= 0, DIM = 0.2;

        // guide rings
        c.globalAlpha = 1; c.strokeStyle = "#1c1c1c"; c.lineWidth = 1;
        c.beginPath(); c.arc(G.cx, G.cy, G.rIn - G.step * 0.9, G.a0, G.a0 + G.sweep); c.stroke();
        c.strokeStyle = "#252525";
        c.beginPath(); c.arc(G.cx, G.cy, G.rSpine, G.a0, G.a0 + G.sweep); c.stroke();
        // start / today ticks
        c.strokeStyle = "#555555"; c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px(G.rIn - G.step, G.a0), py(G.rIn - G.step, G.a0)); c.lineTo(px(G.rSpine + 5, G.a0), py(G.rSpine + 5, G.a0));
        c.stroke();
        c.strokeStyle = "#a3a3a3";
        var ae = G.a0 + G.sweep;
        c.beginPath(); c.moveTo(px(G.rIn - G.step, ae), py(G.rIn - G.step, ae)); c.lineTo(px(G.rSpine + 7, ae), py(G.rSpine + 7, ae)); c.stroke();

        // weekday letters in the gap
        c.font = font; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#555555";
        var letters = "SMTWTFS";
        for (var t = 0; t < 7; t++) c.fillText(letters[t], G.cx, G.cy - trackR[t]);

        if (!D) { // loading skeleton: empty tracks only, no values
            c.strokeStyle = "#161616";
            for (t = 0; t < 7; t++) { c.beginPath(); c.arc(G.cx, G.cy, trackR[t], G.a0, G.a0 + G.sweep); c.stroke(); }
            return;
        }

        // month boundaries + labels
        c.lineWidth = 0.75;
        for (var m = 0; m < monthEdges.length; m++) {
            var mf = focus.month >= 0 && (focus.month === m + 1 || focus.month === m);
            c.strokeStyle = mf ? "#555555" : "#202020";
            c.beginPath(); strokePath(c, monthEdges[m]); c.stroke();
        }
        if (!G.mobile) {
            for (m = 0; m < months.length; m++) {
                var mo = months[m];
                if (mo.last - mo.first < 6) continue;
                var am = (ang(weekOf[mo.first]) + ang(weekOf[mo.last])) / 2;
                c.fillStyle = focus.month === m ? "#ffffff" : anyFocus ? "#333333" : "#555555";
                c.fillText(MONTHS[mo.m].toUpperCase(), px(G.rLabel, am), py(G.rLabel, am));
            }
        }

        // ---- neural field ----
        c.strokeStyle = "#a3a3a3";
        for (w = 0; w < W; w++) {
            var wk = weeks[w], wf = weekFocus(w) ? 1 : DIM;
            if (wk.quiet) {
                c.globalAlpha = wf; c.strokeStyle = "#252525"; c.lineWidth = 1 * k;
                c.beginPath(); strokePath(c, wk.trunk); c.stroke(); c.strokeStyle = "#a3a3a3";
                continue;
            }
            if (wk.arc) {
                c.globalAlpha = 0.11 * (weekFocus(w) && weekFocus(w + 1) ? 1 : DIM);
                c.lineWidth = 0.7 * k; c.beginPath(); strokePath(c, wk.arc); c.stroke();
            }
            c.globalAlpha = (0.14 + 0.46 * wk.t) * wf; c.lineWidth = (0.55 + 1.05 * wk.t) * k;
            c.beginPath(); strokePath(c, wk.trunk); c.stroke();
            for (var j = 0; j < wk.children.length; j++) {
                var ch = wk.children[j], cf = Math.sqrt(counts[ch.day] / maxDay), df = inFocus(ch.day) ? 1 : DIM;
                c.globalAlpha = (0.1 + 0.42 * cf) * wf * df; c.lineWidth = (0.45 + 0.75 * cf) * k;
                c.beginPath(); strokePath(c, ch.path); c.stroke();
                if (ch.twigs.length) {
                    c.globalAlpha = 0.16 * wf * df; c.lineWidth = 0.45 * k; c.beginPath();
                    for (var q = 0; q < ch.twigs.length; q++) strokePath(c, ch.twigs[q]);
                    c.stroke();
                }
            }
        }
        // activation points (tips)
        c.fillStyle = "#ffffff";
        for (w = 0; w < W; w++) {
            wk = weeks[w];
            for (j = 0; j < wk.children.length; j++) {
                ch = wk.children[j];
                var tr = tiers[ch.day], tf = weekFocus(w) && inFocus(ch.day) ? 1 : DIM;
                c.globalAlpha = (0.25 + 0.16 * tr) * tf;
                c.beginPath(); c.arc(ch.tipX, ch.tipY, (0.6 + 0.32 * tr) * k, 0, TAU); c.fill();
            }
        }

        // ---- streak joins inside the orbit ----
        c.strokeStyle = "#ffffff"; c.lineWidth = 0.8 * k;
        for (i = 1; i < N; i++) {
            if (!streakSeg[i]) continue;
            var sf = inFocus(i) && inFocus(i - 1) ? 1 : DIM;
            c.globalAlpha = (weekOf[i] === weekOf[i - 1] ? 0.16 : 0.08) * sf;
            c.beginPath(); strokePath(c, streakSeg[i]); c.stroke();
        }

        // ---- day particles, batched per tier ----
        var FILL = ["#4a4a4a", "#777777", "#a3a3a3", "#ffffff", "#ffffff"], ALPHA = [0.8, 0.9, 0.95, 0.95, 1];
        for (var tier = 0; tier < 5; tier++) {
            for (var pass = 0; pass < 2; pass++) {
                var on = pass === 0;
                if (!anyFocus && !on) continue;
                c.fillStyle = FILL[tier]; c.globalAlpha = ALPHA[tier] * (on ? 1 : (tier === 0 ? 0.45 : 0.22));
                c.beginPath();
                for (i = 0; i < N; i++) {
                    if (tiers[i] !== tier || (anyFocus && inFocus(i) !== on)) continue;
                    c.moveTo(dayX[i] + dayRad[i], dayY[i]); c.arc(dayX[i], dayY[i], dayRad[i], 0, TAU);
                }
                c.fill();
            }
        }
        // exceptional halos
        for (i = 0; i < N; i++) if (tiers[i] === 4) glow(c, dayX[i], dayY[i], 17 * k, (inFocus(i) ? 0.5 : 0.12));
        c.globalAlpha = 1;

        // today marker
        var li = N - 1;
        c.strokeStyle = "#a3a3a3"; c.lineWidth = 0.8; c.globalAlpha = 0.6;
        c.beginPath(); c.arc(dayX[li], dayY[li], dayRad[li] + 3.2 * k, 0, TAU); c.stroke();
        c.globalAlpha = 1;
    }

    function refreshBase(force) {
        var key = (D ? D.fetchedAt + N : "none") + "|" + focus.month + "|" + focus.week + "|" + G.size;
        if (!force && key === baseKey) return;
        baseKey = key;
        var t = basePrev; basePrev = baseCur; baseCur = t;
        drawBase(baseCur);
        fade = reduce || force ? 1 : 0;
        if (force) drawBase(basePrev);
        wake();
    }

    /* =========================================================
       SIGNALS & FLARES (fixed pools, no per-frame allocation)
       ========================================================= */

    var SIG = [], FLR = [];
    for (var si = 0; si < 14; si++) SIG.push({ on: false, path: null, s: 0, s0: 0, end: 0, v: 0, trail: 0, a: 0, kind: 0, lastW: -1, marks: null, mi: 0, tipX: 0, tipY: 0, strong: 0, w: -1 });
    for (var fi = 0; fi < 40; fi++) FLR.push({ on: false, x: 0, y: 0, t: 0, dur: 0, size: 0, a: 0, ring: false });
    var illum = null; // per week highlight 0..1 (trace illumination)
    var nextAmbient = 0;

    function spawn(path, s0, s1, v, kind) {
        for (var i = 0; i < SIG.length; i++) if (!SIG[i].on) {
            var g = SIG[i];
            g.on = true; g.path = path; g.s = s0; g.s0 = s0; g.end = Math.min(s1, path.len); g.v = v; g.kind = kind;
            g.trail = (kind === 0 ? 0.11 : 0.07) * G.R; g.a = 1; g.lastW = -1; g.marks = null; g.mi = 0; g.strong = 0; g.w = -1;
            return g;
        }
        return null;
    }
    function flare(x, y, size, a, dur, ring) {
        for (var i = 0; i < FLR.length; i++) if (!FLR[i].on) {
            var f = FLR[i]; f.on = true; f.x = x; f.y = y; f.size = size; f.a = a; f.dur = dur; f.t = 0; f.ring = !!ring; return;
        }
    }
    function flareDay(i, strength) {
        var tr = tiers[i];
        flare(dayX[i], dayY[i], (10 + 6 * tr) * G.k * (0.8 + strength), (0.35 + 0.12 * tr) * strength, 0.9 + 0.2 * tr, tr >= 3 && strength > 0.8);
    }
    function weekAtLen(s) { // spine distance → week index
        var w = Math.floor((s / spine.len) * W);
        return w < 0 ? 0 : w >= W ? W - 1 : w;
    }
    function spineLenAtWeek(w) { return ((w + 0.5) / W) * spine.len; }

    function branchInto(w, strong) {
        var wk = weeks[w];
        if (!wk || wk.quiet) return;
        var best = null;
        for (var j = 0; j < wk.children.length; j++) if (!best || counts[wk.children[j].day] > counts[best.day]) best = wk.children[j];
        var path = best ? best.route : wk.trunk;
        var g = spawn(path, 0, path.len, (0.18 + 0.1 * Math.random()) * G.R, 1);
        if (g) { g.tipX = best ? best.tipX : path.x[path.n - 1]; g.tipY = best ? best.tipY : path.y[path.n - 1]; g.strong = strong ? 1 : 0; g.w = w; }
    }

    function ambient(now) {
        if (!D || reduce || now < nextAmbient) return;
        var live = 0;
        for (var i = 0; i < SIG.length; i++) if (SIG[i].on && SIG[i].kind === 0) live++;
        nextAmbient = now + 2600 + Math.random() * 4600; // irregular pulse timing
        if (live >= 2) return;
        // start a few weeks ahead of an active week, travel a partial arc clockwise
        var pick = -1, tries = 0;
        while (tries++ < 24) { var w = Math.floor(Math.random() * W); if (!weeks[w].quiet) { pick = w; break; } }
        if (pick < 0) pick = Math.floor(Math.random() * W);
        var back = 3 + Math.random() * 7, span = 9 + Math.random() * 16;
        var s0 = Math.max(0, spineLenAtWeek(pick - back)), s1 = Math.min(spine.len, s0 + (span / W) * spine.len);
        spawn(spine, s0, s1, ((2.2 + Math.random() * 1.6) / W) * spine.len, 0);
    }

    /* Selected-day trace: day → its streak (forward) → spine → its branch */
    function trace(i) {
        if (!D) return;
        var end = i, st = streakOf[i];
        if (st >= 0) end = Math.min(streaks[st].end, i + 14);
        var p = new Path(256), marks = [], days = [];
        p.push(dayX[i], dayY[i]); marks.push(0); days.push(i);
        for (var d = i + 1; d <= end; d++) {
            var sp = streakPath(d - 1, d);
            p.push(dayX[d - 1], dayY[d - 1]);
            p.append(sp, 0, sp.n - 1); p.push(dayX[d], dayY[d]);
            marks.push(p.len); days.push(d);
        }
        var wk = weeks[weekOf[end]];
        p.push(wk.rootX, wk.rootY);
        var route = dayRoute[end];
        p.append(route, 0, route.n - 1);

        // illuminate the weeks the streak spans
        if (!illum || illum.length !== W) illum = new Float32Array(W);
        for (d = i; d <= end; d++) illum[weekOf[d]] = Math.max(illum[weekOf[d]], reduce ? 1 : 0.01);

        if (reduce) {
            staticTrace = p; staticUntil = performance.now() + 2600;
            for (d = 0; d < days.length; d++) flareDay(days[d], 1);
            setTimeout(function () { staticTrace = null; if (illum) illum.fill(0); requestDraw(); }, 2700);
            requestDraw();
            return;
        }
        var g = spawn(p, 0, p.len, 0.3 * G.R, 2);
        if (g) {
            g.marks = { s: marks, d: days }; g.mi = 0; g.trail = 0.12 * G.R;
            g.tipX = dayChild[end] ? dayChild[end].tipX : route.x[route.n - 1];
            g.tipY = dayChild[end] ? dayChild[end].tipY : route.y[route.n - 1];
            g.strong = 1; g.w = weekOf[end];
        }
        // a secondary pulse up the selected day's own branch
        if (end !== i && dayChild[i]) { var g2 = spawn(dayChild[i].route, 0, dayChild[i].route.len, 0.24 * G.R, 1); if (g2) { g2.tipX = dayChild[i].tipX; g2.tipY = dayChild[i].tipY; g2.strong = 1; g2.w = weekOf[i]; } }
        flareDay(i, 1.2);
        wake();
    }
    var staticTrace = null, staticUntil = 0;

    /* New activity after a refresh — fires once per changed record */
    var pendingNew = [];
    function fireNew() {
        if (!pendingNew.length || !inView || document.hidden || !D) return;
        var list = pendingNew.splice(0, 3);
        list.forEach(function (i, n) {
            setTimeout(function () {
                if (reduce) { flareDay(i, 1.3); requestDraw(); return; }
                var w = weekOf[i], s1 = spineLenAtWeek(w), s0 = Math.max(0, s1 - (6 / W) * spine.len);
                var g = spawn(spine, s0, s1, (4 / W) * spine.len, 0);
                if (g) { g.strong = 1; g.w = w; g.kind = 3; g.tipX = i; }
                wake();
            }, n * 900);
        });
    }

    /* =========================================================
       FRAME
       ========================================================= */

    var inView = false, raf = 0, last = 0, drawQueued = false;
    var hover = { day: -1, week: -1, month: -1 }, sel = { day: -1, week: -1, month: -1 };

    function anyActive() {
        if (fade < 1) return true;
        if (reduce) return false;
        return !!D;
    }
    function wake() {
        if (raf || !inView || document.hidden) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    function requestDraw() {
        if (raf) return;
        if (drawQueued) return;
        drawQueued = true;
        requestAnimationFrame(function () { drawQueued = false; if (!raf) render(0, performance.now()); });
    }

    function frame(now) {
        raf = 0;
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        render(dt, now);
        if (inView && !document.hidden && (anyActive() || busy())) raf = requestAnimationFrame(frame);
    }
    function busy() {
        for (var i = 0; i < SIG.length; i++) if (SIG[i].on) return true;
        for (i = 0; i < FLR.length; i++) if (FLR[i].on) return true;
        if (illum) for (i = 0; i < illum.length; i++) if (illum[i] > 0.002) return true;
        return false;
    }

    function render(dt, now) {
        var c = ctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.clearRect(0, 0, canvas.width, canvas.height);
        if (fade < 1) {
            fade = Math.min(1, fade + dt / 0.24);
            var e = fade * fade * (3 - 2 * fade);
            c.globalAlpha = 1 - e; c.drawImage(basePrev, 0, 0);
            c.globalAlpha = e; c.drawImage(baseCur, 0, 0);
        } else c.drawImage(baseCur, 0, 0);
        c.globalAlpha = 1;
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        c.lineCap = "round"; c.lineJoin = "round";
        if (!D) return;

        ambient(now);
        var k = G.k, i, j, g;

        // trace illumination of weeks
        if (illum) {
            c.strokeStyle = "#ffffff";
            for (var w = 0; w < W; w++) {
                var v = illum[w];
                if (v <= 0.002) continue;
                var wk = weeks[w];
                c.globalAlpha = 0.75 * v; c.lineWidth = (0.9 + wk.t) * k;
                c.beginPath(); strokePath(c, wk.trunk);
                for (j = 0; j < wk.children.length; j++) strokePath(c, wk.children[j].path);
                c.stroke();
                if (!reduce) illum[w] = holdIllum() ? Math.min(1, v + dt * 3) : Math.max(0, v - dt * 0.55);
            }
        }
        if (staticTrace) { c.strokeStyle = "#ffffff"; c.globalAlpha = 0.85; c.lineWidth = 1.2 * k; c.beginPath(); strokePath(c, staticTrace); c.stroke(); }

        // highlight: hovered / selected day or week
        var hd = hover.day >= 0 ? hover.day : sel.day, hw = hover.week >= 0 ? hover.week : sel.week;
        if (hw >= 0 && hd < 0) {
            wk = weeks[hw];
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.9; c.lineWidth = (1 + wk.t) * k;
            c.beginPath(); strokePath(c, wk.trunk);
            for (j = 0; j < wk.children.length; j++) { strokePath(c, wk.children[j].path); for (var q = 0; q < wk.children[j].twigs.length; q++) strokePath(c, wk.children[j].twigs[q]); }
            c.stroke();
            c.lineWidth = 0.8; c.globalAlpha = 0.55;
            c.beginPath();
            for (i = Math.max(0, hw * 7 - WD0); i < Math.min(N, hw * 7 + 7 - WD0); i++) { c.moveTo(dayX[i] + dayRad[i] + 2.5 * k, dayY[i]); c.arc(dayX[i], dayY[i], dayRad[i] + 2.5 * k, 0, TAU); }
            c.stroke();
        }
        if (hd >= 0) {
            wk = weeks[weekOf[hd]];
            var route = dayRoute[hd];
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.55; c.lineWidth = 0.8 * k;
            c.setLineDash([2, 3]);
            c.beginPath(); c.moveTo(dayX[hd], dayY[hd]); c.lineTo(wk.rootX, wk.rootY); c.stroke();
            c.setLineDash([]);
            c.globalAlpha = 0.95; c.lineWidth = 1.25 * k;
            c.beginPath(); strokePath(c, route); c.stroke();
            if (dayChild[hd]) { c.fillStyle = "#ffffff"; c.beginPath(); c.arc(dayChild[hd].tipX, dayChild[hd].tipY, 1.8 * k, 0, TAU); c.fill(); }
            c.globalAlpha = 1; c.lineWidth = 1;
            c.beginPath(); c.arc(dayX[hd], dayY[hd], dayRad[hd] + 4 * k, 0, TAU); c.stroke();
            glow(c, dayX[hd], dayY[hd], 16 * k, 0.5);
        }

        // signals
        for (i = 0; i < SIG.length; i++) {
            g = SIG[i];
            if (!g.on) continue;
            var path = g.path;
            g.s += g.v * dt;
            if (g.kind === 0 || g.kind === 3) {
                var wNow = weekAtLen(g.s);
                if (wNow !== g.lastW) {
                    if (g.lastW >= 0 && g.kind === 0) passWeek(wNow);
                    g.lastW = wNow;
                }
            }
            if (g.marks) while (g.mi < g.marks.s.length && g.s >= g.marks.s[g.mi]) { flareDay(g.marks.d[g.mi], 1); g.mi++; }
            var done = g.s >= g.end;
            if (done) g.s = g.end;
            // envelope: spine signals fade in and out over ~2 weeks of arc
            var envA = 1;
            if (g.kind === 0) { var fl = (2 / W) * spine.len; envA = Math.max(0.08, Math.min(1, (g.s - g.s0) / fl, (g.end - g.s) / fl + 0.1)); }
            drawTrail(c, path, g.s, g.trail, 0.85 * envA, (g.kind === 2 ? 1.3 : 1) * k);
            path.at(g.s, PT);
            glow(c, PT.x, PT.y, (g.kind === 2 ? 15 : 12) * k, 0.95 * envA);
            c.globalAlpha = envA; c.fillStyle = "#ffffff"; c.beginPath(); c.arc(PT.x, PT.y, 1.25 * k, 0, TAU); c.fill();
            if (done) {
                g.on = false;
                if (g.kind === 1 || g.kind === 2) {
                    flare(g.tipX, g.tipY, (g.strong ? 26 : 16) * k, g.strong ? 0.75 : 0.45, 1.1, !!g.strong);
                    if (g.kind === 2 && illum) holdUntil = 0;
                } else if (g.kind === 3) { // new activity: branch into the day's path
                    var di = g.tipX;
                    flareDay(di, 1.5);
                    var ch = dayChild[di];
                    var p2 = ch ? ch.route : weeks[weekOf[di]].trunk;
                    var g3 = spawn(p2, 0, p2.len, 0.22 * G.R, 1);
                    if (g3) { g3.tipX = ch ? ch.tipX : p2.x[p2.n - 1]; g3.tipY = ch ? ch.tipY : p2.y[p2.n - 1]; g3.strong = 1; }
                }
            }
        }
        if (anyTraceRunning()) holdUntil = now + 400;

        // flares
        for (i = 0; i < FLR.length; i++) {
            var f = FLR[i];
            if (!f.on) continue;
            f.t += dt || 0.016;
            var p = f.t / f.dur;
            if (p >= 1) { f.on = false; continue; }
            var fa = f.a * Math.pow(1 - p, 1.6);
            glow(c, f.x, f.y, f.size * (0.7 + 0.6 * p), fa);
            if (f.ring) { c.globalAlpha = fa * 0.6; c.strokeStyle = "#ffffff"; c.lineWidth = 0.7; c.beginPath(); c.arc(f.x, f.y, f.size * (0.15 + 0.5 * p), 0, TAU); c.stroke(); }
        }
        c.globalAlpha = 1;
    }
    var holdUntil = 0;
    function holdIllum() { return performance.now() < holdUntil; }
    function anyTraceRunning() { for (var i = 0; i < SIG.length; i++) if (SIG[i].on && SIG[i].kind === 2) return true; return false; }

    function passWeek(w) {
        if (weeks[w].quiet) return;
        var t = weeks[w].t;
        for (var i = Math.max(0, w * 7 - WD0); i < Math.min(N, w * 7 + 7 - WD0); i++) {
            if (counts[i] > 0 && Math.random() < 0.45 + 0.4 * t) flareDay(i, 0.55 + 0.35 * Math.random());
        }
        if (Math.random() < 0.12 + 0.45 * t) branchInto(w, false);
    }

    /* Silver trail: segments bucketed by alpha to avoid style churn */
    function drawTrail(c, p, s, len, a, lw) {
        var hi = p.index(s), BK = 6;
        c.strokeStyle = "#a3a3a3"; c.lineWidth = lw;
        for (var b = 0; b < BK; b++) {
            var lo = s - len * ((b + 1) / BK), up = s - len * (b / BK);
            c.globalAlpha = a * (1 - b / BK) * 0.8;
            c.beginPath();
            var started = false;
            for (var i = hi; i >= 0 && p.l[i] > lo - 0.0001; i--) {
                if (p.l[i] > up) continue;
                if (!started) { if (b === 0) { p.at(s, PT); c.moveTo(PT.x, PT.y); c.lineTo(p.x[i], p.y[i]); } else c.moveTo(p.x[Math.min(i + 1, p.n - 1)], p.y[Math.min(i + 1, p.n - 1)]), c.lineTo(p.x[i], p.y[i]); started = true; }
                else c.lineTo(p.x[i], p.y[i]);
            }
            if (started) c.stroke();
        }
    }

    /* =========================================================
       INTERACTION
       ========================================================= */

    function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (G.size / r.width), y: (e.clientY - r.top) * (G.size / r.height) }; }

    function hitDay(x, y, tol) {
        var dx = x - G.cx, dy = y - G.cy, r = Math.hypot(dx, dy);
        if (r < G.rIn - G.step * 1.2 || r > G.rOut + G.step * 1.2) return -1;
        var a = Math.atan2(dy, dx) - G.a0;
        a = ((a % TAU) + TAU) % TAU;
        if (a > G.sweep + 0.05 && a < TAU - 0.05) return -1;
        if (a >= TAU - 0.05) a -= TAU;
        var wf = (a / G.sweep) * W - 0.5, kf = (r - G.rIn) / G.step;
        var best = -1, bd = tol * tol;
        for (var w = Math.floor(wf); w <= Math.floor(wf) + 1; w++) for (var t = Math.floor(kf); t <= Math.floor(kf) + 1; t++) {
            if (w < 0 || w >= W || t < 0 || t > 6) continue;
            var i = w * 7 + t - WD0;
            if (i < 0 || i >= N) continue;
            var ex = dayX[i] - x, ey = dayY[i] - y, d = ex * ex + ey * ey;
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    function hitWeek(x, y, tol) {
        var dx = x - G.cx, dy = y - G.cy, r = Math.hypot(dx, dy);
        if (r < G.rOut + G.step * 0.6 || r > G.rField + 10) return -1;
        var a = ((Math.atan2(dy, dx) - G.a0) % TAU + TAU) % TAU, wc = Math.round((a / G.sweep) * W - 0.5);
        var best = -1, bd = tol * tol;
        for (var w = wc - 4; w <= wc + 2; w++) {
            if (w < 0 || w >= W) continue;
            var wk = weeks[w];
            bd = nearest(wk.trunk, x, y, bd, w);
            for (var j = 0; j < wk.children.length; j++) bd = nearest(wk.children[j].path, x, y, bd, w);
        }
        return hitW;
        function nearest(p, x2, y2, cur, w2) {
            for (var i = 0; i < p.n; i += 2) { var ex = p.x[i] - x2, ey = p.y[i] - y2, d = ex * ex + ey * ey; if (d < cur) { cur = d; hitW = w2; } }
            return cur;
        }
    }
    var hitW = -1;
    function hitWeekSafe(x, y, tol) { hitW = -1; return hitWeek(x, y, tol); }
    function hitMonth(x, y) {
        if (G.mobile) return -1;
        var dx = x - G.cx, dy = y - G.cy, r = Math.hypot(dx, dy);
        if (r < G.rLabel - 10 || r > G.rLabel + 9) return -1;
        var a = ((Math.atan2(dy, dx) - G.a0) % TAU + TAU) % TAU;
        if (a > G.sweep) return -1;
        var w = Math.floor((a / G.sweep) * W);
        for (var m = 0; m < months.length; m++) {
            var mo = months[m];
            if (mo.last - mo.first < 6) continue;
            var am = (ang(weekOf[mo.first]) + ang(weekOf[mo.last])) / 2, lx = px(G.rLabel, am), ly = py(G.rLabel, am);
            if (Math.abs(lx - x) < 16 && Math.abs(ly - y) < 9) return m;
        }
        return -1;
    }

    function applyFocus() {
        var m = hover.month >= 0 ? hover.month : sel.month;
        var w = m >= 0 ? -1 : (hover.day < 0 && hover.week >= 0 ? hover.week : (sel.day < 0 ? sel.week : -1));
        if (m !== focus.month || w !== focus.week) { focus.month = m; focus.week = w; refreshBase(false); }
        syncMonthButtons();
        requestDraw(); wake();
    }

    function dayText(i) {
        var c = counts[i];
        return { k: fmtDay.format(new Date(dateMs[i])), v: (c ? plural(c, "contribution") : "No contributions") + (c ? "<small>" + TIER_NAMES[tiers[i]] + (streakOf[i] >= 0 && streaks[streakOf[i]].end > streaks[streakOf[i]].start ? " · " + (streaks[streakOf[i]].end - streaks[streakOf[i]].start + 1) + "-day streak" : "") + "</small>" : "") };
    }
    function weekText(w) {
        var first = Math.max(0, w * 7 - WD0), lastD = Math.min(N - 1, w * 7 + 6 - WD0);
        return { k: "Week of " + fmtShort.format(new Date(dateMs[first])), v: plural(weekTotal[w], "contribution") + "<small>" + plural(weekActive[w], "active day") + " of " + (lastD - first + 1) + "</small>" };
    }
    function monthText(m) {
        var mo = months[m];
        return { k: MONTHS_LONG[mo.m] + " " + mo.y, v: plural(mo.total, "contribution") + "<small>" + plural(mo.active, "active day") + "</small>" };
    }

    function showTip(t, x, y, pinned) {
        el.tipK.textContent = t.k; el.tipV.innerHTML = t.v;
        el.tip.hidden = false;
        if (pinned) el.tip.setAttribute("data-pinned", ""); else el.tip.removeAttribute("data-pinned");
        el.tipNav.hidden = !pinned || sel.day < 0;
        var sw = stage.clientWidth / G.size, tw = el.tip.offsetWidth, th = el.tip.offsetHeight, W2 = stage.clientWidth;
        var X = x * sw, Y = y * sw, gap = 14;
        var left = X + gap, top = Y - th - gap;
        if (left + tw > W2 - 4) left = X - tw - gap;
        if (left < 4) left = Math.max(4, Math.min(W2 - tw - 4, X - tw / 2));
        if (top < 4) top = Y + gap;
        if (top + th > W2 - 4) top = W2 - th - 4;
        el.tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
    }
    function hideTip() { el.tip.hidden = true; el.tip.removeAttribute("data-pinned"); }
    function announce(s) { el.live.textContent = s; }

    function refreshTip() {
        if (hover.day >= 0) return showTip(dayText(hover.day), dayX[hover.day], dayY[hover.day], false);
        if (hover.week >= 0) { var wk = weeks[hover.week], tp = wk.trunk; return showTip(weekText(hover.week), tp.x[tp.n - 1], tp.y[tp.n - 1], false); }
        if (hover.month >= 0) { var mo = months[hover.month], am = (ang(weekOf[mo.first]) + ang(weekOf[mo.last])) / 2; return showTip(monthText(hover.month), px(G.rLabel, am), py(G.rLabel, am), false); }
        if (sel.day >= 0) return showTip(dayText(sel.day), dayX[sel.day], dayY[sel.day], true);
        if (sel.week >= 0) { tp = weeks[sel.week].trunk; return showTip(weekText(sel.week), tp.x[tp.n - 1], tp.y[tp.n - 1], true); }
        hideTip();
    }

    function selectDay(i, doTrace, viaKey) {
        sel.day = i; sel.week = -1;
        applyFocus(); refreshTip();
        announce(fmtLong.format(new Date(dateMs[i])) + ": " + (counts[i] ? plural(counts[i], "contribution") + ". " + TIER_NAMES[tiers[i]] + "." : "no contributions."));
        if (doTrace) { if (counts[i] > 0) trace(i); else { flareDay(i, 0.8); wake(); } }
    }
    function selectWeek(w) {
        sel.week = w; sel.day = -1;
        applyFocus(); refreshTip();
        announce(weekText(w).k + ": " + plural(weekTotal[w], "contribution") + ", " + plural(weekActive[w], "active day") + ".");
        if (!weeks[w].quiet) { if (!illum || illum.length !== W) illum = new Float32Array(W); if (!reduce) branchInto(w, true); else flare(weeks[w].rootX, weeks[w].rootY, 20 * G.k, 0.6, 1); wake(); }
    }
    function clearSel(all) {
        sel.day = -1; sel.week = -1; if (all) sel.month = -1;
        applyFocus(); refreshTip();
    }

    var lastPointer = "mouse", downAt = null;
    canvas.addEventListener("pointermove", function (e) {
        if (!D) return;
        lastPointer = e.pointerType;
        if (e.pointerType !== "mouse") return;
        var p = local(e), d = hitDay(p.x, p.y, Math.max(8, G.step * 0.75)), w = -1, m = -1;
        if (d < 0) w = hitWeekSafe(p.x, p.y, 12);
        if (d < 0 && w < 0) m = hitMonth(p.x, p.y);
        canvas.style.cursor = d >= 0 || w >= 0 || m >= 0 ? "pointer" : "crosshair";
        if (d === hover.day && w === hover.week && m === hover.month) return;
        hover.day = d; hover.week = w; hover.month = m;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerleave", function () {
        if (hover.day < 0 && hover.week < 0 && hover.month < 0) return;
        hover.day = hover.week = hover.month = -1;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerdown", function (e) { downAt = { x: e.clientX, y: e.clientY, t: e.pointerType }; lastPointer = e.pointerType; });
    canvas.addEventListener("click", function (e) {
        if (!D) return;
        var touch = lastPointer !== "mouse";
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
        var p = local(e), tol = touch ? Math.max(18, G.step * 1.3) : Math.max(8, G.step * 0.75);
        var d = hitDay(p.x, p.y, tol);
        if (d >= 0) { hover.day = hover.week = hover.month = -1; if (sel.day === d && !touch) return clearSel(false); return selectDay(d, true); }
        var w = hitWeekSafe(p.x, p.y, touch ? 22 : 12);
        if (w >= 0) { hover.day = hover.week = -1; if (sel.week === w && !touch) return clearSel(false); return selectWeek(w); }
        var m = hitMonth(p.x, p.y);
        if (m >= 0) { hover.month = -1; sel.month = sel.month === m ? -1 : m; sel.day = sel.week = -1; applyFocus(); refreshTip(); return announceMonth(); }
        clearSel(false);
    });

    canvas.addEventListener("keydown", function (e) {
        if (!D) return;
        var i = sel.day >= 0 ? sel.day : -1, k = e.key;
        var mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
        if (mv !== undefined) { e.preventDefault(); selectDay(i < 0 ? N - 1 : Math.max(0, Math.min(N - 1, i + mv)), false, true); return; }
        if (k === "Home" || k === "End") { e.preventDefault(); selectDay(k === "Home" ? 0 : N - 1, false, true); return; }
        if (k === "PageUp" || k === "PageDown") {
            e.preventDefault();
            var m = i < 0 ? months.length - 1 : monthOf[i] + (k === "PageUp" ? -1 : 1);
            m = Math.max(0, Math.min(months.length - 1, m));
            selectDay(months[m].first, false, true); return;
        }
        if ((k === "Enter" || k === " ") && i >= 0) { e.preventDefault(); selectDay(i, true, true); return; }
        if (k === "Escape") { e.preventDefault(); clearSel(true); announce("Selection cleared."); }
    });
    canvas.addEventListener("blur", function () { /* keep pinned selection; tooltip stays accessible */ });

    el.tip.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-no-close")) { clearSel(false); canvas.focus({ preventScroll: true }); return; }
        var step = +b.getAttribute("data-no-step");
        if (step && sel.day >= 0) { selectDay(Math.max(0, Math.min(N - 1, sel.day + step)), false); flareDay(sel.day, 0.9); wake(); }
    });

    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && (sel.day >= 0 || sel.week >= 0) && root.contains(document.activeElement)) clearSel(false); });

    /* Month buttons */
    function buildMonthButtons() {
        el.months.innerHTML = "";
        months.forEach(function (mo, m) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "no-month";
            b.setAttribute("aria-pressed", "false");
            var label = MONTHS[mo.m] + (m === 0 || mo.m === 0 || m === months.length - 1 && months[0].m === mo.m ? " ’" + String(mo.y).slice(2) : "");
            b.innerHTML = MONTHS[mo.m] + "<span>" + mo.total + "</span>";
            b.setAttribute("aria-label", MONTHS_LONG[mo.m] + " " + mo.y + ", " + plural(mo.total, "contribution") + ", " + plural(mo.active, "active day"));
            b.title = label + " · " + plural(mo.total, "contribution");
            b.addEventListener("click", function () {
                sel.month = sel.month === m ? -1 : m; sel.day = sel.week = -1;
                applyFocus(); refreshTip(); announceMonth();
            });
            b.addEventListener("mouseenter", function () { if (lastPointer === "mouse") { hover.month = m; applyFocus(); } });
            b.addEventListener("mouseleave", function () { if (hover.month === m) { hover.month = -1; applyFocus(); } });
            el.months.appendChild(b);
        });
    }
    function syncMonthButtons() {
        var bs = el.months.children;
        for (var m = 0; m < bs.length; m++) bs[m].setAttribute("aria-pressed", sel.month === m ? "true" : "false");
        if (D) {
            var mo = sel.month >= 0 ? months[sel.month] : hover.month >= 0 ? months[hover.month] : null;
            el.period.textContent = mo ? (G.mobile ? MONTHS[mo.m] + " " + mo.y + " · " + mo.total : MONTHS_LONG[mo.m] + " " + mo.y + " · " + plural(mo.total, "contribution")) : periodText();
        }
    }
    function announceMonth() {
        if (sel.month < 0) return announce("Showing all months.");
        var t = monthText(sel.month);
        announce(t.k + " highlighted: " + plural(months[sel.month].total, "contribution") + ", " + plural(months[sel.month].active, "active day") + ".");
    }

    /* =========================================================
       DATA LIFECYCLE
       ========================================================= */

    function periodText() { if (G.mobile) return "Last 365 days"; return fmtShort.format(new Date(dateMs[0])) + " – " + fmtShort.format(new Date(dateMs[N - 1])); }
    function rel(ms) {
        var s = Math.max(0, (Date.now() - ms) / 1000);
        if (s < 60) return "just now";
        if (s < 3600) return Math.round(s / 60) + " min ago";
        if (s < 86400) return Math.round(s / 3600) + " h ago";
        return Math.round(s / 86400) + " d ago";
    }
    function setSync(state, text) {
        status = state;
        el.sync.setAttribute("data-sync", state); el.syncText.textContent = text;
        stage.setAttribute("data-state", state === "error" ? (D ? "ready" : "error") : (D ? "ready" : "loading"));
        el.retry.hidden = !(state === "error" && !D);
    }
    function paintStats() {
        if (!D) return;
        var tt = D.totals;
        el.total.textContent = tt.contributions.toLocaleString("en-GB");
        el.commits.textContent = tt.commitContributions.toLocaleString("en-GB");
        el.active.innerHTML = tt.activeDays + "<small>/ " + N + "</small>";
        var best = 0; streaks.forEach(function (s) { best = Math.max(best, s.end - s.start + 1); });
        el.streak.innerHTML = best + "<small>" + (best === 1 ? "day" : "days") + "</small>";
        var at = Date.parse(D.fetchedAt);
        el.updated.innerHTML = fmtStamp.format(new Date(at)) + "<small>" + rel(at) + (status === "cached" ? " · cached copy" : "") + "</small>";
        el.from.textContent = fmtShort.format(new Date(dateMs[0]));
        syncMonthButtons();
    }

    function valid(p) {
        if (!p || !Array.isArray(p.days) || !p.days.length || !p.totals || !p.period) return false;
        for (var i = 0; i < p.days.length; i++) if (typeof p.days[i].date !== "string" || typeof p.days[i].count !== "number") return false;
        return true;
    }

    function apply(p, state) {
        var prev = D;
        D = p;
        var keepMonth = -1;
        if (prev && sel.month >= 0) { var pm = months[sel.month]; keepMonth = pm ? pm.y * 12 + pm.m : -1; }
        prepare(p);
        sel.day = sel.week = hover.day = hover.week = hover.month = -1; sel.month = -1;
        if (keepMonth >= 0) months.forEach(function (mo, m) { if (mo.y * 12 + mo.m === keepMonth) sel.month = m; });
        focus.month = sel.month; focus.week = -1;
        buildMonthButtons();
        if (!illum || illum.length !== W) illum = new Float32Array(W);
        if (G.size) build();
        setSync(state, state === "live" ? "Live" : state === "cached" ? "Cached" : "Offline");
        paintStats(); hideTip();
        refreshBase(true);
        requestDraw();

        // new activity → signal once per changed record
        var seen = lsGet(LS_SEEN), next = {};
        for (var i = 0; i < N; i++) if (counts[i] > 0) next[p.days[i].date] = counts[i];
        if (seen && state === "live") {
            for (i = N - 1; i >= 0 && pendingNew.length < 3; i--) if (counts[i] > (seen[p.days[i].date] || 0)) pendingNew.push(i);
        }
        if (state === "live") lsSet(LS_SEEN, next);
        fireNew();
    }

    var lastAttempt = 0, loading = false;
    function load() {
        if (loading) return;
        loading = true; lastAttempt = Date.now();
        if (!D) setSync("loading", "Synchronising");
        else el.sync.setAttribute("data-sync", "loading"), el.syncText.textContent = "Syncing";
        fetch(API, { headers: { Accept: "application/json" }, cache: "no-cache" })
            .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok || !valid(j)) throw new Error((j && j.error) || "HTTP " + r.status); return j; }); })
            .then(function (j) {
                loading = false;
                var changed = !D || D.fetchedAt !== j.fetchedAt || JSON.stringify(D.days) !== JSON.stringify(j.days);
                lsSet(LS_DATA, j);
                if (changed) apply(j, j.stale ? "cached" : "live");
                else { D.fetchedAt = j.fetchedAt; setSync(j.stale ? "cached" : "live", j.stale ? "Cached" : "Live"); paintStats(); }
            })
            .catch(function () {
                loading = false;
                if (D) { setSync("cached", "Cached"); paintStats(); }
                else {
                    setSync("error", "Unavailable");
                    el.period.textContent = "GitHub data is unavailable right now";
                    announce("GitHub contribution data is unavailable right now.");
                }
            });
    }

    el.retry.addEventListener("click", load);

    /* =========================================================
       LIFECYCLE
       ========================================================= */

    var cached = lsGet(LS_DATA);
    layout();
    if (valid(cached)) { status = "cached"; apply(cached, "cached"); el.syncText.textContent = "Syncing"; el.sync.setAttribute("data-sync", "loading"); }
    else { refreshBase(true); }

    var started = false;
    if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                inView = e.isIntersecting;
                if (inView) { if (!started) { started = true; load(); } fireNew(); requestDraw(); wake(); }
            });
        }, { rootMargin: "300px 0px" }).observe(root);
    } else { inView = true; started = true; load(); wake(); }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) return;
        if (started && Date.now() - lastAttempt > REFRESH_MS) load();
        fireNew(); wake();
    });
    setInterval(function () {
        if (document.hidden || !started) return;
        if (Date.now() - lastAttempt > REFRESH_MS) load();
        else if (D && inView) paintStats();
    }, 60000);

    var rz = 0;
    function onResize() {
        cancelAnimationFrame(rz);
        rz = requestAnimationFrame(function () {
            var before = G.size + "|" + G.dpr;
            layout();
            if (before !== G.size + "|" + G.dpr) { syncMonthButtons(); refreshBase(true); hideTip(); if (sel.day >= 0 || sel.week >= 0) refreshTip(); requestDraw(); }
        });
    }
    if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(stage);
    else window.addEventListener("resize", onResize);

    function onReduce(e) { reduce = e.matches; if (reduce) { SIG.forEach(function (g) { g.on = false; }); } requestDraw(); wake(); }
    if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
})();
