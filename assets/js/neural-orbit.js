/* =========================================================
   NEURAL ARBOR — A year of building  (ACTIVITY ARCHIVE / 003)

   The last 365 days of GitHub contributions (YOOSUF-HUB) drawn
   as one biological neuron on a Canvas 2D scene.

   SOMA       a small irregular cell body of layered particles.
   DENDRITES  4 primary branches = the 4 quarters of the period
              (clockwise from upper left). A month belongs to the
              quarter its midpoint falls in, so a period that does
              not start on the 1st gets one short extra branch.
   MONTHS     each primary carries its monthly branches (secondary).
              A month splits into 10-day segments (halves on
              mobile): earlier segments are tertiary twigs, the
              last runs along the month's own tip. Days are laid
              out base → tip in date order.
   PARTICLES  exactly one per date. Brightness, size, satellites
              and glow come from that day's real count only.

   Geometry is deterministic: every branch is seeded from its
   quarter / calendar month, and a greedy placement pass keeps
   particles from colliding. Counts never move the structure, so
   a data refresh only changes brightness.

   Motion is restrained: fine dust drifts, branch tips sway, and
   signals only travel along the predefined routes (ambient pulse,
   selected day, month tour, new activity, YEAR IN MOTION playback).

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
    var ROMAN = ["I", "II", "III", "IV"];

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
    var months = [], streaks = [], QM = [[], [], [], []];
    var maxDay = 1, maxMonth = 1;

    function prepare(p) {
        var days = p.days, i, c;
        N = days.length;
        counts = new Int32Array(N); tiers = new Uint8Array(N); monthOf = new Int16Array(N);
        streakOf = new Int16Array(N); dateMs = new Float64Array(N); domOf = new Uint8Array(N);
        months = []; streaks = []; QM = [[], [], [], []]; maxDay = 1; maxMonth = 1;

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
            if (key !== cur) { cur = key; months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth(), first: i, last: i, total: 0, active: 0, q: 0 }); }
            var mo = months[months.length - 1]; mo.last = i; mo.total += c; if (c > 0) mo.active++;
            monthOf[i] = months.length - 1;
            if (c > 0) {
                if (!st) { st = { start: i, end: i, total: 0 }; streaks.push(st); }
                st.end = i; st.total += c; streakOf[i] = streaks.length - 1;
            } else { st = null; streakOf[i] = -1; }
        }
        // quarters of the period: a month joins the quarter its midpoint falls in
        months.forEach(function (mo, m) {
            if (mo.total > maxMonth) maxMonth = mo.total;
            mo.q = Math.min(3, Math.floor(((mo.first + mo.last) / 2) / (N / 4)));
            QM[mo.q].push(m);
        });
    }

    /* =========================================================
       GEOMETRY — built in unit space (1 unit = gap between days),
       then fitted to the stage
       ========================================================= */

    var G = { w: 0, h: 0, dpr: 1, mobile: false, S: 1, kk: 1, somaX: 0, somaY: 0, somaR: 0 };
    var TR = [], ST = [], CH = [];             // trunks (quarters), stems (months), carriers (day segments)
    var dayX, dayY, dayRad, dayCh, dayS;
    var somaP, somaO, dustP, spineP, satP, tipP, linkP, axon = null, labels = [];
    var nSoma = 0, nDust = 0, nSpine = 0, nSat = 0, nTip = 0, nLink = 0;
    var GAP = 1, TAIL = 1.15;
    var DIRS_D = [-2.2, -0.38, 0.95, 2.88], DIRS_M = [-1.98, -0.72, 1.3, 2.5];
    var font = "10px sans-serif", fontQ = "10px sans-serif";

    /* spatial hash used only while placing branches */
    var GC = 1.5;
    function Grid() { this.m = new Map(); }
    Grid.prototype.add = function (x, y, owner, part) {
        var k = (Math.floor(x / GC) + 2048) * 4096 + (Math.floor(y / GC) + 2048), a = this.m.get(k);
        if (!a) { a = []; this.m.set(k, a); }
        a.push(x, y, owner, part ? 1 : 0);
    };
    Grid.prototype.score = function (x, y, ig, rp, rf) {
        var ix = Math.floor(x / GC), iy = Math.floor(y / GC), sc = 0, rp2 = rp * rp, rf2 = rf * rf;
        for (var u = ix - 1; u <= ix + 1; u++) for (var v = iy - 1; v <= iy + 1; v++) {
            var a = this.m.get((u + 2048) * 4096 + (v + 2048));
            if (!a) continue;
            for (var i = 0; i < a.length; i += 4) {
                if (a[i + 2] === ig) continue;
                var dx = a[i] - x, dy = a[i + 1] - y, d2 = dx * dx + dy * dy;
                if (a[i + 3]) { if (d2 < rp2) sc += 1; } else if (d2 < rf2) sc += 0.5;
            }
        }
        return sc;
    };

    function layout() {
        var w = Math.round(stage.clientWidth), h = Math.round(stage.clientHeight);
        if (!w || !h) return false;
        G.w = w; G.h = h;
        G.dpr = Math.min(window.devicePixelRatio || 1, 2);
        G.mobile = w < 560;
        var cw = Math.round(w * G.dpr), chh = Math.round(h * G.dpr);
        [canvas, baseA, baseB].forEach(function (cv) { if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; } });
        var ff = getComputedStyle(root).fontFamily || "sans-serif";
        font = "500 " + (G.mobile ? 8 : 9.5) + "px " + ff;
        fontQ = "500 " + (G.mobile ? 9 : 11) + "px " + ff;
        var key = cw + "x" + chh + "|" + (D ? D.fetchedAt : "none");
        if (key !== G.built) { G.built = key; build(); }
        return true;
    }

    function build() {
        var mob = G.mobile, i, j, k, q, t;
        var grid = new Grid(), nextId = 2;
        var U = { soma: [], dust: [], spine: [], sat: [], tip: [] };
        TR = []; ST = []; CH = []; labels = [];

        /* ---- soma: irregular lobed outline ---- */
        var rs = mulberry(hash("soma"));
        var SR = 3.5, lob = [];
        for (k = 0; k < 4; k++) lob.push(0.045 + 0.07 * rs(), rs() * TAU);
        var somaRad = function (a) { var r = 1; for (var k2 = 0; k2 < 4; k2++) r += lob[k2 * 2] * Math.sin((k2 + 2) * a + lob[k2 * 2 + 1]); return SR * r; };
        for (t = 0; t < TAU; t += 0.2) { var sr = somaRad(t); grid.add(Math.cos(t) * sr, Math.sin(t) * sr, 1, false); grid.add(Math.cos(t) * sr * 0.5, Math.sin(t) * sr * 0.5, 1, false); }
        var outline = []; for (t = 0; t < 64; t++) { var oa = t / 64 * TAU, orr = somaRad(oa) * 0.92; outline.push(Math.cos(oa) * orr, Math.sin(oa) * orr); }
        var nucX = (rs() - 0.5) * 0.9, nucY = (rs() - 0.5) * 0.9;
        var NS = mob ? 360 : 760;
        for (i = 0; i < NS; i++) {
            var sa = rs() * TAU, u = rs(), inner = i < NS * 0.16;
            var rr = inner ? Math.pow(u, 0.7) * 0.85 : somaRad(sa) * Math.pow(u, 0.62) * 1.02;
            var x0 = (inner ? nucX : 0) + Math.cos(sa) * rr, y0 = (inner ? nucY : 0) + Math.sin(sa) * rr;
            var b = inner ? 0.75 + 0.25 * rs() : clamp(1 - rr / (SR * 1.08), 0, 1) * (0.55 + 0.45 * rs());
            U.soma.push(x0, y0, b, rs() < 0.18 ? 1 : 0);
        }

        /* ---- primary dendrites (quarters) ---- */
        var dirs = mob ? DIRS_M : DIRS_D;
        for (q = 0; q < 4; q++) {
            var ms = D ? QM[q] : [];
            var rq = mulberry(hash("q" + q + (mob ? "m" : "d")));
            var a = dirs[q] + (rq() - 0.5) * 0.16;
            var sp = [], s = 3.6 + 0.8 * rq();
            for (j = 0; j < ms.length; j++) {
                sp.push(s);
                if (j < ms.length - 1) s += 2.4 + 3.9 * Math.sqrt((months[ms[j]].last - months[ms[j]].first + 1) / 31);
            }
            var L = ms.length ? Math.max(7, sp[sp.length - 1]) : 8 + 3 * rq();
            var r0 = somaRad(a) * 0.35;
            var tp = curve(Math.cos(a) * r0, Math.sin(a) * r0, a, L, (rq() < 0.5 ? 1 : -1) * (0.3 + 0.35 * rq()), 52, (rq() - 0.5) * 0.7);
            if (ms.length) sp[sp.length - 1] = tp.len;
            var tid = nextId++;
            for (i = 0; i < tp.n; i++) grid.add(tp.x[i], tp.y[i], tid, false);
            var qTot = 0; ms.forEach(function (m) { qTot += months[m].total; });
            TR.push({ q: q, path: tp, id: tid, sp: sp, ms: ms, total: qTot, act: 0, rng: rq });
        }
        var maxQ = 1; TR.forEach(function (T) { maxQ = Math.max(maxQ, T.total); });
        TR.forEach(function (T) { T.act = Math.sqrt(T.total / maxQ); });

        if (D) {
            dayCh = new Int16Array(N); dayS = new Float32Array(N);
            var OFF = [0, 0.22, -0.22, 0.44, -0.44, 0.68, -0.68, 0.94, -0.94, 1.2, -1.2];
            var place = function (x, y, a, b, need, d0, n, ig, segs, wig) {
                var best = null, r0b = Math.hypot(x, y);
                for (var o = 0; o < OFF.length; o++) for (var bb = 0; bb < 2; bb++) {
                    var p = curve(x, y, a + OFF[o], need, bb ? b * 0.3 : b, segs, wig), sc = 0, pts = [];
                    for (var t2 = 0; t2 < n; t2++) { p.at(d0 + t2 * GAP, PT); pts.push(PT.x, PT.y); sc += grid.score(PT.x, PT.y, ig, 1.1, 0.95); }
                    for (var t3 = 0; t3 < p.n; t3 += 2) if (p.l[t3] > 1.2) sc += 0.5 * grid.score(p.x[t3], p.y[t3], ig, 0.95, 0.8);
                    if (Math.hypot(p.x[p.n - 1], p.y[p.n - 1]) < r0b + need * 0.4) sc += 3;
                    var tot = sc + o * 0.02 + bb * 0.01;
                    if (!best || tot < best.tot) best = { p: p, pts: pts, tot: tot, sc: sc };
                    if (sc === 0) return best;
                }
                return best;
            };
            var commit = function (best, fid, pid) {
                var p = best.p;
                for (var i2 = 0; i2 < p.n; i2++) grid.add(p.x[i2], p.y[i2], fid, false);
                for (i2 = 0; i2 < best.pts.length; i2 += 2) grid.add(best.pts[i2], best.pts[i2 + 1], pid, true);
            };
            var chunksOf = function (mo) {
                var cuts = mob ? [16] : [11, 21], out = [], start = mo.first;
                for (var d = mo.first + 1; d <= mo.last; d++) if (cuts.indexOf(domOf[d]) >= 0) { out.push([start, d - 1]); start = d; }
                out.push([start, mo.last]);
                return out;
            };

            /* pass 1 — month stems, carrying their last segment of days */
            TR.forEach(function (T) {
                T.ms.forEach(function (m, jj) {
                    var mo = months[m], rm = mulberry(hash("m" + mo.y + "-" + mo.m + (mob ? "m" : "d")));
                    var ch = chunksOf(mo), nTw = ch.length - 1, last = ch[nTw], lastN = last[1] - last[0] + 1;
                    var twS = []; for (var k2 = 0; k2 < nTw; k2++) twS.push(1.5 + 2.8 * k2);
                    var d0 = nTw ? twS[nTw - 1] + 2.0 : 1.3, need = d0 + (lastN - 1) * GAP + TAIL;
                    var tipM = jj === T.ms.length - 1, sS = tipM ? T.path.len : T.sp[jj];
                    T.path.at(sS, PT);
                    var x = PT.x, y = PT.y, ta = tanAt(T.path, sS), side = (jj + T.q) % 2 ? 1 : -1;
                    var a2 = tipM ? ta + (rm() - 0.5) * 0.3 : ta + side * (0.78 + 0.34 * rm());
                    var b2 = tipM ? (rm() < 0.5 ? 1 : -1) * (0.2 + 0.35 * rm()) : -side * (0.12 + 0.32 * rm());
                    var best = place(x, y, a2, b2, need, d0, lastN, T.id, 44, (rm() - 0.5) * 0.5);
                    var sid = nextId++, pid = nextId++;
                    commit(best, sid, pid);
                    var cIdx = CH.length;
                    CH.push({ m: m, path: best.p, first: last[0], last: last[1], s0: d0, terminal: true, sS: 0, k: nTw, total: 0, act: 0 });
                    ST[m] = { m: m, q: T.q, path: best.p, id: sid, sS: sS, tip: tipM, twS: twS, ch: ch, chunks: [cIdx], side: side, rng: rm, act: Math.sqrt(mo.total / maxMonth) };
                });
            });
            /* pass 2 — tertiary twigs for the earlier segments */
            ST.forEach(function (st) {
                var nTw = st.ch.length - 1, list = [];
                for (var k2 = 0; k2 < nTw; k2++) {
                    var c = st.ch[k2], n = c[1] - c[0] + 1, sS = st.twS[k2];
                    st.path.at(sS, PT);
                    var x = PT.x, y = PT.y, ta = tanAt(st.path, sS), side = (k2 % 2 ? 1 : -1) * -st.side;
                    var a2 = ta + side * (0.62 + 0.34 * st.rng()), b2 = -side * (0.25 + 0.45 * st.rng());
                    var d0 = 1.2, need = d0 + (n - 1) * GAP + TAIL;
                    var best = place(x, y, a2, b2, need, d0, n, st.id, 26, (st.rng() - 0.5) * 0.5);
                    var id = nextId++;
                    commit(best, id, id);
                    list.push(CH.length);
                    CH.push({ m: st.m, path: best.p, first: c[0], last: c[1], s0: d0, terminal: false, sS: sS, k: k2, total: 0, act: 0 });
                }
                st.chunks = list.concat(st.chunks);
            });
            var maxChunk = 1;
            CH.forEach(function (C, ci) {
                for (var d = C.first; d <= C.last; d++) { dayCh[d] = ci; dayS[d] = C.s0 + (d - C.first) * GAP; C.total += counts[d]; }
                maxChunk = Math.max(maxChunk, C.total);
            });
            CH.forEach(function (C) { C.act = Math.sqrt(C.total / maxChunk); });
        }

        /* ---- decoration: synaptic spines + fibre dust (seeded per branch) ---- */
        var decorate = function (p, rng, mIdx, dens, spP) {
            for (var i2 = 1; i2 < p.n - 1; i2++) {
                if (rng() > dens) continue;
                var dx = p.x[i2 + 1] - p.x[i2 - 1], dy = p.y[i2 + 1] - p.y[i2 - 1], dl = Math.hypot(dx, dy) || 1;
                var off = gauss(rng) * (0.45 + 0.9 * rng()), al = (rng() - 0.5) * 0.5;
                var lay = rng() < 0.5 ? 0 : rng() < 0.65 ? 1 : 2;
                U.dust.push(p.x[i2] - dy / dl * off + dx / dl * al, p.y[i2] + dx / dl * off + dy / dl * al, lay, mIdx, rng() < 0.3 ? 1 : 0, rng() * TAU);
            }
            for (var s2 = 0.7 + rng() * 0.4; s2 < p.len - 0.4; s2 += 0.42 + rng() * 0.5) {
                if (rng() > spP) continue;
                p.at(s2, PT);
                var sa2 = tanAt(p, s2) + (rng() < 0.5 ? 1 : -1) * (0.7 + 0.8 * rng()), sl = 0.12 + 0.26 * rng();
                U.spine.push(PT.x, PT.y, PT.x + Math.cos(sa2) * sl, PT.y + Math.sin(sa2) * sl, mIdx);
            }
        };
        var dMul = mob ? 0.45 : 1, sMul = mob ? 0.45 : 1;
        TR.forEach(function (T) { decorate(T.path, mulberry(hash("dq" + T.q)), -1, 0.7 * dMul, 0.08 * sMul); });
        ST.forEach(function (st) {
            var mo = months[st.m];
            decorate(st.path, mulberry(hash("ds" + mo.y + mo.m)), st.m, (0.5 + 0.6 * st.act) * dMul, (0.16 + 0.2 * st.act) * sMul);
        });
        CH.forEach(function (C) { if (!C.terminal) decorate(C.path, mulberry(hash("dc" + C.first)), C.m, (0.45 + 0.6 * C.act) * dMul, (0.14 + 0.2 * C.act) * sMul); });

        /* ---- satellites around active days (count-driven) + tips ---- */
        if (D) {
            for (i = 0; i < N; i++) {
                if (!counts[i]) continue;
                var C = CH[dayCh[i]], r2 = mulberry(hash("sat" + dateMs[i]));
                C.path.at(dayS[i], PT);
                var ns = [0, 1, 2, 3, 5][tiers[i]] + (ST[C.m].act > 0.65 ? 1 : 0);
                if (mob) ns = Math.ceil(ns / 2);
                for (k = 0; k < ns; k++) { var aa = r2() * TAU, ra = 0.3 + 0.42 * r2(); U.sat.push(PT.x + Math.cos(aa) * ra, PT.y + Math.sin(aa) * ra, i, 0.35 + 0.5 * r2()); }
            }
            CH.forEach(function (C) { var p = C.path; U.tip.push(p.x[p.n - 1], p.y[p.n - 1], tanAt(p, p.len), C.m, (C.first * 1.7) % TAU); });
            // labels: month name beyond its tip, quarter numeral beside its trunk
            ST.forEach(function (st) {
                var p = st.path, ta = tanAt(p, p.len);
                var mo = months[st.m], dup = months.some(function (o) { return o !== mo && o.m === mo.m; });
                var txt = MONTHS[mo.m].toUpperCase() + (dup ? " ’" + String(mo.y).slice(2) : ""), dl = 2.3, lx = 0, ly = 0;
                for (var tries = 0; tries < 6; tries++, dl += 1.3) {
                    lx = p.x[p.n - 1] + Math.cos(ta) * dl; ly = p.y[p.n - 1] + Math.sin(ta) * dl;
                    var clash = labels.some(function (o) { return Math.abs(o.x - lx) < (o.t.length + txt.length) * 0.34 && Math.abs(o.y - ly) < 1.5; });
                    if (!clash && grid.score(lx, ly, -99, 1.1, 0) === 0) break;
                }
                labels.push({ x: lx, y: ly, t: txt, m: st.m, q: -1 });
            });
            if (!mob) TR.forEach(function (T) {
                if (!T.ms.length) return;
                var s3 = Math.min(T.path.len * 0.5, T.sp[0] + 1.2), ta = tanAt(T.path, s3), sd = -ST[T.ms[0]].side;
                T.path.at(s3, PT);
                labels.push({ x: PT.x + Math.cos(ta + sd * Math.PI / 2) * 1.6, y: PT.y + Math.sin(ta + sd * Math.PI / 2) * 1.6, t: ROMAN[T.q], m: -1, q: T.q });
            });
        }

        /* ---- axon: one long faint fibre through the widest gap ---- */
        var angs = TR.map(function (T) { return Math.atan2(T.path.y[T.path.n - 1], T.path.x[T.path.n - 1]); }).sort(function (x, y) { return x - y; });
        var gapA = 0, gapMid = Math.PI / 2;
        for (i = 0; i < angs.length; i++) {
            var a1 = angs[i], a3 = i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU;
            if (a3 - a1 > gapA) { gapA = a3 - a1; gapMid = (a1 + a3) / 2; }
        }
        var ar = somaRad(gapMid) * 0.8;
        axon = curve(Math.cos(gapMid) * ar, Math.sin(gapMid) * ar, gapMid, 34, 0.42, 60, -0.3);

        /* ---- fit unit space → stage ---- */
        var minX = -SR, maxX = SR, minY = -SR, maxY = SR;
        var ext = function (x, y) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };
        var extP = function (p) { for (var i2 = 0; i2 < p.n; i2 += 2) ext(p.x[i2], p.y[i2]); ext(p.x[p.n - 1], p.y[p.n - 1]); };
        TR.forEach(function (T) { extP(T.path); });
        ST.forEach(function (st) { extP(st.path); });
        CH.forEach(function (C) { if (!C.terminal) extP(C.path); });
        labels.forEach(function (lb) { var hw = lb.t.length * 0.32; ext(lb.x - hw, lb.y - 0.8); ext(lb.x + hw, lb.y + 0.8); });
        if (!D) { minX = Math.min(minX, mob ? -24 : -36); maxX = Math.max(maxX, mob ? 24 : 36); minY = Math.min(minY, mob ? -30 : -26); maxY = Math.max(maxY, mob ? 30 : 26); }
        var pad = mob ? 10 : 22;
        var S = Math.min((G.w - 2 * pad) / (maxX - minX), (G.h - 2 * pad) / (maxY - minY));
        var ox = (G.w - (maxX - minX) * S) / 2 - minX * S, oy = (G.h - (maxY - minY) * S) / 2 - minY * S;
        G.S = S; G.somaX = ox; G.somaY = oy; G.somaR = SR * S;
        G.kk = clamp(S / 8.5, 0.6, 1.15);
        var kk = G.kk;

        TR.forEach(function (T) { T.path.transform(S, ox, oy); for (var j2 = 0; j2 < T.sp.length; j2++) T.sp[j2] *= S; });
        ST.forEach(function (st) { st.path.transform(S, ox, oy); st.sS *= S; for (var j2 = 0; j2 < st.twS.length; j2++) st.twS[j2] *= S; });
        CH.forEach(function (C) { if (!C.terminal) C.path.transform(S, ox, oy); C.s0 *= S; C.sS *= S; });
        axon.transform(S, ox, oy);
        labels.forEach(function (lb) { lb.x = ox + lb.x * S; lb.y = oy + lb.y * S; });

        var toPx = function (src, stride, xy) {
            var out = new Float32Array(src.length);
            for (var i2 = 0; i2 < src.length; i2 += stride) {
                for (var f = 0; f < stride; f++) out[i2 + f] = src[i2 + f];
                for (var x2 = 0; x2 < xy.length; x2++) out[i2 + xy[x2]] = (xy[x2] % 2 ? oy : ox) + src[i2 + xy[x2]] * S;
            }
            return out;
        };
        somaP = toPx(U.soma, 4, [0, 1]); nSoma = U.soma.length / 4;
        somaO = toPx(outline, 2, [0, 1]);
        dustP = toPx(U.dust, 6, [0, 1]); nDust = U.dust.length / 6;
        spineP = toPx(U.spine, 5, [0, 1, 2, 3]); nSpine = U.spine.length / 5;
        satP = toPx(U.sat, 4, [0, 1]); nSat = U.sat.length / 4;
        tipP = toPx(U.tip, 5, [0, 1]); nTip = U.tip.length / 5;

        if (!D) { nSat = 0; nTip = 0; nLink = 0; return; }

        /* ---- day particles ---- */
        dayX = new Float32Array(N); dayY = new Float32Array(N); dayRad = new Float32Array(N);
        var RAD = [0.95, 1.3, 1.65, 2.05, 2.55], rm2 = mob ? 1.15 : 1;
        for (i = 0; i < N; i++) {
            dayS[i] *= S;
            CH[dayCh[i]].path.at(dayS[i], PT);
            dayX[i] = PT.x; dayY[i] = PT.y;
            dayRad[i] = Math.max(tiers[i] ? 1.05 : 0.8, (RAD[tiers[i]] + (tiers[i] >= 2 ? 0.45 * Math.sqrt(counts[i] / maxDay) : 0)) * kk * rm2);
        }
        /* ---- temporal connections between consecutive active days ---- */
        var Lk = [];
        for (i = 1; i < N; i++) {
            if (!counts[i] || !counts[i - 1]) continue;
            var mx = (dayX[i] + dayX[i - 1]) / 2, my = (dayY[i] + dayY[i - 1]) / 2, same = dayCh[i] === dayCh[i - 1];
            Lk.push(i, same ? 1 : 0, same ? mx : mx + (G.somaX - mx) * 0.16, same ? my : my + (G.somaY - my) * 0.16);
        }
        linkP = new Float32Array(Lk); nLink = Lk.length / 4;
    }

    /* =========================================================
       BASE LAYER (static anatomy, redrawn only when focus changes)
       ========================================================= */

    var baseA = document.createElement("canvas"), baseB = document.createElement("canvas");
    var baseCur = baseA, basePrev = baseB, fade = 1, baseKey = "";
    var focus = { month: -1 };
    var DIM = 0.24;

    var revealM = -1; // playback / scrub: months after this one are not revealed yet
    function lit(m) { return (focus.month < 0 || m === focus.month) && (revealM < 0 || m <= revealM); }
    function anyDim() { return focus.month >= 0 || revealM >= 0; }
    function mf(m) { return lit(m) ? 1 : DIM; }
    function qf(q) {
        if (focus.month >= 0) return ST[focus.month] && ST[focus.month].q === q ? 1 : DIM * 1.3;
        if (revealM >= 0) return TR[q] && TR[q].ms.length && TR[q].ms[0] <= revealM ? 1 : DIM * 1.3;
        return 1;
    }

    function taper(c, p, w0, w1) {
        var n = p.n, i, a, b, dx, dy, d, w;
        if (n < 2) return;
        c.beginPath();
        for (i = 0; i < n; i++) {
            a = Math.max(0, i - 1); b = Math.min(n - 1, i + 1); dx = p.x[b] - p.x[a]; dy = p.y[b] - p.y[a]; d = Math.hypot(dx, dy) || 1;
            w = (w0 + (w1 - w0) * (p.l[i] / p.len)) * 0.5;
            if (i === 0) c.moveTo(p.x[i] - dy / d * w, p.y[i] + dx / d * w); else c.lineTo(p.x[i] - dy / d * w, p.y[i] + dx / d * w);
        }
        for (i = n - 1; i >= 0; i--) {
            a = Math.max(0, i - 1); b = Math.min(n - 1, i + 1); dx = p.x[b] - p.x[a]; dy = p.y[b] - p.y[a]; d = Math.hypot(dx, dy) || 1;
            w = (w0 + (w1 - w0) * (p.l[i] / p.len)) * 0.5;
            c.lineTo(p.x[i] + dy / d * w, p.y[i] - dx / d * w);
        }
        c.closePath(); c.fill();
    }
    function strokeAll(c, p) { strokeTo(c, p, p.len + 1); }

    function drawBase(cv) {
        var c = cv.getContext("2d"), kk = G.kk, i, a;
        c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
        c.clearRect(0, 0, G.w, G.h);
        c.lineCap = "round"; c.lineJoin = "round";

        // axon — long, faint, fading away from the soma
        var AX = 5;
        c.strokeStyle = "#888888";
        for (i = 0; i < AX; i++) {
            c.globalAlpha = (D ? 0.22 : 0.14) * Math.pow(1 - i / AX, 1.6) * (focus.month >= 0 ? 0.5 : 1);
            c.lineWidth = (1.5 - i * 0.24) * kk;
            c.beginPath(); strokeSeg(c, axon, axon.len * i / AX, axon.len * (i + 1) / AX); c.stroke();
        }

        // primary dendrites
        TR.forEach(function (T) {
            var f = D ? qf(T.q) : 0.5;
            c.fillStyle = "#888888"; c.globalAlpha = (0.42 + 0.3 * T.act) * f;
            taper(c, T.path, (5.4 + 2.2 * T.act) * kk, (D ? 1.05 : 0.4) * kk);
            c.strokeStyle = "#d9d9d9"; c.globalAlpha = (0.14 + 0.22 * T.act) * f; c.lineWidth = 0.55 * kk;
            c.beginPath(); strokeAll(c, T.path); c.stroke();
        });

        if (D) {
            // monthly branches + tertiary twigs (activity sets their presence)
            ST.forEach(function (st) {
                var f = mf(st.m);
                c.fillStyle = "#888888"; c.globalAlpha = (0.26 + 0.44 * st.act) * f;
                taper(c, st.path, (1.1 + 1.3 * st.act) * kk, 0.3 * kk);
            });
            CH.forEach(function (C) {
                if (C.terminal) return;
                var f = mf(C.m);
                c.fillStyle = "#888888"; c.globalAlpha = (0.22 + 0.48 * C.act) * f;
                taper(c, C.path, (0.62 + 0.62 * C.act) * kk, 0.2 * kk);
            });
            // luminous cores on active branches
            c.strokeStyle = "#d9d9d9"; c.lineWidth = 0.45 * kk;
            ST.forEach(function (st) { if (st.act < 0.05) return; c.globalAlpha = 0.24 * st.act * mf(st.m); c.beginPath(); strokeAll(c, st.path); c.stroke(); });
        }

        // synaptic spines
        c.strokeStyle = "#888888"; c.lineWidth = 0.45 * kk;
        for (var pass = 0; pass < 2; pass++) {
            if (pass === 1 && !anyDim()) break;
            c.globalAlpha = pass === 0 ? 0.32 : 0.32 * DIM;
            c.beginPath();
            for (i = 0; i < nSpine; i++) {
                var o = i * 5, m = spineP[o + 4], on = m < 0 || lit(m);
                if ((pass === 0) !== on) continue;
                c.moveTo(spineP[o], spineP[o + 1]); c.lineTo(spineP[o + 2], spineP[o + 3]);
            }
            c.stroke();
        }
        c.fillStyle = "#a3a3a3";
        c.globalAlpha = 0.45;
        c.beginPath();
        for (i = 0; i < nSpine; i++) { var o2 = i * 5; if (spineP[o2 + 4] >= 0 && !lit(spineP[o2 + 4])) continue; c.rect(spineP[o2 + 2] - 0.4 * kk, spineP[o2 + 3] - 0.4 * kk, 0.8 * kk, 0.8 * kk); }
        c.fill();

        // static fibre dust (three depth layers); drifting dust is drawn per frame
        var LA = [0.2, 0.38, 0.6], LS = [0.7, 0.95, 1.2], LC = ["#555555", "#888888", "#a3a3a3"];
        for (var lay = 0; lay < 3; lay++) {
            c.fillStyle = LC[lay]; c.beginPath();
            for (i = 0; i < nDust; i++) {
                var d6 = i * 6;
                if (dustP[d6 + 2] !== lay || (dustP[d6 + 4] && !reduce)) continue;
                var df = dustP[d6 + 3] < 0 || lit(dustP[d6 + 3]);
                if (!df) continue;
                c.rect(dustP[d6], dustP[d6 + 1], LS[lay] * kk, LS[lay] * kk);
            }
            c.globalAlpha = LA[lay]; c.fill();
        }

        // soma: translucent membrane body the trunks flow out of, then layered points
        var bg = c.createRadialGradient(G.somaX, G.somaY, 0, G.somaX, G.somaY, G.somaR * 1.05);
        bg.addColorStop(0, "rgba(217,217,217,0.34)");
        bg.addColorStop(0.55, "rgba(136,136,136,0.26)");
        bg.addColorStop(1, "rgba(85,85,85,0.16)");
        c.fillStyle = bg; c.globalAlpha = D ? 1 : 0.6;
        c.beginPath();
        for (i = 0; i < somaO.length; i += 2) { if (i) c.lineTo(somaO[i], somaO[i + 1]); else c.moveTo(somaO[i], somaO[i + 1]); }
        c.closePath(); c.fill();
        c.strokeStyle = "#888888"; c.lineWidth = 0.6 * kk; c.globalAlpha = 0.35; c.stroke();
        glow(c, G.somaX, G.somaY, G.somaR * 2.6, D ? 0.12 : 0.06);
        var SC = ["#555555", "#888888", "#d9d9d9", "#ffffff"];
        for (var band = 0; band < 4; band++) {
            c.fillStyle = SC[band]; c.beginPath();
            for (i = 0; i < nSoma; i++) {
                var s4 = i * 4, bb = somaP[s4 + 2], bi = bb < 0.3 ? 0 : bb < 0.55 ? 1 : bb < 0.8 ? 2 : 3;
                if (bi !== band) continue;
                var sz = (somaP[s4 + 3] ? 1.25 : 0.8) * kk;
                c.rect(somaP[s4] - sz / 2, somaP[s4 + 1] - sz / 2, sz, sz);
            }
            c.globalAlpha = [0.55, 0.65, 0.7, 0.75][band] * (D ? 1 : 0.6); c.fill();
        }

        // static tip filaments (animated version drawn per frame)
        if (reduce) drawTips(c, 0);

        // labels
        if (D) {
            c.textAlign = "center"; c.textBaseline = "middle";
            labels.forEach(function (lb) {
                if (lb.m >= 0) {
                    c.font = font;
                    c.fillStyle = focus.month === lb.m ? "#ffffff" : !lit(lb.m) ? "#252525" : revealM === lb.m ? "#a3a3a3" : "#555555";
                } else {
                    c.font = fontQ;
                    c.fillStyle = focus.month >= 0 && ST[focus.month].q === lb.q ? "#a3a3a3" : qf(lb.q) < 1 ? "#252525" : "#555555";
                }
                c.globalAlpha = 1; c.fillText(lb.t, lb.x, lb.y);
            });
        }
        c.globalAlpha = 1;
    }
    function strokeSeg(c, p, s0, s1) {
        var i0 = p.index(s0), i1 = p.index(s1);
        p.at(s0, PT); c.moveTo(PT.x, PT.y);
        for (var i = i0 + 1; i <= i1; i++) c.lineTo(p.x[i], p.y[i]);
        p.at(s1, PT); c.lineTo(PT.x, PT.y);
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
    for (var si = 0; si < 12; si++) SIG.push({ on: false, path: null, s: 0, end: 0, v: 0, trail: 0, a: 1, kind: 0, marks: null, mi: 0, day: -1, strong: 0 });
    for (var fi = 0; fi < 48; fi++) FLR.push({ on: false, x: 0, y: 0, t: 0, dur: 0, size: 0, a: 0, ring: false });
    for (var di = 0; di < 24; di++) DLY.push({ on: false, day: 0, at: 0, s: 0 });
    var nextAmbient = 0;

    function spawn(path, v, kind, a) {
        for (var i = 0; i < SIG.length; i++) if (!SIG[i].on) {
            var g = SIG[i];
            g.on = true; g.path = path; g.s = 0; g.end = path.len; g.v = v; g.kind = kind;
            g.trail = 0.09 * Math.min(G.w, G.h); g.a = a || 1; g.marks = null; g.mi = 0; g.day = -1; g.strong = 0;
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
        flare(dayX[i], dayY[i], (8 + 5 * tr) * G.kk * (0.75 + 0.5 * strength), (0.22 + 0.11 * tr) * strength, 0.8 + 0.18 * tr, tr >= 3 && strength >= 0.9);
    }
    function delayFlare(i, ms, s) {
        for (var k = 0; k < DLY.length; k++) if (!DLY[k].on) { var q = DLY[k]; q.on = true; q.day = i; q.at = performance.now() + ms; q.s = s; return; }
    }

    /* routes along the real anatomy: soma → quarter → month → segment → day */
    function routeTo(i) {
        var C = CH[dayCh[i]], st = ST[C.m], T = TR[st.q], p = new Path(160);
        p.push(G.somaX, G.somaY);
        appendSeg(p, T.path, 0, st.sS);
        if (C.terminal) appendSeg(p, st.path, 0, dayS[i]);
        else { appendSeg(p, st.path, 0, C.sS); appendSeg(p, C.path, 0, dayS[i]); }
        return p;
    }
    function monthTour(m) {
        var st = ST[m], T = TR[st.q], p = new Path(512), mk = { s: [], d: [] }, pos = 0;
        p.push(G.somaX, G.somaY);
        appendSeg(p, T.path, 0, st.sS);
        st.chunks.forEach(function (ci) {
            var C = CH[ci], cur;
            if (!C.terminal) { appendSeg(p, st.path, pos, C.sS); pos = C.sS; cur = 0; }
            else cur = pos;
            for (var d = C.first; d <= C.last; d++) { appendSeg(p, C.path, cur, dayS[d]); cur = dayS[d]; mk.s.push(p.len); mk.d.push(d); }
            if (!C.terminal) { appendSeg(p, C.path, cur, C.path.len); appendSeg(p, C.path, C.path.len, 0); }
            else appendSeg(p, C.path, cur, C.path.len);
        });
        return { p: p, mk: mk };
    }

    function ambient(now) {
        if (!D || reduce || pb.playing || now < nextAmbient) return;
        nextAmbient = now + 3800 + Math.random() * 5200; // irregular, unhurried
        var live = 0, i;
        for (i = 0; i < SIG.length; i++) if (SIG[i].on && SIG[i].kind === 0) live++;
        if (live >= 1) return;
        // weighted by real activity: busy days are visited more often
        var tot = 0; for (i = 0; i < N; i++) tot += counts[i];
        if (!tot) return;
        var r = Math.random() * tot, pick = N - 1;
        for (i = 0; i < N; i++) { r -= counts[i]; if (r <= 0) { pick = i; break; } }
        var g = spawn(routeTo(pick), 0.26 * Math.min(G.w, G.h), 0, 0.7);
        if (g) g.day = pick;
    }

    /* selected day: signal from the soma to the day, then its streak answers */
    function trace(i) {
        if (!D) return;
        if (reduce) {
            staticTrace = routeTo(i); flareDay(i, 1.1);
            clearTimeout(staticTimer);
            staticTimer = setTimeout(function () { staticTrace = null; requestDraw(); }, 2600);
            requestDraw(); return;
        }
        var g = spawn(routeTo(i), 0.42 * Math.min(G.w, G.h), 2, 1);
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
                var g = spawn(routeTo(i), 0.34 * Math.min(G.w, G.h), 3, 1);
                if (g) { g.day = i; g.strong = 1; }
                wake();
            }, 400 + n * 1100);
        });
    }

    /* =========================================================
       YEAR IN MOTION — playback state
       ========================================================= */

    var pb = { t: 0, playing: false, lastD: -1, lastM: -1, timer: 0 };

    function headPos(t, out) { // luminous head moving through the chronological paths
        var d = Math.floor(t), f = t - d;
        if (d >= N - 1) { d = N - 1; f = 0; }
        var ci = dayCh[d], s = dayS[d];
        if (d + 1 < N && f > 0) {
            if (dayCh[d + 1] === ci) s += (dayS[d + 1] - s) * f;
            else if (f < 0.5) s += (CH[ci].path.len - s) * (f * 2);
            else { ci = dayCh[d + 1]; s = dayS[d + 1] * ((f - 0.5) * 2); }
        }
        out.ci = ci; out.s = s;
        CH[ci].path.at(s, PT); out.x = PT.x; out.y = PT.y;
        return out;
    }
    var HEAD = { ci: 0, s: 0, x: 0, y: 0 };

    function revealUpTo(d, flares) {
        for (var x = pb.lastD + 1; x <= d; x++) {
            if (flares && counts[x] > 0) flareDay(x, 0.85);
            var m = monthOf[x];
            if (m !== pb.lastM) {
                pb.lastM = m;
                if (flares && !reduce) { // conduction: soma → the new month's branch
                    var st = ST[m], T = TR[st.q], p = new Path(96);
                    p.push(G.somaX, G.somaY); appendSeg(p, T.path, 0, st.sS); appendSeg(p, st.path, 0, Math.min(st.path.len, 1.2 * G.S));
                    spawn(p, 0.9 * Math.min(G.w, G.h), 4, 0.7);
                }
            }
        }
        pb.lastD = d;
    }

    function play() {
        if (!D) return;
        if (pb.t >= N - 1) { pb.t = 0; pb.lastD = -1; pb.lastM = -1; }
        pb.playing = true;
        sel.day = -1; sel.month = -1; hover.day = hover.month = -1;
        applyFocus(); refreshTip();
        playUI();
        announce("Playing the year from " + fmtLong.format(new Date(dateMs[Math.floor(pb.t)])) + ".");
        if (reduce) stepReduced(); else { last = performance.now(); wake(); }
    }
    function pause(silent) {
        if (!pb.playing) return;
        pb.playing = false; clearTimeout(pb.timer);
        playUI(); readout();
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
        pb.t = d; pb.lastD = d; pb.lastM = monthOf[d];
        sel.month = -1; applyFocus();
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
    var hover = { day: -1, month: -1 }, sel = { day: -1, month: -1 };
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
        var dt = Math.min(0.05, (now - last) / 1000);
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

    function drawTips(c, time) {
        var kk = G.kk, hl = (G.mobile ? 1.3 : 1.7) * kk * 4;
        c.strokeStyle = "#888888"; c.lineWidth = 0.5 * kk; c.globalAlpha = 0.45;
        c.beginPath();
        for (var i = 0; i < nTip; i++) {
            var o = i * 5, m = tipP[o + 3];
            if (!lit(m)) continue;
            var a = tipP[o + 2] + Math.sin(time * 0.55 + tipP[o + 4]) * 0.09, x = tipP[o], y = tipP[o + 1];
            var mx = x + Math.cos(a) * hl * 0.55, my = y + Math.sin(a) * hl * 0.55, a2 = a + Math.sin(time * 0.8 + tipP[o + 4] * 1.3) * 0.12;
            c.moveTo(x, y); c.quadraticCurveTo(mx, my, mx + Math.cos(a2) * hl * 0.45, my + Math.sin(a2) * hl * 0.45);
        }
        c.stroke();
    }

    function render(dt, now) {
        var c = ctx, kk = G.kk, i, g, time = now / 1000;
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

        // drifting fibre dust (low amplitude, per-particle phase)
        if (!reduce) {
            var LA = [0.2, 0.38, 0.6], LS = [0.7, 0.95, 1.2], LC = ["#555555", "#888888", "#a3a3a3"], amp = 0.9 * kk;
            for (var lay = 0; lay < 3; lay++) {
                c.fillStyle = LC[lay]; c.beginPath();
                for (i = 0; i < nDust; i++) {
                    var d6 = i * 6;
                    if (!dustP[d6 + 4] || dustP[d6 + 2] !== lay) continue;
                    if (dustP[d6 + 3] >= 0 && !lit(dustP[d6 + 3])) continue;
                    var ph = dustP[d6 + 5];
                    c.rect(dustP[d6] + Math.sin(time * 0.35 + ph) * amp * (1 + lay * 0.4), dustP[d6 + 1] + Math.cos(time * 0.28 + ph * 1.7) * amp * (1 + lay * 0.4), LS[lay] * kk, LS[lay] * kk);
                }
                c.globalAlpha = LA[lay]; c.fill();
            }
            drawTips(c, time);
            // soma breathes very slightly
            glow(c, G.somaX, G.somaY, G.somaR * (2.2 + 0.12 * Math.sin(time * 0.7)), D ? 0.07 + 0.03 * Math.sin(time * 0.7) : 0.03);
        }
        if (!D) return;

        if (!reduce && dt) ambient(now);

        // playback progress
        if (pb.playing && !reduce && dt) {
            pb.t = Math.min(N - 1, pb.t + dt * PLAY_RATE);
            var dNow = Math.floor(pb.t);
            if (dNow !== pb.lastD) { revealUpTo(dNow, true); readout(); }
            if (pb.t >= N - 1) finish();
        }
        var rv = Math.floor(pb.t), revealing = rv < N - 1;
        var rmNow = revealing ? monthOf[rv] : -1;
        if (rmNow !== revealM) { revealM = rmNow; refreshBase(false); }

        // selected month brightens progressively from the soma outwards
        var fm = focus.month;
        if (fm >= 0 && ST[fm]) {
            if (focusAmt < 1) focusAmt = reduce ? 1 : Math.min(1, focusAmt + (dt || 0.016) / 1.1);
            var st = ST[fm], T = TR[st.q], grow = (1 - Math.pow(1 - focusAmt, 2.2));
            var Ltot = st.sS + st.path.len, reach = grow * Ltot * 1.05;
            c.strokeStyle = "#ffffff";
            c.globalAlpha = 0.7; c.lineWidth = 1.5 * kk;
            c.beginPath(); strokeTo(c, T.path, Math.min(st.sS, reach)); c.stroke();
            if (reach > st.sS) {
                var sr = reach - st.sS;
                c.globalAlpha = 0.8; c.lineWidth = 1.2 * kk;
                c.beginPath(); strokeTo(c, st.path, sr); c.stroke();
                c.lineWidth = 0.8 * kk; c.globalAlpha = 0.65; c.beginPath();
                st.chunks.forEach(function (ci) { var C = CH[ci]; if (!C.terminal && sr > C.sS) strokeTo(c, C.path, (sr - C.sS) * 1.4); });
                c.stroke();
            }
        } else if (pb.playing || revealing) { // playback: current month branch softly lit
            var m2 = monthOf[rv], st2 = ST[m2];
            if (st2) {
                c.strokeStyle = "#ffffff"; c.globalAlpha = 0.35; c.lineWidth = 1 * kk; c.beginPath();
                strokeTo(c, TR[st2.q].path, st2.sS); strokeTo(c, st2.path, st2.path.len);
                st2.chunks.forEach(function (ci) { if (!CH[ci].terminal) strokeTo(c, CH[ci].path, CH[ci].path.len); });
                c.stroke();
            }
        }

        // temporal connections between consecutive active days
        c.strokeStyle = "#d9d9d9"; c.lineWidth = 0.6 * kk;
        for (var pass = 0; pass < 2; pass++) {
            c.globalAlpha = pass ? 0.14 : 0.42; c.beginPath();
            for (i = 0; i < nLink; i++) {
                var o = i * 4, b = linkP[o], sm = linkP[o + 1];
                if ((sm === 1) === !!pass || b > rv) continue;
                if (fm >= 0 && monthOf[b] !== fm && monthOf[b - 1] !== fm) continue;
                c.moveTo(dayX[b - 1], dayY[b - 1]);
                if (sm) c.lineTo(dayX[b], dayY[b]); else c.quadraticCurveTo(linkP[o + 2], linkP[o + 3], dayX[b], dayY[b]);
            }
            c.stroke();
        }

        // day particles, batched per tier (focus + playback reveal)
        var FILL = ["#555555", "#888888", "#a3a3a3", "#d9d9d9", "#ffffff"], ALPHA = [0.95, 0.9, 0.95, 1, 1];
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
        if (revealing) { // not reached yet: faint graphite seeds
            c.fillStyle = "#252525"; c.globalAlpha = 1; c.beginPath();
            for (i = rv + 1; i < N; i++) { var rr = 0.85 * kk; c.moveTo(dayX[i] + rr, dayY[i]); c.arc(dayX[i], dayY[i], rr, 0, TAU); }
            c.fill();
        }
        // satellites (small surrounding details scaled by the day's count)
        c.fillStyle = "#d9d9d9"; c.beginPath();
        var ssz = 0.75 * kk;
        for (i = 0; i < nSat; i++) {
            var s4 = i * 4, sd = satP[s4 + 2];
            if (sd > rv || (fm >= 0 && monthOf[sd] !== fm)) continue;
            c.rect(satP[s4] - ssz / 2, satP[s4 + 1] - ssz / 2, ssz * satP[s4 + 3] * 1.6, ssz * satP[s4 + 3] * 1.6);
        }
        c.globalAlpha = 0.45; c.fill();
        // local glow: subtle for high, a soft halo for exceptional
        for (i = 0; i <= rv; i++) {
            if (tiers[i] < 3) continue;
            var gf = fm < 0 || monthOf[i] === fm ? 1 : 0.2;
            if (tiers[i] === 4) glow(c, dayX[i], dayY[i], 15 * kk, 0.34 * gf);
            else glow(c, dayX[i], dayY[i], 8.5 * kk, 0.16 * gf);
        }

        // hover / selected day: its route from the soma, ring, glow
        var hd = hover.day >= 0 ? hover.day : sel.day;
        if (hd >= 0) {
            if (routeCache.day !== hd) { routeCache.day = hd; routeCache.p = routeTo(hd); }
            c.strokeStyle = "#ffffff"; c.globalAlpha = 0.75; c.lineWidth = 1.05 * kk;
            c.beginPath(); strokeTo(c, routeCache.p, routeCache.p.len); c.stroke();
            c.globalAlpha = 1; c.lineWidth = 1;
            c.beginPath(); c.arc(dayX[hd], dayY[hd], dayRad[hd] + 3.6 * kk, 0, TAU); c.stroke();
            glow(c, dayX[hd], dayY[hd], 14 * kk, 0.45);
        }
        if (staticTrace) { c.strokeStyle = "#ffffff"; c.globalAlpha = 0.9; c.lineWidth = 1.3 * kk; c.beginPath(); strokeTo(c, staticTrace, staticTrace.len); c.stroke(); }

        // signals
        for (i = 0; i < SIG.length; i++) {
            g = SIG[i];
            if (!g.on) continue;
            g.s += g.v * dt;
            if (g.marks) while (g.mi < g.marks.s.length && g.s >= g.marks.s[g.mi]) { var md = g.marks.d[g.mi]; if (counts[md]) flareDay(md, 0.95); g.mi++; }
            var done = g.s >= g.end;
            if (done) g.s = g.end;
            var env = Math.min(1, g.s / (0.06 * g.path.len + 1) + 0.25);
            drawTrail(c, g.path, g.s, g.trail, 0.8 * g.a * env, (g.kind === 2 ? 1.25 : 1) * kk);
            g.path.at(g.s, PT);
            glow(c, PT.x, PT.y, (g.kind === 2 ? 14 : 11) * kk, 0.9 * g.a * env);
            c.globalAlpha = g.a * env; c.fillStyle = "#ffffff"; c.beginPath(); c.arc(PT.x, PT.y, 1.15 * kk, 0, TAU); c.fill();
            if (done) {
                g.on = false;
                if (g.day >= 0) {
                    flareDay(g.day, g.strong ? 1.2 : 0.7);
                    if (g.kind === 2 || g.kind === 3) streakRipple(g.day);
                }
            }
        }
        // delayed flares (streak ripples)
        for (i = 0; i < DLY.length; i++) if (DLY[i].on && now >= DLY[i].at) { DLY[i].on = false; if (DLY[i].day <= rv) flareDay(DLY[i].day, DLY[i].s); }

        // playback head
        if (pb.playing && !reduce) {
            headPos(pb.t, HEAD);
            var hp = CH[HEAD.ci].path;
            drawTrail(c, hp, HEAD.s, 0.05 * Math.min(G.w, G.h), 0.8, 1.2 * kk);
            glow(c, HEAD.x, HEAD.y, 16 * kk, 0.85);
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

    /* =========================================================
       INTERACTION
       ========================================================= */

    function local(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (G.w / r.width), y: (e.clientY - r.top) * (G.h / r.height) }; }

    function hitDay(x, y, tol, touch) { // distance to the particle's edge: larger (busier) days are easier targets
        var best = -1, bd = tol, rv = Math.floor(pb.t);
        for (var i = 0; i <= rv; i++) {
            var d = Math.hypot(dayX[i] - x, dayY[i] - y) - dayRad[i] * (touch ? 2.2 : 1);
            if (d < bd) { bd = d; best = i; }
        }
        return best;
    }
    function hitMonth(x, y, tol) {
        var best = -1, bd = tol * tol, i;
        for (var m = 0; m < ST.length; m++) {
            var st = ST[m];
            if (!st) continue;
            var list = [st.path];
            for (var k = 0; k < st.chunks.length; k++) if (!CH[st.chunks[k]].terminal) list.push(CH[st.chunks[k]].path);
            for (var j = 0; j < list.length; j++) {
                var p = list[j];
                for (i = 0; i < p.n; i += 2) { var dx = p.x[i] - x, dy = p.y[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = m; } }
            }
        }
        for (i = 0; i < labels.length; i++) {
            var lb = labels[i];
            if (lb.m >= 0 && Math.abs(lb.x - x) < 15 && Math.abs(lb.y - y) < 8) return lb.m;
        }
        return best;
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
        var C = CH[dayCh[i]], st = ST[C.m], n = st.chunks.length, pos = st.chunks.indexOf(dayCh[i]) + 1;
        return "Branch " + ROMAN[st.q] + " › " + MONTHS[months[C.m].m] + (n > 1 ? " › segment " + pos + " of " + n : "");
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
        return { k: MONTHS_LONG[mo.m] + " " + mo.y, v: plural(mo.total, "contribution") + "<small>" + plural(mo.active, "active day") + " of " + (mo.last - mo.first + 1) + " · Branch " + ROMAN[mo.q] + "</small>" };
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

    function monthAnchor(m) { for (var i = 0; i < labels.length; i++) if (labels[i].m === m) return labels[i]; return { x: G.somaX, y: G.somaY }; }
    function refreshTip() {
        if (!D) return hideTip();
        if (hover.day >= 0) return showTip(dayText(hover.day), dayX[hover.day], dayY[hover.day], false);
        if (sel.day >= 0) return showTip(dayText(sel.day), dayX[sel.day], dayY[sel.day], true);
        if (hover.month >= 0 && lastPointer === "mouse" && hoverOnCanvas) { var a = monthAnchor(hover.month); return showTip(monthText(hover.month), a.x, a.y, false); }
        hideTip();
    }

    function selectDay(i, doTrace) {
        if (pb.t < N - 1 && i > Math.floor(pb.t)) scrubTo(N - 1); // never inspect an unrevealed date
        sel.day = i; sel.month = -1;
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
        sel.day = -1; hover.day = -1;
        applyFocus(); refreshTip();
        if (sel.month >= 0) {
            tourMonth(m);
            var mo = months[m];
            announce(MONTHS_LONG[mo.m] + " " + mo.y + " selected: " + plural(mo.total, "contribution") + ", " + plural(mo.active, "active day") + ", branch " + ROMAN[mo.q] + ".");
        } else announce("Showing the whole year.");
    }
    function clearSel(all) {
        sel.day = -1; if (all) sel.month = -1;
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
        var m = d < 0 ? hitMonth(p.x, p.y, 7) : -1;
        canvas.style.cursor = d >= 0 || m >= 0 ? "pointer" : "default";
        if (d === hover.day && m === hover.month) return;
        hover.day = d; hover.month = m;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerleave", function () {
        hoverOnCanvas = false;
        if (hover.day < 0 && hover.month < 0) return;
        hover.day = hover.month = -1;
        applyFocus(); refreshTip();
    });
    canvas.addEventListener("pointerdown", function (e) { downAt = { x: e.clientX, y: e.clientY }; lastPointer = e.pointerType; });
    canvas.addEventListener("click", function (e) {
        if (!D) return;
        var touch = lastPointer !== "mouse";
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
        var p = local(e), d = hitDay(p.x, p.y, tolFor(touch), touch);
        if (d >= 0) { hover.day = hover.month = -1; if (sel.day === d && !touch) return clearSel(false); return selectDay(d, true); }
        var m = hitMonth(p.x, p.y, touch ? 12 : 7);
        if (m >= 0) { hover.month = -1; return selectMonth(m, true); }
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
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sel.day >= 0 && root.contains(document.activeElement)) clearSel(false); });

    /* Month buttons */
    function buildMonthButtons() {
        el.months.innerHTML = "";
        months.forEach(function (mo, m) {
            var b = document.createElement("button");
            b.type = "button"; b.className = "no-month";
            b.setAttribute("aria-pressed", "false");
            var yr = m === 0 || mo.m === 0 || (m === months.length - 1 && months[0].m === mo.m);
            b.innerHTML = MONTHS[mo.m] + (yr ? "<em>’" + String(mo.y).slice(2) + "</em>" : "") + "<span>" + mo.total + "</span>";
            b.setAttribute("aria-label", MONTHS_LONG[mo.m] + " " + mo.y + ", " + plural(mo.total, "contribution") + ", " + plural(mo.active, "active day") + ", branch " + ROMAN[mo.q]);
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
        sel.day = hover.day = hover.month = -1; sel.month = -1; routeCache.day = -1; staticTrace = null;
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
