/* =========================================================
   STELLAR NEURAL CORE — the activity archive (ACTIVITY ARCHIVE / 003)

   The last 365 days of GitHub contributions (YOOSUF-HUB) as one
   Canvas 2D scene: a circular contribution field around a small
   neural core, with organic dendrites in a loose star silhouette.

   FIELD      one particle per date. 53 week columns run clockwise
              from the top; 7 concentric tracks are the weekdays
              (Sun inside → Sat outside). Size and brightness come
              from that day's real count only.
   CORE       a dense cluster of white / silver particles.
   DENDRITES  6 primaries, each owning a run of weeks: core → spoke
              → hub ring → between two week columns → outward with
              secondary / tertiary branches and synaptic terminals.
   SIGNALS    travel only along that structure (ambient, selected
              day, week, month tour, new activity, YEAR IN MOTION).

   Data: GET /api/github-contributions (token stays server-side).
   The last good payload is cached in localStorage for offline
   use; nothing is generated when no data exists.
   Pauses off-screen / hidden tab; prefers-reduced-motion keeps
   every interaction but drops the ambient motion.
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
        sync: $("[data-no-sync]"), syncText: $("[data-no-sync-text]"),
        stateText: $("[data-no-state-text]"), retry: $("[data-no-retry]"),
        tip: $("[data-no-tip]"), tipK: $("[data-no-tip-k]"), tipV: $("[data-no-tip-v]"), tipNav: $("[data-no-tip-nav]"),
        commits: $("[data-no-commits]"), active: $("[data-no-active]"), streak: $("[data-no-streak]"), updated: $("[data-no-updated]"),
        months: $("[data-no-months]"), live: $("[data-no-live]"),
        play: $("[data-no-play-btn]"), range: $("[data-no-range]"), ticks: $("[data-no-ticks]"),
        rMonth: $("[data-no-r-month]"), rDate: $("[data-no-r-date]"), rStat: $("[data-no-r-stat]"), rProg: $("[data-no-r-prog]"),
    };

    var API = "/api/github-contributions";
    var LS_DATA = "neural-orbit:data:v1";
    var LS_SEEN = "neural-orbit:seen:v1";
    var REFRESH_MS = 30 * 60 * 1000;
    var TAU = Math.PI * 2;
    var PLAY_RATE = 14; // days per second during YEAR IN MOTION

    var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    var reduce = reduceMQ.matches;

    var fmtDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    var fmtLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    var fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    var fmtStamp = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var TIER_NAMES = ["No activity", "Low intensity", "Moderate intensity", "High intensity", "Exceptional intensity"];
    var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

    function plural(n, w) { return n.toLocaleString("en-GB") + " " + w + (n === 1 ? "" : "s"); }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
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
    function gauss(r) { return (r() + r() + r() - 1.5) * 1.15; }

    /* ---------- Polyline paths (sampled once, reused every frame) ---------- */

    function Path(cap) { this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.l = new Float32Array(cap); this.n = 0; this.len = 0; }
    Path.prototype.push = function (x, y) {
        var n = this.n;
        if (n >= this.x.length) { // grow (only while building)
            var c = this.x.length * 2, nx = new Float32Array(c), ny = new Float32Array(c), nl = new Float32Array(c);
            nx.set(this.x); ny.set(this.y); nl.set(this.l); this.x = nx; this.y = ny; this.l = nl;
        }
        if (n > 0) {
            var dx = x - this.x[n - 1], dy = y - this.y[n - 1], d = Math.sqrt(dx * dx + dy * dy);
            if (d < 0.001) return;
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
        var t = seg > 0 ? clamp((s - this.l[i]) / seg, 0, 1) : 0;
        out.x = this.x[i] + (this.x[j] - this.x[i]) * t; out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
        return out;
    };
    Path.prototype.transform = function (S, ox, oy) {
        for (var i = 0; i < this.n; i++) { this.x[i] = ox + this.x[i] * S; this.y[i] = oy + this.y[i] * S; this.l[i] *= S; }
        this.len *= S;
    };
    function tanAt(p, s) {
        var i = p.index(s), a = Math.max(0, i - 1), b = Math.min(p.n - 1, i + 1);
        return a === b ? 0 : Math.atan2(p.y[b] - p.y[a], p.x[b] - p.x[a]);
    }
    /* append the part of src between arc lengths s0 → s1 (either direction) */
    function appendSeg(p, src, s0, s1) {
        var i;
        src.at(s0, PT); p.push(PT.x, PT.y);
        if (s1 >= s0) { for (i = src.index(s0) + 1; i < src.n && src.l[i] < s1; i++) p.push(src.x[i], src.y[i]); }
        else { for (i = src.index(s0); i >= 0 && src.l[i] > s1; i--) p.push(src.x[i], src.y[i]); }
        src.at(s1, PT); p.push(PT.x, PT.y);
        return p;
    }
    function strokeTo(c, p, s) { // prefix of p up to arc length s
        if (p.n < 2 || s <= 0) return;
        var hi = p.index(s);
        c.moveTo(p.x[0], p.y[0]);
        for (var i = 1; i <= hi; i++) c.lineTo(p.x[i], p.y[i]);
        if (s < p.len) { p.at(s, PT); c.lineTo(PT.x, PT.y); }
    }
    function curve(x, y, a, L, bend, segs, wig) {
        var p = null, Lc = L, w = wig || 0;
        for (var it = 0; it < 4; it++) {
            p = new Path(segs + 2);
            var a1 = a + w, a2 = a + bend * 0.5 - w * 0.6, a3 = a + bend;
            p.bez(x, y, x + Math.cos(a1) * Lc * 0.36, y + Math.sin(a1) * Lc * 0.36,
                x + Math.cos(a2) * Lc * 0.7, y + Math.sin(a2) * Lc * 0.7,
                x + Math.cos(a3) * Lc, y + Math.sin(a3) * Lc, segs);
            if (p.len >= L * 0.998) break;
            Lc *= (L / p.len) * 1.004;
        }
        return p;
    }

    /* ---------- Glow sprite ---------- */

    var sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    (function () {
        var g = sprite.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, "rgba(255,255,255,1)");
        gr.addColorStop(0.2, "rgba(255,255,255,0.5)");
        gr.addColorStop(0.5, "rgba(255,255,255,0.1)");
        gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    })();
    function glow(c, x, y, size, a) { if (a <= 0.003) return; c.globalAlpha = a; c.drawImage(sprite, x - size / 2, y - size / 2, size, size); }

    /* =========================================================
       DATA
       ========================================================= */

    var D = null, status = "loading";
    var N = 0, counts, tiers, monthOf, streakOf, dateMs, domOf;
    var months = [], streaks = [];
    var maxDay = 1, maxMonth = 1;

    function prepare(p) {
        var days = p.days, i, c;
        N = days.length;
        counts = new Int32Array(N); tiers = new Uint8Array(N); monthOf = new Int16Array(N);
        streakOf = new Int16Array(N); dateMs = new Float64Array(N); domOf = new Uint8Array(N);
        months = []; streaks = []; maxDay = 1; maxMonth = 1;

        var active = [];
        for (i = 0; i < N; i++) {
            c = days[i].count | 0;
            counts[i] = c; dateMs[i] = Date.parse(days[i].date + "T00:00:00Z");
            if (c > 0) active.push(c);
            if (c > maxDay) maxDay = c;
        }
        active.sort(function (a, b) { return a - b; });
        var p90 = active.length ? active[Math.floor(0.9 * (active.length - 1))] : Infinity;

        var cur = -1, st = null;
        for (i = 0; i < N; i++) {
            c = counts[i];
            var lvl = days[i].level | 0;
            tiers[i] = c === 0 ? 0 : lvl <= 1 ? 1 : lvl === 2 ? 2 : (lvl >= 4 && c >= p90 ? 4 : 3);
            var d = new Date(dateMs[i]), key = d.getUTCFullYear() * 12 + d.getUTCMonth();
            domOf[i] = d.getUTCDate();
            if (key !== cur) { cur = key; months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth(), first: i, last: i, total: 0, active: 0 }); }
            var mo = months[months.length - 1]; mo.last = i; mo.total += c; if (c > 0) mo.active++;
            monthOf[i] = months.length - 1;
            if (c > 0) {
                if (!st) { st = { start: i, end: i, total: 0 }; streaks.push(st); }
                st.end = i; st.total += c; streakOf[i] = streaks.length - 1;
            } else { st = null; streakOf[i] = -1; }
        }
        months.forEach(function (mo) { if (mo.total > maxMonth) maxMonth = mo.total; });
    }

    /* =========================================================
       GEOMETRY — STELLAR NEURAL CORE
       FIELD      every date is one particle: 53 week columns run
                  clockwise from the top, 7 concentric tracks are the
                  weekdays (Sun inside → Sat outside).
       CORE       a small dense cluster of particles in the centre.
       DENDRITES  6 primary branches, one per contiguous run of weeks.
                  Each leaves the core as a spoke, joins the inner
                  hub ring, slips between two week columns and grows
                  outward with secondary and tertiary dendrites.
                  Brightness follows the real activity of its weeks.
       WEEKS      active weeks sprout a short twig on the outer spine.
       Geometry is seeded from fixed keys / week dates only, so the
       same data always draws the same structure.
       ========================================================= */

    var G = { w: 0, h: 0, dpr: 1, mobile: false, kk: 1, cx: 0, cy: 0, R: 0, rIn: 0, rOut: 0, step: 0, rHub: 0, rSpine: 0, rLabel: 0, rCore: 0, a0: 0, sweep: 0, W: 53, WD0: 0, built: "" };
    var NP = 6;
    var weekOf, wdOf, weekTotal, weekPr, maxWeek = 1;
    var dayX, dayY, dayRad;
    var PR = [], twigs = [], coreF = [], monthEdges = [], labels = [];
    var coreP, starP, satP, linkP, termP, glintP;
    var nCore = 0, nStar = 0, nSat = 0, nLink = 0, nTerm = 0, nGlint = 0;
    var trackR = new Float32Array(7);
    var font = "10px sans-serif";

    function ang(w) { return G.a0 + ((w + 0.5) / G.W) * G.sweep; }
    function edge(w) { return G.a0 + (w / G.W) * G.sweep; }
    function px(r, a) { return G.cx + Math.cos(a) * r; }
    function py(r, a) { return G.cy + Math.sin(a) * r; }

    function layout() {
        var w = Math.round(stage.clientWidth), h = Math.round(stage.clientHeight);
        if (!w || !h) return false;
        G.w = w; G.h = h;
        G.dpr = Math.min(window.devicePixelRatio || 1, 2);
        G.mobile = w < 560;
        var cw = Math.round(w * G.dpr), chh = Math.round(h * G.dpr);
        [canvas, baseA, baseB].forEach(function (cv) { if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; } });
        var ff = getComputedStyle(root).fontFamily || "sans-serif";
        font = "500 " + (G.mobile ? 7.5 : 9.5) + "px " + ff;
        var key = cw + "x" + chh + "|" + (D ? D.fetchedAt : "none");
        if (key !== G.built) { G.built = key; build(); }
        return true;
    }

    function build() {
        var mob = G.mobile, w = G.w, h = G.h, i, j, k, q, t, tries;
        G.cx = w / 2; G.cy = h / 2;
        var R = Math.min(w, h) / 2 - 2; G.R = R;
        G.kk = clamp(R / 330, 0.62, 1.12);
        var kk = G.kk;
        if (mob) { G.rIn = 0.45 * R; G.rOut = 0.76 * R; G.sweep = TAU - 0.36; }
        else { G.rIn = 0.43 * R; G.rOut = 0.665 * R; G.sweep = TAU - 0.42; }
        G.step = (G.rOut - G.rIn) / 6;
        G.rSpine = G.rOut + G.step * 0.75;
        G.rHub = G.rIn - G.step * 0.8;
        G.rLabel = G.rHub - (mob ? 0.05 : 0.045) * R;
        G.rCore = (mob ? 0.17 : 0.16) * R;
        G.a0 = -Math.PI / 2 + (TAU - G.sweep) / 2;
        for (t = 0; t < 7; t++) trackR[t] = G.rIn + G.step * t;

        // ---- calendar ----
        G.WD0 = D ? new Date(dateMs[0]).getUTCDay() : 0;
        G.W = D ? Math.floor((N - 1 + G.WD0) / 7) + 1 : 53;
        var W = G.W;
        weekTotal = new Int32Array(W); maxWeek = 1;
        if (D) {
            weekOf = new Int16Array(N); wdOf = new Uint8Array(N);
            dayX = new Float32Array(N); dayY = new Float32Array(N); dayRad = new Float32Array(N);
            var RAD = [0.95, 1.45, 1.95, 2.5, 3.1];
            for (i = 0; i < N; i++) {
                var g0 = i + G.WD0; weekOf[i] = Math.floor(g0 / 7); wdOf[i] = g0 % 7;
                weekTotal[weekOf[i]] += counts[i];
                var a = ang(weekOf[i]), r = trackR[wdOf[i]];
                dayX[i] = px(r, a); dayY[i] = py(r, a);
                // size follows the real count inside each tier; quiet days get a tiny seeded jitter
                var ex = tiers[i] ? (tiers[i] >= 3 ? 0.5 : 0.3) * Math.sqrt(counts[i] / maxDay) : (((hash("z" + dateMs[i]) & 255) / 255) - 0.5) * 0.2;
                dayRad[i] = (RAD[tiers[i]] + ex) * kk;
            }
            for (k = 0; k < W; k++) if (weekTotal[k] > maxWeek) maxWeek = weekTotal[k];
        }
        function firstDay(wk) { return clamp(wk * 7 - G.WD0, 0, Math.max(0, N - 1)); }
        function lastDay(wk) { return clamp(wk * 7 + 6 - G.WD0, 0, Math.max(0, N - 1)); }

        // field limit at angle a: stays inside the stage rectangle
        var margin = mob ? 6 : 10;
        function reach(a) {
            var ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
            return Math.min(ca > 1e-4 ? (w / 2 - margin) / ca : 1e9, sa > 1e-4 ? (h / 2 - margin) / sa : 1e9, R * 1.5);
        }
        function inside(p, rmin) {
            for (var n = 0; n < p.n; n += 2) {
                var x = p.x[n], y = p.y[n];
                if (x < margin || x > w - margin || y < margin || y > h - margin) return false;
                if (rmin && Math.hypot(x - G.cx, y - G.cy) < rmin) return false;
            }
            return true;
        }

        // ---- primary dendrites: sectors of contiguous weeks (fixed, seeded split) ----
        var rs = mulberry(hash("stellar-core|" + W));
        var wts = [], sum = 0;
        for (k = 0; k < NP; k++) { var v = 0.72 + 0.56 * rs(); wts.push(v); sum += v; }
        var cuts = [0], acc = 0;
        for (k = 0; k < NP; k++) { acc += wts[k]; cuts.push(Math.round((acc / sum) * W)); }
        weekPr = new Int8Array(W);
        var secTot = [], maxSec = 1;
        PR = [];
        for (k = 0; k < NP; k++) {
            var w0 = cuts[k], w1 = cuts[k + 1] - 1, tot = 0;
            for (q = w0; q <= w1; q++) { weekPr[q] = k; tot += weekTotal[q]; }
            secTot.push(tot); if (tot > maxSec) maxSec = tot;
            var wb = clamp(Math.round((w0 + w1 + 1) / 2 + (rs() - 0.5) * (w1 - w0) * 0.5), w0 + 1, w1);
            PR.push({ k: k, w0: w0, w1: w1, wb: wb, a: edge(wb), act: 0, sp: null, cr: null, dp: null, route: null, sec: [], months: null, firstM: 0, d0: 0, d1: 0, total: tot });
        }
        var terms = [], glints = [];
        PR.forEach(function (P) {
            P.act = D ? Math.sqrt(secTot[P.k] / maxSec) : 0.35;
            if (D) {
                P.d0 = firstDay(P.w0); P.d1 = lastDay(P.w1);
                P.months = new Uint8Array(months.length);
                for (var d = P.d0; d <= P.d1; d++) P.months[monthOf[d]] = 1;
                P.firstM = monthOf[P.d0];
            }
            var a = P.a;
            // spoke: from inside the core to the hub ring, softly curved
            var as = a + (rs() - 0.5) * 0.7, r0 = G.rCore * 0.3, bend = (rs() < 0.5 ? 1 : -1) * (0.3 + 0.35 * rs());
            P.sp = new Path(24).bez(px(r0, as), py(r0, as),
                px(G.rCore * 1.05, as + bend), py(G.rCore * 1.05, as + bend),
                px((G.rCore + G.rHub) * 0.62, a - bend * 0.4), py((G.rCore + G.rHub) * 0.62, a - bend * 0.4),
                px(G.rHub, a), py(G.rHub, a), 20);
            // crossing: hub → spine between two week columns (no particle sits on this line)
            P.cr = new Path(12);
            for (q = 0; q <= 8; q++) { var rr = G.rHub + (G.rSpine - G.rHub) * q / 8; P.cr.push(px(rr, a), py(rr, a)); }
            // dendrite: organic Bézier outward, length follows the sector's activity
            var lean = (0.16 + 0.26 * rs()) * (rs() < 0.5 ? 1 : -1), wig = (rs() - 0.5) * 0.4;
            var L = (reach(a + lean * 0.6) - G.rSpine) * (0.6 + 0.32 * P.act) * (0.86 + 0.18 * rs());
            for (tries = 0; tries < 9; tries++) {
                P.dp = curve(px(G.rSpine, a), py(G.rSpine, a), a, L, lean, 36, wig);
                if (inside(P.dp, G.rSpine - 1)) break;
                L *= 0.88;
            }
            // secondary dendrites (fewer on mobile), tertiary on some of them (desktop)
            P.sec = [];
            var ns = mob ? 2 : 3 + (rs() < 0.45 ? 1 : 0);
            for (j = 0; j < ns; j++) {
                var f = 0.2 + 0.66 * (j + 0.25 + 0.5 * rs()) / ns, s0 = f * P.dp.len;
                P.dp.at(s0, PT);
                var bx = PT.x, by = PT.y, ta = tanAt(P.dp, s0), side = (j % 2 ? 1 : -1) * (rs() < 0.25 ? -1 : 1);
                var sl = P.dp.len * (0.46 - 0.2 * f) * (0.72 + 0.5 * rs()), sp2 = null;
                for (tries = 0; tries < 7; tries++) {
                    var sa = ta + side * (0.42 + 0.42 * rs());
                    var cp = curve(bx, by, sa, sl, -side * (0.12 + 0.3 * rs()), 20, (rs() - 0.5) * 0.2);
                    if (inside(cp, G.rSpine + 3)) { sp2 = cp; break; }
                    sl *= 0.82; if (tries === 3) side = -side;
                }
                if (!sp2) continue;
                var sec = { path: sp2, s0: s0, tert: [] };
                if (!mob && rs() < 0.55) {
                    var nt = rs() < 0.4 ? 2 : 1;
                    for (var u = 0; u < nt; u++) {
                        var tf = 0.4 + 0.3 * u + 0.1 * rs(), ts = tf * sp2.len;
                        sp2.at(ts, PT);
                        var tside = (u % 2 ? 1 : -1) * side, tl = sp2.len * (0.3 + 0.12 * rs());
                        var tp = curve(PT.x, PT.y, tanAt(sp2, ts) + tside * (0.5 + 0.35 * rs()), tl, -tside * 0.25, 12, 0);
                        if (inside(tp, G.rSpine + 3)) { sec.tert.push(tp); terms.push(tp.x[tp.n - 1], tp.y[tp.n - 1], 0.55, P.k, 0.35); }
                    }
                }
                terms.push(sp2.x[sp2.n - 1], sp2.y[sp2.n - 1], 0.75, P.k, 0.45);
                P.sec.push(sec);
            }
            terms.push(P.dp.x[P.dp.n - 1], P.dp.y[P.dp.n - 1], 1.05, P.k, 0.6);
            if (P.act > 0.55 && glints.length < (mob ? 8 : 16)) glints.push(P.dp.x[P.dp.n - 1], P.dp.y[P.dp.n - 1], rs() * TAU, P.k);
            // full route core → dendrite tip (signals travel it)
            P.route = new Path(96);
            appendSeg(P.route, P.sp, 0, P.sp.len); appendSeg(P.route, P.cr, 0, P.cr.len); appendSeg(P.route, P.dp, 0, P.dp.len);
            P.hubS = P.sp.len; P.dpS = P.sp.len + P.cr.len;
        });
        termP = new Float32Array(terms); nTerm = terms.length / 5;
        glintP = new Float32Array(glints); nGlint = glints.length / 4;

        // ---- week twigs on the outer spine (active weeks only) ----
        twigs = new Array(W);
        for (k = 0; k < W; k++) {
            twigs[k] = null;
            if (!D || !weekTotal[k]) continue;
            var r2 = mulberry(hash("t" + dateMs[firstDay(k)]));
            var tw = Math.sqrt(weekTotal[k] / maxWeek), aw = ang(k);
            var tl2 = (0.02 + (mob ? 0.035 : 0.05) * tw) * R * (0.8 + 0.4 * r2());
            var tpp = curve(px(G.rSpine, aw), py(G.rSpine, aw), aw + (r2() - 0.5) * 0.3, tl2, (r2() - 0.5) * 0.7, 10, 0);
            twigs[k] = { path: tpp, t: tw };
        }

        // ---- core: dense layered particles + fine inner fibres ----
        var rc = mulberry(hash("stellar-core|nucleus")), cpts = [], nc = mob ? 140 : 260;
        for (i = 0; i < nc; i++) {
            var cr = Math.min(G.rCore, Math.abs(gauss(rc)) * 0.4 * G.rCore), ca = rc() * TAU;
            cpts.push(G.cx + Math.cos(ca) * cr * (1 + 0.1 * Math.cos(ca * 3 + 1)), G.cy + Math.sin(ca) * cr * 0.94, (1 - cr / G.rCore) * 0.85 + rc() * 0.15, rc() < 0.08 ? 1 : 0);
        }
        coreP = new Float32Array(cpts); nCore = nc;
        coreF = [];
        for (i = 0; i < (mob ? 5 : 9); i++) {
            var fa = rc() * TAU;
            coreF.push(curve(G.cx + Math.cos(fa) * G.rCore * 0.12, G.cy + Math.sin(fa) * G.rCore * 0.12, fa, G.rCore * (0.55 + 0.45 * rc()), (rc() - 0.5) * 1.3, 12, 0));
        }

        // ---- fine star-like particles along the dendrites + a sparse stellar field ----
        var st = [], r3 = mulberry(hash("stellar-core|stars"));
        function sprinkle(p, n, spread, pk) {
            for (var m = 0; m < n; m++) {
                var s = r3() * p.len; p.at(s, PT);
                var tg = tanAt(p, s), off = gauss(r3) * spread, x = PT.x - Math.sin(tg) * off, y = PT.y + Math.cos(tg) * off;
                if (x < 2 || x > w - 2 || y < 2 || y > h - 2) continue;
                var lr = r3();
                st.push(x, y, lr < 0.15 ? 2 : lr < 0.5 ? 1 : 0, r3() < 0.3 ? 1 : 0, r3() * TAU, pk);
            }
        }
        PR.forEach(function (P) {
            sprinkle(P.dp, Math.round(P.dp.len / (mob ? 10 : 6.5)), 3 * kk, P.k);
            P.sec.forEach(function (sc) { sprinkle(sc.path, Math.round(sc.path.len / (mob ? 14 : 9)), 2.2 * kk, P.k); });
        });
        for (i = 0; i < (mob ? 36 : 80); i++) {
            var ra = r3() * TAU, lim = reach(ra), rd = G.rSpine + 0.04 * R + r3() * Math.max(0, lim - G.rSpine - 0.04 * R);
            st.push(px(rd, ra), py(rd, ra), r3() < 0.1 ? 1 : 0, r3() < 0.25 ? 1 : 0, r3() * TAU, -1);
        }
        starP = new Float32Array(st); nStar = st.length / 6;

        if (!D) { satP = new Float32Array(0); nSat = 0; linkP = new Float32Array(0); nLink = 0; monthEdges = []; labels = []; return; }

        // ---- satellites around high days (seeded by date) ----
        var sat = [];
        for (i = 0; i < N; i++) {
            if (tiers[i] < 3) continue;
            var sr = mulberry(hash("s" + dateMs[i])), nsat = tiers[i] === 4 ? 3 : 2, sa2 = sr() * TAU;
            for (j = 0; j < nsat; j++) {
                sa2 += 1.6 + sr() * 1.4;
                var sd = dayRad[i] + (2.2 + 2.2 * sr()) * kk;
                sat.push(dayX[i] + Math.cos(sa2) * sd, dayY[i] + Math.sin(sa2) * sd, i, 0.45 + 0.35 * sr());
            }
        }
        satP = new Float32Array(sat); nSat = sat.length / 4;

        // ---- temporal links between consecutive active days ----
        var lk = [];
        for (i = 1; i < N; i++) {
            if (!counts[i] || !counts[i - 1]) continue;
            if (weekOf[i] === weekOf[i - 1]) lk.push(i, 1, 0, 0);
            else { var am = (ang(weekOf[i]) + ang(weekOf[i - 1])) / 2, rm = (trackR[6] + trackR[0]) / 2; lk.push(i, 0, px(rm, am), py(rm, am)); }
        }
        linkP = new Float32Array(lk); nLink = lk.length / 4;

        // ---- stepped month boundaries + labels inside the field ----
        monthEdges = []; labels = [];
        var hs = G.step / 2;
        for (var m = 1; m < months.length; m++) {
            var fi = months[m].first, fw = weekOf[fi], fk = wdOf[fi], e = new Path(16);
            var rI = G.rIn - hs, rO = G.rOut + hs;
            if (fk === 0) { e.push(px(rI, edge(fw)), py(rI, edge(fw))); e.push(px(rO, edge(fw)), py(rO, edge(fw))); }
            else {
                var rb = (trackR[fk - 1] + trackR[fk]) / 2, e1 = edge(fw + 1), e0 = edge(fw);
                e.push(px(rI, e1), py(rI, e1)); e.push(px(rb, e1), py(rb, e1));
                for (var s9 = 1; s9 <= 8; s9++) { var aa = e1 + (e0 - e1) * (s9 / 8); e.push(px(rb, aa), py(rb, aa)); }
                e.push(px(rO, e0), py(rO, e0));
            }
            monthEdges.push({ p: e, m: m });
        }
        months.forEach(function (mo, mi) {
            if (mo.last - mo.first < 6) return;
            var am2 = (ang(weekOf[mo.first]) + ang(weekOf[mo.last])) / 2;
            PR.forEach(function (P) { // keep the label clear of a spoke arriving at the hub
                var da = am2 - P.a, room = (mob ? 15 : 20) / G.rLabel;
                if (Math.abs(da) < room) am2 = P.a + (da >= 0 ? room : -room);
            });
            labels.push({ m: mi, t: MONTHS[mo.m].toUpperCase(), x: px(G.rLabel, am2), y: py(G.rLabel, am2) });
        });
    }

    function dendNames(m) {
        var ks = [];
        PR.forEach(function (P) { if (P.months && P.months[m]) ks.push(ROMAN[P.k]); });
        return ks.length > 1 ? "Dendrites " + ks[0] + "–" + ks[ks.length - 1] : "Dendrite " + (ks[0] || "I");
    }

    /* =========================================================
       BASE LAYER (static structure, redrawn only when focus changes)
       ========================================================= */

    var baseA = document.createElement("canvas"), baseB = document.createElement("canvas");
    var baseCur = baseA, basePrev = baseB, fade = 1, baseKey = "";
    var focus = { month: -1 };
    var DIM = 0.24;

    var revealM = -1; // playback / scrub: months after this one are not revealed yet
    function lit(m) { return (focus.month < 0 || m === focus.month) && (revealM < 0 || m <= revealM); }
    function anyDim() { return focus.month >= 0 || revealM >= 0; }
    function mf(m) { return lit(m) ? 1 : DIM; }
    function prf(k) { // primary dendrite under month focus / playback reveal
        var P = PR[k];
        if (!P || !D || !P.months) return 1;
        if (focus.month >= 0) return P.months[focus.month] ? 1 : DIM * 1.3;
        if (revealM >= 0) return P.firstM <= revealM ? 1 : DIM * 1.3;
        return 1;
    }

    function taper(c, p, w0, w1) {
        var n = p.n, i, a, b, dx, dy, d, wd;
        if (n < 2) return;
        c.beginPath();
        for (i = 0; i < n; i++) {
            a = Math.max(0, i - 1); b = Math.min(n - 1, i + 1); dx = p.x[b] - p.x[a]; dy = p.y[b] - p.y[a]; d = Math.hypot(dx, dy) || 1;
            wd = (w0 + (w1 - w0) * Math.pow(p.l[i] / p.len, 0.75)) * 0.5;
            if (i === 0) c.moveTo(p.x[i] - dy / d * wd, p.y[i] + dx / d * wd); else c.lineTo(p.x[i] - dy / d * wd, p.y[i] + dx / d * wd);
        }
        for (i = n - 1; i >= 0; i--) {
            a = Math.max(0, i - 1); b = Math.min(n - 1, i + 1); dx = p.x[b] - p.x[a]; dy = p.y[b] - p.y[a]; d = Math.hypot(dx, dy) || 1;
            wd = (w0 + (w1 - w0) * Math.pow(p.l[i] / p.len, 0.75)) * 0.5;
            c.lineTo(p.x[i] + dy / d * wd, p.y[i] - dx / d * wd);
        }
        c.closePath(); c.fill();
    }
    function strokeAll(c, p) { strokeTo(c, p, p.len + 1); }
    function strokeSeg(c, p, s0, s1) {
        var i0 = p.index(s0), i1 = p.index(s1);
        p.at(s0, PT); c.moveTo(PT.x, PT.y);
        for (var i = i0 + 1; i <= i1; i++) c.lineTo(p.x[i], p.y[i]);
        p.at(s1, PT); c.lineTo(PT.x, PT.y);
    }

    var LCOL = ["#555555", "#888888", "#d9d9d9"], LALP = [0.32, 0.45, 0.6], LSZ = [0.7, 0.95, 1.25];

    function drawBase(cv) {
        var c = cv.getContext("2d"), kk = G.kk, i, k, t;
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        c.clearRect(0, 0, G.w, G.h);
        c.lineCap = "round"; c.lineJoin = "round";

        // guide rings: inner hub and outer spine
        c.lineWidth = 1; c.strokeStyle = "#252525";
        c.globalAlpha = 0.9; c.beginPath(); c.arc(G.cx, G.cy, G.rSpine, G.a0, G.a0 + G.sweep); c.stroke();
        c.globalAlpha = 0.7; c.beginPath(); c.arc(G.cx, G.cy, G.rHub, G.a0, G.a0 + G.sweep); c.stroke();
        // start / today ticks
        c.globalAlpha = 1; c.strokeStyle = "#555555";
        c.beginPath(); c.moveTo(px(G.rHub, G.a0), py(G.rHub, G.a0)); c.lineTo(px(G.rSpine + 5, G.a0), py(G.rSpine + 5, G.a0)); c.stroke();
        var ae = G.a0 + G.sweep;
        c.strokeStyle = "#a3a3a3";
        c.beginPath(); c.moveTo(px(G.rHub, ae), py(G.rHub, ae)); c.lineTo(px(G.rSpine + 7, ae), py(G.rSpine + 7, ae)); c.stroke();
        // weekday letters in the gap
        c.font = font; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#555555";
        var letters = "SMTWTFS";
        for (t = 0; t < 7; t++) c.fillText(letters[t], G.cx, G.cy - trackR[t]);

        if (!D) {
            c.strokeStyle = "#252525"; c.globalAlpha = 0.5;
            for (t = 0; t < 7; t++) { c.beginPath(); c.arc(G.cx, G.cy, trackR[t], G.a0, G.a0 + G.sweep); c.stroke(); }
        } else {
            // month boundaries
            c.lineWidth = 0.75;
            for (i = 0; i < monthEdges.length; i++) {
                var me = monthEdges[i], fo = focus.month >= 0 && (focus.month === me.m || focus.month === me.m - 1);
                c.strokeStyle = fo ? "#555555" : "#252525"; c.globalAlpha = fo ? 1 : 0.8;
                c.beginPath(); strokeAll(c, me.p); c.stroke();
            }
        }

        // primary dendrites: spoke (thick at the core) → crossing hairline → tapered dendrite
        PR.forEach(function (P) {
            var f = D ? prf(P.k) : 0.45, act = P.act;
            c.fillStyle = "#888888"; c.globalAlpha = (0.3 + 0.25 * act) * f;
            taper(c, P.sp, (1.4 + 0.7 * act) * kk, (0.55 + 0.25 * act) * kk);
            // crossing between week columns: a beaded line, distinct from month boundaries
            c.fillStyle = "#888888"; c.globalAlpha = 0.55 * f; c.beginPath();
            for (var bs = 2.5 * kk; bs < P.cr.len; bs += 5 * kk) { P.cr.at(bs, PT); c.moveTo(PT.x + 0.6 * kk, PT.y); c.arc(PT.x, PT.y, 0.6 * kk, 0, TAU); }
            c.fill();
            c.fillStyle = "#a3a3a3"; c.globalAlpha = (0.32 + 0.4 * act) * f;
            taper(c, P.dp, (1.5 + 1.1 * act) * kk, 0.22 * kk);
            for (var j = 0; j < P.sec.length; j++) {
                var sc = P.sec[j];
                c.fillStyle = "#888888"; c.globalAlpha = (0.28 + 0.34 * act) * f;
                taper(c, sc.path, (0.8 + 0.45 * act) * kk, 0.16 * kk);
                c.globalAlpha = (0.2 + 0.2 * act) * f;
                for (var u = 0; u < sc.tert.length; u++) taper(c, sc.tert[u], 0.5 * kk, 0.12 * kk);
            }
            // luminous core line along the main dendrite
            c.strokeStyle = "#d9d9d9"; c.lineWidth = 0.45 * kk; c.globalAlpha = 0.22 * act * f;
            c.beginPath(); strokeAll(c, P.dp); c.stroke();
        });

        if (D) {
            // week twigs on the spine
            for (k = 0; k < G.W; k++) {
                var tw = twigs[k];
                if (!tw) continue;
                var wf = mf(monthOf[clamp(k * 7 + 3 - G.WD0, 0, N - 1)]);
                c.strokeStyle = "#888888"; c.globalAlpha = (0.22 + 0.4 * tw.t) * wf; c.lineWidth = (0.45 + 0.55 * tw.t) * kk;
                c.beginPath(); strokeAll(c, tw.path); c.stroke();
                c.fillStyle = "#d9d9d9"; c.globalAlpha = (0.3 + 0.35 * tw.t) * wf;
                c.beginPath(); c.arc(tw.path.x[tw.path.n - 1], tw.path.y[tw.path.n - 1], (0.55 + 0.45 * tw.t) * kk, 0, TAU); c.fill();
            }
        }

        // synaptic terminals
        c.fillStyle = "#d9d9d9";
        for (i = 0; i < nTerm; i++) {
            var o = i * 5, f2 = D ? prf(termP[o + 3]) : 0.45;
            c.globalAlpha = termP[o + 4] * f2;
            c.beginPath(); c.arc(termP[o], termP[o + 1], termP[o + 2] * kk, 0, TAU); c.fill();
        }

        // static star particles (drifting ones are drawn per frame)
        for (var lay = 0; lay < 3; lay++) {
            for (var pass = 0; pass < 2; pass++) {
                if (pass && !anyDim()) break;
                c.fillStyle = LCOL[lay]; c.beginPath();
                for (i = 0; i < nStar; i++) {
                    var s6 = i * 6;
                    if (starP[s6 + 2] !== lay || (starP[s6 + 3] && !reduce)) continue;
                    var on = starP[s6 + 5] < 0 || prf(starP[s6 + 5]) >= 1;
                    if (on === !!pass) continue;
                    c.rect(starP[s6], starP[s6 + 1], LSZ[lay] * kk, LSZ[lay] * kk);
                }
                c.globalAlpha = LALP[lay] * (pass ? DIM : 1); c.fill();
            }
        }

        // central core: faint inner fibres, small highlight, layered particles
        c.strokeStyle = "#888888"; c.lineWidth = 0.45 * kk; c.globalAlpha = D ? 0.3 : 0.18;
        c.beginPath(); for (i = 0; i < coreF.length; i++) strokeAll(c, coreF[i]); c.stroke();
        glow(c, G.cx, G.cy, G.rCore * 1.4, D ? 0.11 : 0.05);
        var SC = ["#555555", "#888888", "#d9d9d9", "#ffffff"], SA = [0.5, 0.6, 0.7, 0.8];
        for (var band = 0; band < 4; band++) {
            c.fillStyle = SC[band]; c.beginPath();
            for (i = 0; i < nCore; i++) {
                var c4 = i * 4, bb = coreP[c4 + 2], bi = bb < 0.3 ? 0 : bb < 0.55 ? 1 : bb < 0.8 ? 2 : 3;
                if (bi !== band) continue;
                var sz = (coreP[c4 + 3] ? 1.3 : 0.8) * kk;
                c.rect(coreP[c4] - sz / 2, coreP[c4 + 1] - sz / 2, sz, sz);
            }
            c.globalAlpha = SA[band] * (D ? 1 : 0.55); c.fill();
        }

        // month labels inside the field
        if (D) {
            c.font = font; c.textAlign = "center"; c.textBaseline = "middle"; c.globalAlpha = 1;
            labels.forEach(function (lb) {
                c.fillStyle = focus.month === lb.m ? "#ffffff" : !lit(lb.m) ? "#252525" : revealM === lb.m ? "#a3a3a3" : "#555555";
                c.fillText(lb.t, lb.x, lb.y);
            });
        }
        c.globalAlpha = 1;
    }

    function refreshBase(force) {
        var key = (D ? D.fetchedAt + N : "none") + "|" + focus.month + "|" + revealM + "|" + G.w + "x" + G.h + "|" + reduce;
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

    var SIG = [], FLR = [], DLY = [];
    for (var si = 0; si < 12; si++) SIG.push({ on: false, path: null, s: 0, end: 0, v: 0, trail: 0, a: 1, kind: 0, marks: null, mi: 0, day: -1, strong: 0, tx: 0, ty: 0, tip: false });
    for (var fi = 0; fi < 48; fi++) FLR.push({ on: false, x: 0, y: 0, t: 0, dur: 0, size: 0, a: 0, ring: false });
    for (var di = 0; di < 24; di++) DLY.push({ on: false, day: 0, at: 0, s: 0 });
    var nextAmbient = 0;

    function spawn(path, v, kind, a) {
        for (var i = 0; i < SIG.length; i++) if (!SIG[i].on) {
            var g = SIG[i];
            g.on = true; g.path = path; g.s = 0; g.end = path.len; g.v = v; g.kind = kind;
            g.trail = 0.08 * Math.min(G.w, G.h); g.a = a || 1; g.marks = null; g.mi = 0; g.day = -1; g.strong = 0; g.tip = false;
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
        flare(dayX[i], dayY[i], (8 + 4.5 * tr) * G.kk * (0.75 + 0.5 * strength), Math.min(0.62, (0.22 + 0.1 * tr) * strength), 0.8 + 0.18 * tr, tr >= 3 && strength >= 0.9);
    }
    function delayFlare(i, ms, s) {
        for (var k = 0; k < DLY.length; k++) if (!DLY[k].on) { var q = DLY[k]; q.on = true; q.day = i; q.at = performance.now() + ms; q.s = s; return; }
    }

    /* route along the real structure: core → spoke → hub ring → the day's week column → the day */
    function routeTo(i) {
        var P = PR[weekPr[weekOf[i]]], p = new Path(160);
        appendSeg(p, P.sp, 0, P.sp.len);
        var a1 = P.a, a2 = ang(weekOf[i]), n = Math.max(2, Math.ceil(Math.abs(a2 - a1) * G.rHub / 4));
        for (var q = 1; q <= n; q++) { var aa = a1 + (a2 - a1) * q / n; p.push(px(G.rHub, aa), py(G.rHub, aa)); }
        p.push(dayX[i], dayY[i]);
        return p;
    }
    /* core → dendrite, optionally turning into one of its secondary branches */
    function dendRoute(k, secIdx) {
        var P = PR[k];
        if (secIdx < 0 || !P.sec[secIdx]) return P.route;
        var sc = P.sec[secIdx], p = new Path(140);
        appendSeg(p, P.route, 0, P.dpS + sc.s0); appendSeg(p, sc.path, 0, sc.path.len);
        return p;
    }
    function monthTour(m) {
        var mo = months[m], p = routeTo(mo.first), mk = { s: [p.len], d: [mo.first] };
        for (var d = mo.first + 1; d <= mo.last; d++) { p.push(dayX[d], dayY[d]); mk.s.push(p.len); mk.d.push(d); }
        return { p: p, mk: mk };
    }

    function ambient(now) {
        if (!D || reduce || pb.playing || now < nextAmbient) return;
        // irregular: mostly 3–8 s apart, now and then a quick second pulse
        nextAmbient = now + (Math.random() < 0.18 ? 600 + Math.random() * 800 : 3000 + Math.random() * 5000);
        var live = 0, i;
        for (i = 0; i < SIG.length; i++) if (SIG[i].on && SIG[i].kind === 0) live++;
        if (live >= 2) return;
        var tot = 0; for (i = 0; i < N; i++) tot += counts[i];
        if (!tot) return;
        var g;
        if (Math.random() < 0.45) { // out along a dendrite, weighted by its activity
            var wsum = 0; PR.forEach(function (P) { wsum += 0.15 + P.act; });
            var r = Math.random() * wsum, k = 0;
            for (k = 0; k < PR.length; k++) { r -= 0.15 + PR[k].act; if (r <= 0) break; }
            k = Math.min(k, PR.length - 1);
            var P = PR[k], sx = Math.random() < 0.55 && P.sec.length ? Math.floor(Math.random() * P.sec.length) : -1, path = dendRoute(k, sx);
            g = spawn(path, 0.22 * Math.min(G.w, G.h), 0, 0.65);
            if (g) { g.tip = true; g.tx = path.x[path.n - 1]; g.ty = path.y[path.n - 1]; }
            return;
        }
        // or to a day, weighted by its real count
        var rr = Math.random() * tot, pick = N - 1;
        for (i = 0; i < N; i++) { rr -= counts[i]; if (rr <= 0) { pick = i; break; } }
        g = spawn(routeTo(pick), 0.24 * Math.min(G.w, G.h), 0, 0.7);
        if (g) g.day = pick;
    }

    /* selected day: signal from the core to the day, then its streak answers */
    function trace(i) {
        if (!D) return;
        if (reduce) {
            staticTrace = routeTo(i); flareDay(i, 1.1);
            clearTimeout(staticTimer);
            staticTimer = setTimeout(function () { staticTrace = null; requestDraw(); }, 2600);
            requestDraw(); return;
        }
        var g = spawn(routeTo(i), 0.4 * Math.min(G.w, G.h), 2, 1);
        if (g) { g.day = i; g.strong = 1; }
        wake();
    }
    var staticTrace = null, staticTimer = 0;
    function streakRipple(i) {
        var st = streakOf[i];
        if (st < 0) return;
        var S2 = streaks[st], n = 0;
        for (var d = i + 1; d <= S2.end && n < 12; d++, n++) delayFlare(d, 110 * (n + 1), 0.75);
        for (d = i - 1, n = 0; d >= S2.start && n < 12; d--, n++) delayFlare(d, 110 * (n + 1), 0.6);
    }
    /* week selected: a pulse out along its dendrite */
    function pulseWeek(w) {
        if (!D) return;
        if (reduce) { var tw = twigs[w]; if (tw) flare(tw.path.x[tw.path.n - 1], tw.path.y[tw.path.n - 1], 14 * G.kk, 0.5, 1); requestDraw(); return; }
        var P = PR[weekPr[w]], g = spawn(P.route, 0.36 * Math.min(G.w, G.h), 5, 0.9);
        if (g) { g.tip = true; g.tx = P.dp.x[P.dp.n - 1]; g.ty = P.dp.y[P.dp.n - 1]; g.strong = 1; }
        wake();
    }

    /* month selected: one controlled signal through all of its daily nodes */
    function tourMonth(m) {
        if (!D || reduce) return;
        for (var i = 0; i < SIG.length; i++) if (SIG[i].on && SIG[i].kind === 1) SIG[i].on = false;
        var t = monthTour(m), g = spawn(t.p, 0.5 * Math.min(G.w, G.h), 1, 1);
        if (g) { g.marks = t.mk; g.strong = 1; }
        wake();
    }

    /* new activity after a refresh — fires once per changed record */
    var pendingNew = [];
    function fireNew() {
        if (!pendingNew.length || !inView || document.hidden || !D) return;
        var list = pendingNew.splice(0, 3);
        list.forEach(function (i, n) {
            setTimeout(function () {
                if (reduce) { flareDay(i, 1.3); requestDraw(); return; }
                var g = spawn(routeTo(i), 0.32 * Math.min(G.w, G.h), 3, 1);
                if (g) { g.day = i; g.strong = 1; }
                wake();
            }, 400 + n * 1100);
        });
    }

    /* =========================================================
       YEAR IN MOTION — playback state
       ========================================================= */

    var pb = { t: 0, playing: false, lastD: -1, lastM: -1, lastK: -1, timer: 0, scrub: false };
    var HEAD = { x: 0, y: 0 };
    var HT = new Float32Array(48), htN = 0, htI = 0; // head trail ring buffer (24 points)

    function headPos(t, out) { // the head moves through the field in date order
        var d = Math.floor(t), f = t - d;
        if (d >= N - 1) { d = N - 1; f = 0; }
        var e = f * f * (3 - 2 * f), d2 = Math.min(N - 1, d + 1);
        out.x = dayX[d] + (dayX[d2] - dayX[d]) * e; out.y = dayY[d] + (dayY[d2] - dayY[d]) * e;
        return out;
    }

    function revealUpTo(d, flares) {
        for (var x = pb.lastD + 1; x <= d; x++) {
            if (flares && counts[x] > 0) flareDay(x, 0.85);
            pb.lastM = monthOf[x];
            var k = weekPr[weekOf[x]];
            if (k !== pb.lastK) {
                pb.lastK = k;
                if (flares && !reduce) { // conduction: core → the dendrite that owns these weeks
                    var g = spawn(PR[k].route, 0.75 * Math.min(G.w, G.h), 4, 0.6);
                    if (g) { g.tip = true; g.tx = PR[k].dp.x[PR[k].dp.n - 1]; g.ty = PR[k].dp.y[PR[k].dp.n - 1]; }
                }
            }
        }
        pb.lastD = d;
    }

    function play() {
        if (!D) return;
        if (pb.t >= N - 1) { pb.t = 0; pb.lastD = -1; pb.lastM = -1; pb.lastK = -1; }
        pb.playing = true; pb.scrub = false; htN = 0;
        sel.day = -1; sel.month = -1; sel.week = -1; hover.day = hover.month = hover.week = -1;
        applyFocus(); refreshTip();
        playUI();
        announce("Playing the year from " + fmtLong.format(new Date(dateMs[Math.floor(pb.t)])) + ".");
        if (reduce) stepReduced(); else { last = performance.now(); wake(); }
    }
    function pause(silent) {
        if (!pb.playing) return;
        pb.playing = false; clearTimeout(pb.timer);
        playUI(); readout(); requestDraw();
        if (!silent) announce("Playback paused on " + fmtLong.format(new Date(dateMs[Math.floor(pb.t)])) + ".");
    }
    function finish() {
        pb.playing = false; pb.t = N - 1; revealUpTo(N - 1, !reduce);
        playUI(); readout(); requestDraw();
        announce("Playback complete: " + plural(D.totals.contributions, "contribution") + " across " + plural(D.totals.activeDays, "active day") + ".");
    }
    function stepReduced() { // reduced motion: discrete month-by-month reveal, no travelling light
        clearTimeout(pb.timer);
        if (!pb.playing) return;
        var d = Math.floor(pb.t), m = monthOf[d];
        var target = pb.lastD < 0 ? months[m].last : (m + 1 < months.length ? months[m + 1].last : N - 1);
        pb.t = target; revealUpTo(target, false); readout(); requestDraw();
        if (target >= N - 1) { finish(); return; }
        pb.timer = setTimeout(stepReduced, 1100);
    }
    function scrubTo(d) {
        pause(true);
        pb.t = d; pb.lastD = d; pb.lastM = monthOf[d]; pb.lastK = weekPr[weekOf[d]]; pb.scrub = true;
        sel.month = -1; sel.day = -1; sel.week = -1; applyFocus(); refreshTip();
        readout(); requestDraw();
    }

    function playUI() {
        el.play.setAttribute("data-playing", pb.playing ? "true" : "false");
        el.play.setAttribute("aria-label", pb.playing ? "Pause playback" : pb.t >= N - 1 ? "Play the year from the start" : "Resume playback");
        root.toggleAttribute("data-playing", pb.playing);
    }

    /* =========================================================
       FRAME
       ========================================================= */

    var inView = false, raf = 0, last = 0, drawQueued = false, lastPaint = 0;
    var hover = { day: -1, month: -1, week: -1 }, sel = { day: -1, month: -1, week: -1 };
    var focusAmt = 1, routeCache = { day: -1, p: null };

    function wake() {
        if (raf || !inView || document.hidden) return;
        last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    function requestDraw() {
        if (raf || drawQueued) return;
        drawQueued = true;
        requestAnimationFrame(function () { drawQueued = false; if (!raf) render(0, performance.now()); });
    }
    function frame(now) {
        raf = 0;
        var dt = clamp((now - last) / 1000, 0, 0.05); // rAF timestamps can precede the last performance.now()
        var active = busy();
        // only fine drift left → ~30 fps is plenty
        if (active || now - lastPaint > 31) { last = now; lastPaint = now; render(dt, now); }
        // render() may already have queued the next frame (wake via refreshBase): never run two loops
        if (!raf && inView && !document.hidden && (active || (!reduce && D))) raf = requestAnimationFrame(frame);
    }
    function busy() {
        if (fade < 1 || pb.playing || focusAmt < 1) return true;
        for (var i = 0; i < SIG.length; i++) if (SIG[i].on) return true;
        for (i = 0; i < FLR.length; i++) if (FLR[i].on) return true;
        for (i = 0; i < DLY.length; i++) if (DLY[i].on) return true;
        return false;
    }

    function render(dt, now) {
        var c = ctx, kk = G.kk, i, j, g, time = now / 1000;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        c.clearRect(0, 0, canvas.width, canvas.height);
        if (fade < 1) {
            fade = Math.min(1, fade + dt / 0.3);
            var e = fade * fade * (3 - 2 * fade);
            c.globalAlpha = 1 - e; c.drawImage(basePrev, 0, 0);
            c.globalAlpha = e; c.drawImage(baseCur, 0, 0);
        } else c.drawImage(baseCur, 0, 0);
        c.globalAlpha = 1;
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        c.lineCap = "round"; c.lineJoin = "round";

        if (!reduce) {
            // drifting star particles (tiny amplitude, per-particle phase)
            var amp = 0.8 * kk;
            for (var lay = 0; lay < 3; lay++) {
                c.fillStyle = LCOL[lay]; c.beginPath();
                for (i = 0; i < nStar; i++) {
                    var s6 = i * 6;
                    if (!starP[s6 + 3] || starP[s6 + 2] !== lay) continue;
                    if (starP[s6 + 5] >= 0 && prf(starP[s6 + 5]) < 1) continue;
                    var ph = starP[s6 + 4];
                    c.rect(starP[s6] + Math.sin(time * 0.33 + ph) * amp, starP[s6 + 1] + Math.cos(time * 0.27 + ph * 1.7) * amp, LSZ[lay] * kk, LSZ[lay] * kk);
                }
                c.globalAlpha = LALP[lay]; c.fill();
            }
            // the core breathes very slightly
            glow(c, G.cx, G.cy, G.rCore * (1.15 + 0.06 * Math.sin(time * 0.7)), D ? 0.05 + 0.02 * Math.sin(time * 0.7) : 0.02);
        }
        // star glints at the brightest dendrite tips (slow twinkle; static under reduced motion)
        c.strokeStyle = "#ffffff"; c.lineWidth = 0.6 * kk;
        for (i = 0; i < nGlint; i++) {
            var o4 = i * 4, gl = 3.2 * kk, ga = reduce ? 0.4 : 0.3 + 0.22 * Math.sin(time * 0.9 + glintP[o4 + 2]);
            if (D && prf(glintP[o4 + 3]) < 1) ga *= DIM;
            c.globalAlpha = ga; c.beginPath();
            c.moveTo(glintP[o4] - gl, glintP[o4 + 1]); c.lineTo(glintP[o4] + gl, glintP[o4 + 1]);
            c.moveTo(glintP[o4], glintP[o4 + 1] - gl); c.lineTo(glintP[o4], glintP[o4 + 1] + gl);
            c.stroke();
        }
        if (!D) return;

        if (!reduce && dt) ambient(now);

        // playback progress
        if (pb.playing && !reduce && dt) {
            pb.t = clamp(pb.t + dt * PLAY_RATE, 0, N - 1);
            var dNow = Math.floor(pb.t);
            if (dNow !== pb.lastD) { revealUpTo(dNow, true); readout(); }
            if (pb.t >= N - 1) finish();
        }
        var rv = Math.floor(pb.t), revealing = rv < N - 1;
        var rmNow = revealing ? monthOf[rv] : -1;
        if (rmNow !== revealM) { revealM = rmNow; refreshBase(false); }

        var fm = focus.month, P;
        if (fm >= 0 && months[fm]) {
            // selected month: its circular region and dendrites illuminate, easing in
            if (focusAmt < 1) focusAmt = reduce ? 1 : Math.min(1, focusAmt + (dt || 0.016) / 0.9);
            var grow = 1 - Math.pow(1 - focusAmt, 2.2), mo = months[fm];
            var e0 = edge(weekOf[mo.first]), e1 = edge(weekOf[mo.last] + 1), ea = e0 + (e1 - e0) * grow;
            c.fillStyle = "#ffffff"; c.globalAlpha = 0.04 * grow; c.beginPath();
            c.arc(G.cx, G.cy, G.rOut + G.step * 0.55, e0, ea); c.arc(G.cx, G.cy, G.rIn - G.step * 0.55, ea, e0, true); c.closePath(); c.fill();
            c.strokeStyle = "#ffffff"; c.lineWidth = 1.4 * kk;
            c.globalAlpha = 0.75; c.beginPath(); c.arc(G.cx, G.cy, G.rSpine, e0, ea); c.stroke();
            c.globalAlpha = 0.45; c.beginPath(); c.arc(G.cx, G.cy, G.rHub, e0, ea); c.stroke();
            c.lineWidth = 0.9 * kk; c.globalAlpha = 0.5; c.beginPath();
            for (j = 0; j < PR.length; j++) if (PR[j].months[fm]) strokeTo(c, PR[j].route, PR[j].route.len * grow);
            c.stroke();
        } else if (pb.playing || revealing) {
            // playback: the dendrite owning the current weeks responds softly, the month arc grows
            P = PR[weekPr[weekOf[rv]]];
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.3; c.lineWidth = 1 * kk;
            c.beginPath(); strokeAll(c, P.route); for (j = 0; j < P.sec.length; j++) strokeAll(c, P.sec[j].path); c.stroke();
            var m0 = months[monthOf[rv]];
            c.globalAlpha = 0.55; c.lineWidth = 1.2 * kk; c.beginPath();
            c.arc(G.cx, G.cy, G.rSpine, edge(weekOf[m0.first]), Math.max(edge(weekOf[m0.first]) + 0.002, ang(weekOf[rv]))); c.stroke();
        }

        // week hover / selection: its twig, its column, its dendrite
        var hw = hover.week >= 0 ? hover.week : sel.week;
        if (hw >= 0) {
            P = PR[weekPr[hw]];
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.4; c.lineWidth = 0.9 * kk;
            c.beginPath(); strokeAll(c, P.route); c.stroke();
            if (twigs[hw]) { c.globalAlpha = 0.95; c.lineWidth = 1.3 * kk; c.beginPath(); strokeAll(c, twigs[hw].path); c.stroke(); }
            c.globalAlpha = 0.55; c.lineWidth = 0.8; c.beginPath();
            for (i = Math.max(0, hw * 7 - G.WD0); i <= Math.min(N - 1, hw * 7 + 6 - G.WD0); i++) {
                if (i > rv) continue;
                c.moveTo(dayX[i] + dayRad[i] + 2.4 * kk, dayY[i]); c.arc(dayX[i], dayY[i], dayRad[i] + 2.4 * kk, 0, TAU);
            }
            c.stroke();
        }

        // temporal connections between consecutive active days
        c.strokeStyle = "#d9d9d9"; c.lineWidth = 0.6 * kk;
        for (var pass = 0; pass < 2; pass++) {
            c.globalAlpha = pass ? 0.1 : 0.3; c.beginPath();
            for (i = 0; i < nLink; i++) {
                var o = i * 4, b = linkP[o], sm = linkP[o + 1];
                if ((sm === 1) === !!pass || b > rv) continue;
                if (fm >= 0 && monthOf[b] !== fm && monthOf[b - 1] !== fm) continue;
                c.moveTo(dayX[b - 1], dayY[b - 1]);
                if (sm) c.lineTo(dayX[b], dayY[b]); else c.quadraticCurveTo(linkP[o + 2], linkP[o + 3], dayX[b], dayY[b]);
            }
            c.stroke();
        }

        // day particles: dark collar (depth), body per tier, soft specular core
        c.fillStyle = "#050505"; c.globalAlpha = 0.85; c.beginPath();
        for (i = 0; i <= rv; i++) { if (!tiers[i]) continue; var cr = dayRad[i] + 1.2 * kk; c.moveTo(dayX[i] + cr, dayY[i]); c.arc(dayX[i], dayY[i], cr, 0, TAU); }
        c.fill();
        var FILL = ["#555555", "#888888", "#a3a3a3", "#d9d9d9", "#ffffff"], ALPHA = [0.9, 0.9, 0.95, 1, 1];
        for (var tier = 0; tier < 5; tier++) {
            for (var on = 1; on >= 0; on--) {
                if (!on && fm < 0) continue;
                c.fillStyle = FILL[tier]; c.globalAlpha = ALPHA[tier] * (on ? 1 : tier ? 0.22 : 0.4);
                c.beginPath();
                for (i = 0; i <= rv; i++) {
                    if (tiers[i] !== tier || (fm >= 0 && (monthOf[i] === fm) !== !!on)) continue;
                    c.moveTo(dayX[i] + dayRad[i], dayY[i]); c.arc(dayX[i], dayY[i], dayRad[i], 0, TAU);
                }
                c.fill();
            }
        }
        c.fillStyle = "#ffffff";
        for (var ring = 0; ring < 2; ring++) {
            c.globalAlpha = ring ? 0.7 : 0.3; c.beginPath();
            for (i = 0; i <= rv; i++) {
                if (tiers[i] < 2 || (fm >= 0 && monthOf[i] !== fm)) continue;
                var r2 = dayRad[i] * (ring ? 0.42 : 0.72);
                c.moveTo(dayX[i] + r2, dayY[i]); c.arc(dayX[i], dayY[i], r2, 0, TAU);
            }
            c.fill();
        }
        if (revealing) { // not reached yet: faint graphite seeds
            c.fillStyle = "#252525"; c.globalAlpha = 1; c.beginPath();
            for (i = rv + 1; i < N; i++) { var rr = 0.85 * kk; c.moveTo(dayX[i] + rr, dayY[i]); c.arc(dayX[i], dayY[i], rr, 0, TAU); }
            c.fill();
        }
        // satellites (small synaptic details scaled by the day's count)
        c.fillStyle = "#d9d9d9"; c.beginPath();
        for (i = 0; i < nSat; i++) {
            var s4 = i * 4, sd = satP[s4 + 2], ss = 0.75 * kk * satP[s4 + 3] * 1.5;
            if (sd > rv || (fm >= 0 && monthOf[sd] !== fm)) continue;
            c.rect(satP[s4] - ss / 2, satP[s4 + 1] - ss / 2, ss, ss);
        }
        c.globalAlpha = 0.5; c.fill();
        // restrained glow: subtle for high, a small halo for exceptional
        for (i = 0; i <= rv; i++) {
            if (tiers[i] < 3) continue;
            var gf = fm < 0 || monthOf[i] === fm ? 1 : 0.2;
            if (tiers[i] === 4) glow(c, dayX[i], dayY[i], 13 * kk, 0.32 * gf);
            else glow(c, dayX[i], dayY[i], 8 * kk, 0.14 * gf);
        }

        // hovered / selected / scrubbed day: its route from the core, its dendrite, ring, glow
        var hd = hover.day >= 0 ? hover.day : sel.day;
        if (hd < 0 && pb.scrub && !pb.playing && fm < 0 && hw < 0) hd = rv;
        if (hd >= 0) {
            if (routeCache.day !== hd) { routeCache.day = hd; routeCache.p = routeTo(hd); }
            P = PR[weekPr[weekOf[hd]]];
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.3; c.lineWidth = 0.8 * kk;
            c.beginPath(); strokeSeg(c, P.route, P.hubS, P.route.len); c.stroke();
            c.globalAlpha = 0.8; c.lineWidth = 1.05 * kk;
            c.beginPath(); strokeAll(c, routeCache.p); c.stroke();
            if (twigs[weekOf[hd]]) { c.globalAlpha = 0.6; c.beginPath(); strokeAll(c, twigs[weekOf[hd]].path); c.stroke(); }
            c.globalAlpha = 1; c.lineWidth = 1;
            c.beginPath(); c.arc(dayX[hd], dayY[hd], dayRad[hd] + 3.6 * kk, 0, TAU); c.stroke();
            glow(c, dayX[hd], dayY[hd], 13 * kk, 0.42);
        }
        if (staticTrace) { c.strokeStyle = "#ffffff"; c.globalAlpha = 0.9; c.lineWidth = 1.3 * kk; c.beginPath(); strokeAll(c, staticTrace); c.stroke(); }

        // signals
        for (i = 0; i < SIG.length; i++) {
            g = SIG[i];
            if (!g.on) continue;
            g.s += g.v * dt;
            if (g.marks) while (g.mi < g.marks.s.length && g.s >= g.marks.s[g.mi]) { var md = g.marks.d[g.mi]; if (counts[md]) flareDay(md, 0.95); g.mi++; }
            var done = g.s >= g.end;
            if (done) g.s = g.end;
            var env = Math.min(1, g.s / (0.06 * g.path.len + 1) + 0.25);
            drawTrail(c, g.path, g.s, g.trail, 0.75 * g.a * env, (g.kind === 2 ? 1.2 : 0.9) * kk);
            sparks(c, g.path, g.s, g.trail, g.a * env, now, i);
            g.path.at(g.s, PT);
            glow(c, PT.x, PT.y, (g.kind === 2 ? 12 : 10) * kk, 0.8 * g.a * env);
            c.globalAlpha = g.a * env; c.fillStyle = "#ffffff"; c.beginPath(); c.arc(PT.x, PT.y, 1.1 * kk, 0, TAU); c.fill();
            if (done) {
                g.on = false;
                if (g.day >= 0) {
                    flareDay(g.day, g.strong ? 1.2 : 0.7);
                    if (g.kind === 2 || g.kind === 3) streakRipple(g.day);
                } else if (g.tip) flare(g.tx, g.ty, (g.strong ? 16 : 11) * kk, g.strong ? 0.45 : 0.28, 1, false);
            }
        }
        // delayed flares (streak ripples)
        for (i = 0; i < DLY.length; i++) if (DLY[i].on && now >= DLY[i].at) { DLY[i].on = false; if (DLY[i].day <= rv) flareDay(DLY[i].day, DLY[i].s); }

        // playback head: bright particle moving through the field in date order, short particle trail
        if (pb.playing && !reduce) {
            headPos(pb.t, HEAD);
            HT[htI * 2] = HEAD.x; HT[htI * 2 + 1] = HEAD.y; htI = (htI + 1) % 24; if (htN < 24) htN++;
            c.fillStyle = "#d9d9d9";
            for (j = 1; j < htN; j++) {
                var q2 = ((htI - 1 - j) % 24 + 24) % 24;
                c.globalAlpha = 0.5 * (1 - j / htN); c.beginPath(); c.arc(HT[q2 * 2], HT[q2 * 2 + 1], (1.2 - 0.9 * j / htN) * kk, 0, TAU); c.fill();
            }
            glow(c, HEAD.x, HEAD.y, 14 * kk, 0.75);
            c.globalAlpha = 1; c.fillStyle = "#ffffff"; c.beginPath(); c.arc(HEAD.x, HEAD.y, 1.5 * kk, 0, TAU); c.fill();
        }

        // flares
        for (i = 0; i < FLR.length; i++) {
            var f = FLR[i];
            if (!f.on) continue;
            f.t += dt || 0.016;
            var p = f.t / f.dur;
            if (p >= 1) { f.on = false; continue; }
            var fa = f.a * Math.pow(1 - p, 1.6);
            glow(c, f.x, f.y, f.size * (0.7 + 0.6 * p), fa);
            if (f.ring) { c.globalAlpha = fa * 0.6; c.strokeStyle = "#ffffff"; c.lineWidth = 0.7; c.beginPath(); c.arc(f.x, f.y, f.size * (0.15 + 0.45 * p), 0, TAU); c.stroke(); }
        }
        c.globalAlpha = 1;
    }

    /* Silver trail: segments bucketed by alpha to avoid style churn */
    function drawTrail(c, p, s, len, a, lw) {
        var hi = p.index(s), BK = 6;
        c.strokeStyle = "#d9d9d9"; c.lineWidth = lw;
        for (var b = 0; b < BK; b++) {
            var lo = s - len * ((b + 1) / BK), up = s - len * (b / BK);
            c.globalAlpha = a * (1 - b / BK) * 0.75;
            c.beginPath();
            var started = false;
            for (var i = hi; i >= 0 && p.l[i] > lo - 0.0001; i--) {
                if (p.l[i] > up) continue;
                if (!started) {
                    if (b === 0) { p.at(s, PT); c.moveTo(PT.x, PT.y); }
                    else { var j = Math.min(i + 1, p.n - 1); c.moveTo(p.x[j], p.y[j]); }
                    c.lineTo(p.x[i], p.y[i]); started = true;
                } else c.lineTo(p.x[i], p.y[i]);
            }
            if (started) c.stroke();
        }
    }
    /* silver-white particles shed behind a signal head (reuses PT / PT2, no allocation) */
    var PT2 = { x: 0, y: 0 };
    function sparks(c, p, s, len, a, now, seed) {
        c.fillStyle = "#d9d9d9";
        for (var n = 1; n <= 5; n++) {
            var sd = s - len * (n / 5.5);
            if (sd <= 0) break;
            p.at(sd, PT); p.at(Math.max(0, sd - 2), PT2);
            var dx = PT.x - PT2.x, dy = PT.y - PT2.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
            var off = Math.sin(now * 0.004 + n * 1.9 + seed) * (0.6 + 0.35 * n) * G.kk;
            c.globalAlpha = a * 0.5 * (1 - n / 6);
            c.beginPath(); c.arc(PT.x - dy / d * off, PT.y + dx / d * off, (0.75 - 0.08 * n) * G.kk, 0, TAU); c.fill();
        }
    }

    /* =========================================================
       INTERACTION
       ========================================================= */

    function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (G.w / r.width), y: (e.clientY - r.top) * (G.h / r.height) }; }

    function hitDay(x, y, tol, touch) { // distance to the particle's edge: larger (busier) days are easier targets
        var dx = x - G.cx, dy = y - G.cy, r = Math.hypot(dx, dy);
        if (r < G.rIn - G.step - tol || r > G.rOut + G.step + tol) return -1;
        var best = -1, bd = tol, rv = Math.floor(pb.t);
        for (var i = 0; i <= rv; i++) {
            var d = Math.hypot(dayX[i] - x, dayY[i] - y) - dayRad[i] * (touch ? 1.6 : 1);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    function hitWeek(x, y, tol) { // the band between the field and the spine, or a week's twig
        var dx = x - G.cx, dy = y - G.cy, r = Math.hypot(dx, dy);
        if (r < G.rOut + G.step * 0.55 || r > G.rSpine + 0.09 * G.R + tol) return -1;
        var a = ((Math.atan2(dy, dx) - G.a0) % TAU + TAU) % TAU;
        if (a > G.sweep) return -1;
        var w = clamp(Math.floor((a / G.sweep) * G.W), 0, G.W - 1);
        if (r <= G.rSpine + tol * 0.6) return w;
        for (var k = w - 1; k <= w + 1; k++) {
            var tw = twigs[k];
            if (!tw) continue;
            for (var i = 0; i < tw.path.n; i++) if (Math.hypot(tw.path.x[i] - x, tw.path.y[i] - y) < tol) return k;
        }
        return -1;
    }
    function hitMonth(x, y, tol) {
        for (var i = 0; i < labels.length; i++) {
            var lb = labels[i];
            if (Math.abs(lb.x - x) < 9 + tol && Math.abs(lb.y - y) < 3 + tol) return lb.m;
        }
        return -1;
    }

    function applyFocus() {
        var m = hover.month >= 0 ? hover.month : sel.month;
        if (m !== focus.month) {
            focus.month = m; focusAmt = m >= 0 && !reduce ? 0 : 1;
            refreshBase(false);
        }
        syncMonthButtons(); readout();
        requestDraw(); wake();
    }

    function branchName(i) {
        return "Week " + (weekOf[i] + 1) + " of " + G.W + " › Dendrite " + ROMAN[weekPr[weekOf[i]]];
    }
    function weekText(w) {
        var a = Math.max(0, w * 7 - G.WD0), b = Math.min(N - 1, w * 7 + 6 - G.WD0), act = 0;
        for (var d = a; d <= b; d++) if (counts[d]) act++;
        return { k: "Week of " + fmtShort.format(new Date(dateMs[a])), v: plural(weekTotal[w], "contribution") + "<small>" + plural(act, "active day") + " of " + (b - a + 1) + " · Dendrite " + ROMAN[weekPr[w]] + "</small>" };
    }
    function dayText(i) {
        var c = counts[i], mo = months[monthOf[i]], stI = streakOf[i], extra = "";
        if (stI >= 0 && streaks[stI].end > streaks[stI].start) extra = " · " + (streaks[stI].end - streaks[stI].start + 1) + "-day streak";
        return {
            k: fmtDay.format(new Date(dateMs[i])),
            v: (c ? plural(c, "contribution") : "No contributions") +
                "<small>" + TIER_NAMES[tiers[i]] + extra + "</small>" +
                "<small>" + MONTHS_LONG[mo.m] + " " + mo.y + " · " + branchName(i) + "</small>",
        };
    }
    function monthText(m) {
        var mo = months[m];
        return { k: MONTHS_LONG[mo.m] + " " + mo.y, v: plural(mo.total, "contribution") + "<small>" + plural(mo.active, "active day") + " of " + (mo.last - mo.first + 1) + " · " + dendNames(m) + "</small>" };
    }

    function showTip(t, x, y, pinned) {
        el.tipK.textContent = t.k; el.tipV.innerHTML = t.v;
        el.tip.hidden = false;
        if (pinned) el.tip.setAttribute("data-pinned", ""); else el.tip.removeAttribute("data-pinned");
        el.tipNav.hidden = !pinned || sel.day < 0;
        var sx = stage.clientWidth / G.w, tw = el.tip.offsetWidth, th = el.tip.offsetHeight, W2 = stage.clientWidth, H2 = stage.clientHeight;
        var X = x * sx, Y = y * sx, gap = 14;
        var left = X + gap, top = Y - th - gap;
        if (left + tw > W2 - 4) left = X - tw - gap;
        if (left < 4) left = Math.max(4, Math.min(W2 - tw - 4, X - tw / 2));
        if (top < 4) top = Y + gap;
        if (top + th > H2 - 4) top = Math.max(4, H2 - th - 4);
        el.tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
    }
    function hideTip() { el.tip.hidden = true; el.tip.removeAttribute("data-pinned"); }
    function announce(s) { el.live.textContent = s; }

    function monthAnchor(m) { for (var i = 0; i < labels.length; i++) if (labels[i].m === m) return labels[i]; return { x: G.cx, y: G.cy }; }
    function weekAnchor(w) { var t = twigs[w]; return t ? { x: t.path.x[t.path.n - 1], y: t.path.y[t.path.n - 1] } : { x: px(G.rSpine, ang(w)), y: py(G.rSpine, ang(w)) }; }
    function refreshTip() {
        if (!D) return hideTip();
        if (hover.day >= 0) return showTip(dayText(hover.day), dayX[hover.day], dayY[hover.day], false);
        if (hover.week >= 0) { var wa = weekAnchor(hover.week); return showTip(weekText(hover.week), wa.x, wa.y, false); }
        if (sel.day >= 0) return showTip(dayText(sel.day), dayX[sel.day], dayY[sel.day], true);
        if (sel.week >= 0) { var wb = weekAnchor(sel.week); return showTip(weekText(sel.week), wb.x, wb.y, true); }
        if (hover.month >= 0 && lastPointer === "mouse" && hoverOnCanvas) { var a = monthAnchor(hover.month); return showTip(monthText(hover.month), a.x, a.y, false); }
        hideTip();
    }

    function selectDay(i, doTrace) {
        if (pb.t < N - 1 && i > Math.floor(pb.t)) scrubTo(N - 1); // never inspect an unrevealed date
        sel.day = i; sel.month = -1; sel.week = -1; pb.scrub = false;
        applyFocus(); refreshTip();
        announce(fmtLong.format(new Date(dateMs[i])) + ": " + (counts[i] ? plural(counts[i], "contribution") + ". " + TIER_NAMES[tiers[i]] + "." : "no contributions.") + " " + MONTHS_LONG[months[monthOf[i]].m] + ", " + branchName(i).replace(/›/g, ",") + ".");
        if (doTrace) trace(i);
    }
    function selectMonth(m, toggle) {
        if (pb.playing) { // jump the playback to that month and keep going
            pb.t = months[m].first; pb.lastD = pb.t - 1; pb.lastM = -1;
            readout(); announce("Playback jumped to " + MONTHS_LONG[months[m].m] + " " + months[m].y + ".");
            return;
        }
        if (pb.t < N - 1) { pb.t = N - 1; pb.lastD = N - 1; pb.lastM = monthOf[N - 1]; }
        sel.month = toggle && sel.month === m ? -1 : m;
        sel.day = -1; sel.week = -1; hover.day = -1; pb.scrub = false;
        applyFocus(); refreshTip();
        if (sel.month >= 0) {
            tourMonth(m);
            var mo = months[m];
            announce(MONTHS_LONG[mo.m] + " " + mo.y + " selected: " + plural(mo.total, "contribution") + ", " + plural(mo.active, "active day") + ", " + dendNames(m) + ".");
        } else announce("Showing the whole year.");
    }
    function selectWeek(w) {
        sel.week = w; sel.day = -1; sel.month = -1; pb.scrub = false;
        applyFocus(); refreshTip();
        var t = weekText(w);
        announce(t.k + ": " + plural(weekTotal[w], "contribution") + ", Dendrite " + ROMAN[weekPr[w]] + ".");
        pulseWeek(w);
    }
    function clearSel(all) {
        sel.day = -1; sel.week = -1; if (all) sel.month = -1;
        applyFocus(); refreshTip();
    }

    var lastPointer = "mouse", downAt = null, hoverOnCanvas = false;
    function tolFor(touch) { return touch ? Math.max(16, 7 * G.kk) : Math.max(7, 4 * G.kk + 3); }
    canvas.addEventListener("pointermove", function (e) {
        if (!D) return;
        lastPointer = e.pointerType;
        if (e.pointerType !== "mouse") return;
        hoverOnCanvas = true;
        var p = local(e), d = hitDay(p.x, p.y, tolFor(false));
        if (d > Math.floor(pb.t)) d = -1;
        var m = d < 0 ? hitMonth(p.x, p.y, 2) : -1;
        var wk = d < 0 && m < 0 ? hitWeek(p.x, p.y, 6) : -1;
        if (wk >= 0 && pb.playing) wk = -1;
        canvas.style.cursor = d >= 0 || m >= 0 || wk >= 0 ? "pointer" : "default";
        if (d === hover.day && m === hover.month && wk === hover.week) return;
        hover.day = d; hover.month = m; hover.week = wk;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerleave", function () {
        hoverOnCanvas = false;
        if (hover.day < 0 && hover.month < 0 && hover.week < 0) return;
        hover.day = hover.month = hover.week = -1;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerdown", function (e) { downAt = { x: e.clientX, y: e.clientY }; lastPointer = e.pointerType; });
    canvas.addEventListener("click", function (e) {
        if (!D) return;
        var touch = lastPointer !== "mouse";
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
        var p = local(e), d = hitDay(p.x, p.y, tolFor(touch), touch);
        if (d >= 0) { hover.day = hover.month = hover.week = -1; if (sel.day === d && !touch) return clearSel(false); return selectDay(d, true); }
        var m = hitMonth(p.x, p.y, touch ? 6 : 2);
        if (m >= 0) { hover.month = hover.week = -1; return selectMonth(m, true); }
        var wk = pb.playing ? -1 : hitWeek(p.x, p.y, touch ? 12 : 6);
        if (wk >= 0) { hover.week = -1; if (sel.week === wk && !touch) return clearSel(false); return selectWeek(wk); }
        clearSel(true);
    });

    canvas.addEventListener("keydown", function (e) {
        if (!D) return;
        var i = sel.day, k = e.key;
        var mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[k];
        if (mv !== undefined) { e.preventDefault(); selectDay(i < 0 ? (sel.month >= 0 ? months[sel.month].first : N - 1) : clamp(i + mv, 0, N - 1), false); return; }
        if (k === "Home" || k === "End") { e.preventDefault(); selectDay(k === "Home" ? 0 : N - 1, false); return; }
        if (k === "PageUp" || k === "PageDown") {
            e.preventDefault();
            var m = i < 0 ? (sel.month >= 0 ? sel.month : months.length - 1) : monthOf[i];
            m = clamp(m + (k === "PageUp" ? -1 : 1), 0, months.length - 1);
            selectDay(months[m].first, false); return;
        }
        if ((k === "Enter" || k === " ") && i >= 0) { e.preventDefault(); selectDay(i, true); return; }
        if (k === "Escape") { e.preventDefault(); clearSel(true); announce("Selection cleared."); }
    });

    el.tip.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        if (b.hasAttribute("data-no-close")) { clearSel(false); canvas.focus({ preventScroll: true }); return; }
        var step = +b.getAttribute("data-no-step");
        if (step && sel.day >= 0) { selectDay(clamp(sel.day + step, 0, N - 1), false); flareDay(sel.day, 0.9); wake(); }
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && (sel.day >= 0 || sel.week >= 0) && root.contains(document.activeElement)) clearSel(false); });

    /* Month buttons */
    function buildMonthButtons() {
        el.months.innerHTML = "";
        months.forEach(function (mo, m) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "no-month";
            b.setAttribute("aria-pressed", "false");
            var yr = m === 0 || mo.m === 0 || (m === months.length - 1 && months[0].m === mo.m);
            b.innerHTML = MONTHS[mo.m] + (yr ? "<em>’" + String(mo.y).slice(2) + "</em>" : "") + "<span>" + mo.total + "</span>";
            b.setAttribute("aria-label", MONTHS_LONG[mo.m] + " " + mo.y + ", " + plural(mo.total, "contribution") + ", " + plural(mo.active, "active day") + ", " + dendNames(m));
            b.addEventListener("click", function () { selectMonth(m, true); });
            b.addEventListener("mouseenter", function () { if (lastPointer === "mouse" && !pb.playing) { hover.month = m; applyFocus(); } });
            b.addEventListener("mouseleave", function () { if (hover.month === m) { hover.month = -1; applyFocus(); } });
            el.months.appendChild(b);
        });
        // timeline ticks at real month boundaries
        el.ticks.innerHTML = "";
        months.forEach(function (mo) {
            var s = document.createElement("span"), f = mo.first / Math.max(1, N - 1);
            s.style.left = "calc(7px + (100% - 14px) * " + f.toFixed(4) + ")";
            if (mo.last - mo.first >= 9) s.setAttribute("data-label", G.mobile ? MONTHS[mo.m].charAt(0) : MONTHS[mo.m]);
            el.ticks.appendChild(s);
        });
    }
    function syncMonthButtons() {
        var bs = el.months.children, cur = pb.playing || pb.t < N - 1 ? monthOf[Math.floor(pb.t)] : -1;
        for (var m = 0; m < bs.length; m++) {
            bs[m].setAttribute("aria-pressed", sel.month === m ? "true" : "false");
            bs[m].toggleAttribute("data-current", cur === m);
        }
    }

    /* Readout under the timeline */
    var fmtDM = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    function readout() {
        if (!D) return;
        var d, mo, sum = 0, act = 0, x;
        el.range.value = String(Math.floor(pb.t));
        el.range.style.setProperty("--p", (Math.floor(pb.t) / Math.max(1, N - 1) * 100).toFixed(2) + "%");
        el.range.setAttribute("aria-valuetext", fmtLong.format(new Date(dateMs[Math.floor(pb.t)])));
        var fm = hover.month >= 0 ? hover.month : sel.month;
        if (fm >= 0 && !pb.playing) {
            mo = months[fm];
            el.rMonth.textContent = MONTHS_LONG[mo.m] + " " + mo.y;
            el.rDate.textContent = fmtDM.format(new Date(dateMs[mo.first])) + " – " + fmtDM.format(new Date(dateMs[mo.last]));
            el.rStat.textContent = plural(mo.total, "contribution") + " · " + plural(mo.active, "active day");
            el.rProg.textContent = "Days " + (mo.first + 1) + "–" + (mo.last + 1) + " of " + N;
        } else {
            d = !pb.playing && sel.day >= 0 ? sel.day : Math.floor(pb.t); mo = months[monthOf[d]];
            for (x = mo.first; x <= d; x++) { sum += counts[x]; if (counts[x]) act++; }
            el.rMonth.textContent = MONTHS_LONG[mo.m] + " " + mo.y;
            el.rDate.textContent = fmtDay.format(new Date(dateMs[d]));
            el.rStat.textContent = plural(sum, "contribution") + " · " + plural(act, "active day") + (d < mo.last ? " so far" : "");
            var run = 0; for (x = 0; x <= d; x++) run += counts[x];
            el.rProg.textContent = "Day " + (d + 1) + " of " + N + (d < N - 1 ? " · " + run.toLocaleString("en-GB") + " revealed" : "");
        }
        syncMonthButtons();
    }

    el.play.addEventListener("click", function () { if (pb.playing) pause(false); else play(); });
    el.range.addEventListener("input", function () { if (D) scrubTo(clamp(+el.range.value | 0, 0, N - 1)); });

    /* =========================================================
       DATA LIFECYCLE
       ========================================================= */

    function periodText() { return fmtShort.format(new Date(dateMs[0])) + " – " + fmtShort.format(new Date(dateMs[N - 1])); }
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
        stage.setAttribute("data-state", D ? "ready" : state === "error" ? "error" : "loading");
        el.retry.hidden = !(state === "error" && !D);
        el.play.disabled = !D; el.range.disabled = !D;
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
        el.period.textContent = periodText();
    }

    function valid(p) {
        if (!p || !Array.isArray(p.days) || !p.days.length || !p.totals || !p.period) return false;
        for (var i = 0; i < p.days.length; i++) if (typeof p.days[i].date !== "string" || typeof p.days[i].count !== "number") return false;
        return true;
    }

    function apply(p, state) {
        var keep = -1;
        if (D && sel.month >= 0 && months[sel.month]) keep = months[sel.month].y * 12 + months[sel.month].m;
        D = p;
        prepare(p);
        pause(true);
        pb.t = N - 1; pb.lastD = N - 1; pb.lastM = monthOf[N - 1];
        sel.day = hover.day = hover.month = hover.week = sel.week = -1; sel.month = -1; routeCache.day = -1; staticTrace = null; pb.scrub = false;
        SIG.forEach(function (g) { g.on = false; });
        if (keep >= 0) months.forEach(function (mo, m) { if (mo.y * 12 + mo.m === keep) sel.month = m; });
        focus.month = sel.month; focusAmt = 1; revealM = -1;
        el.range.max = String(N - 1);
        if (G.w) { build(); G.built = canvas.width + "x" + canvas.height + "|" + D.fetchedAt; }
        buildMonthButtons();
        setSync(state, state === "live" ? "Live" : state === "cached" ? "Cached" : "Offline");
        paintStats(); hideTip(); playUI(); readout();
        refreshBase(true);
        requestDraw();

        // new activity → one signal per changed record
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
        if (!D) { setSync("loading", "Synchronising"); el.stateText.textContent = "Synchronising with GitHub"; }
        else { el.sync.setAttribute("data-sync", "loading"); el.syncText.textContent = "Syncing"; }
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
                    el.stateText.textContent = "GitHub activity is unavailable right now.";
                    el.period.textContent = "No data loaded";
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
                else pause(true); // playback never runs unseen
            });
        }, { rootMargin: "200px 0px" }).observe(stage);
    } else { inView = true; started = true; load(); wake(); }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) { pause(true); return; }
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
            var before = G.w + "x" + G.h + "|" + G.dpr + "|" + G.mobile;
            layout();
            if (before !== G.w + "x" + G.h + "|" + G.dpr + "|" + G.mobile) {
                routeCache.day = -1; staticTrace = null;
                SIG.forEach(function (g) { g.on = false; });
                if (D) buildMonthButtons();
                refreshBase(true); hideTip(); if (sel.day >= 0) refreshTip(); readout(); requestDraw();
            }
        });
    }
    if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(stage);
    else window.addEventListener("resize", onResize);

    function onReduce(e) {
        reduce = e.matches;
        if (reduce) { SIG.forEach(function (g) { g.on = false; }); if (pb.playing) { pause(true); } }
        refreshBase(true); requestDraw(); wake();
    }
    if (reduceMQ.addEventListener) reduceMQ.addEventListener("change", onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
})();
