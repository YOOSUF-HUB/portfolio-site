/* =========================================================
   HERO — Living neural system (WebGL particles)

   A 3D field of neurons built entirely from fine points:
   - Soma: an irregular, layered cell body with a bright nucleus
     and a soft volumetric haze.
   - Dendrites: tapered, organically wandering branches that
     split into finer and sparser terminal twigs, with spines.
   - Axons: long, thin myelinated fibres (segmented sheaths with
     brighter nodes) ending in terminal arbors and synaptic
     boutons on a neighbouring neuron.
   Electrical impulses travel particle-by-particle along the
   axons; when one reaches its boutons they flash, the receiving
   soma flares and may fire its own axon in turn.

   On reveal the cloud gathers (somas first, then dendrites and
   axons growing outward). It turns slowly in 3D, tilts toward
   the cursor, and dissolves back into stars on scroll.

   Rendering: one WebGL1 point draw call. Geometry is built once
   on the CPU; projection, formation, motion and pulse lighting
   run in the vertex shader. No dependencies.
   Falls back to the night sky alone if WebGL is unavailable.
   ========================================================= */

(function () {
    "use strict";

    /* ---------- Tunables ---------- */
    var CONFIG = {
        count: 11,                 // neurons on desktop
        mobileCount: 7,            // neurons on phones
        spacing: 0.0042,           // world units between samples along a branch
        mobileSpacing: 0.0062,
        density: 1,                // particles per cross-section (multiplier)
        mobileDensity: 0.7,
        lowEndDensity: 0.6,        // ≤4 cores or ≤4 GB memory
        camera: 3.2,               // perspective distance
        brightness: 2.3,           // overall particle gain (impulses are separate)
        mobileBrightness: 2.0,
        view: {
            scale: 0.6,            // px per world unit, × hero height (desktop)
            mobileScale: 1.0,      // × hero width (phones)
        },
        stars: 900,
        mobileStars: 450,
        dust: 2200,
        mobileDust: 900,
        animation: {
            formationDuration: 3200,      // ms, from preloader exit
            maxPreloaderWait: 9000,       // never wait longer than this for the preloader
            rotationSpeed: 0.00011,       // rad per ms (phase of the slow swing)
            rotationRange: 0.24,          // yaw swing, radians
            tiltStrength: 0.14,           // cursor tilt, radians
            tiltEase: 0.035,
            parallax: 12,                 // px of cursor parallax for near particles
            spontaneous: [650, 1500],     // ms between spontaneous firings
            pulseSpeed: [0.42, 0.7],      // world units per second
            pulseTail: 0.16,              // world units of lit trail behind the head
            fireChance: 0.62,             // chance a receiving neuron fires on
            maxPulses: 24,
        },
    };

    var MAX_NEURONS = 16, MAX_PATHS = 32, MAX_PULSES = 24;

    // Particle kinds
    var STAR = 0, CORE = 1, SOMA = 2, DEND = 3, AXON = 4, BOUTON = 5, SPINE = 6, HAZE = 7, DUST = 8, LINK = 9;

    /* Palette — strictly neutral (darkroom monochrome). Every entry has
       r = g = b, so nothing in the hero can drift into a hue. The names
       describe a role, not a colour:
         BLUE   → STEEL  : mid grey for dust and dimmer cell tissue
         CYAN   → SILVER : light grey for dendrites and axon fibre
         ICE    → WHITE  : near-white for nuclei, nodes, boutons, stars
         VIOLET → GRAPHITE: darker grey used as the rare "accent" cell
         PULSE  → pure white impulses */
    var BLUE = [0.60, 0.60, 0.60];
    var CYAN = [0.80, 0.80, 0.80];
    var ICE = [0.94, 0.94, 0.94];
    var VIOLET = [0.46, 0.46, 0.46];
    var PULSE = [1.0, 1.0, 1.0];

    /* ---------- Composition: where neurons sit on screen ----------
       [screen x, screen y, depth z, size, type]. Kept clear of the
       hero text (heading, name, availability card, intro, buttons).
       Bigger/nearer neurons go where the hero is empty. */
    var LAYOUT_DESKTOP = [
        [0.47, 0.33, -0.45, 1.3, "pyramidal"],   // hero neuron, upper centre
        [0.83, 0.21, -0.15, 1.0, "multipolar"],
        [0.16, 0.23, 0.15, 1.0, "pyramidal"],
        [0.60, 0.63, 0.55, 0.8, "multipolar"],
        [0.33, 0.13, 0.80, 0.75, "bipolar"],
        [0.98, 0.50, 0.60, 0.85, "pyramidal"],
        [0.03, 0.66, 0.50, 0.85, "multipolar"],
        [0.41, 0.66, 0.95, 0.7, "multipolar"],
        [0.63, 0.13, 1.00, 0.7, "multipolar"],
        [0.29, 0.41, 1.15, 0.65, "bipolar"],
        [0.88, 0.63, 1.15, 0.6, "multipolar"],
    ];
    var LAYOUT_MOBILE = [
        [0.74, 0.445, -0.35, 1.2, "pyramidal"],  // gap between name and availability card
        [0.22, 0.085, 0.20, 0.9, "multipolar"],
        [0.86, 0.20, 0.50, 0.85, "multipolar"],
        [0.22, 0.61, 0.70, 0.8, "bipolar"],
        [0.80, 0.71, 0.90, 0.7, "multipolar"],
        [0.36, 0.95, 0.40, 0.9, "pyramidal"],
        [0.05, 0.36, 1.10, 0.65, "multipolar"],
    ];

    /* ---------- Setup ---------- */
    var hero = document.querySelector(".section-hero-v1");
    var canvas = document.getElementById("hero-network");
    if (!hero || !canvas) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    var lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;

    var gl = null, program = null, buffer = null, loc = {};
    var W = 0, H = 0, DPR = 1, maxDPR = 2;
    var builtFor = "";          // "<mobile>-<width>" the geometry was built for
    var N = 0;
    var neurons = [], paths = [], pulses = [], scheduled = [];
    var view = { cx: 0, cy: 0, scale: 1 };
    var tilt = { yaw: 0, pitch: 0, sx: 0, sy: 0 };
    var mouse = { nx: 0, ny: 0, active: false };
    var revealAt = 0, scriptStart = performance.now();
    var nextSpontaneous = 0, lastFrame = 0;
    var running = false, heroVisible = true;
    var perf = { frames: 0, total: 0 };

    // Uniform scratch buffers (allocated once)
    var uPulseData = new Float32Array(MAX_PULSES * 4);
    var uActData = new Float32Array(MAX_NEURONS);
    var uOffData = new Float32Array(MAX_NEURONS * 3);
    var uFlashData = new Float32Array(MAX_PATHS);

    /* ---------- Small maths helpers ---------- */
    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
    function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function len(a) { return Math.sqrt(dot(a, a)); }
    function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function basis(d) {
        var up = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
        var u = norm(cross(d, up));
        return [u, cross(d, u)];
    }

    /* =========================================================
       GEOMETRY
       ========================================================= */
    function build(mobile) {
        var rand = mulberry32(1307);
        var D = (mobile ? CONFIG.mobileDensity : CONFIG.density) * (lowEnd ? CONFIG.lowEndDensity : 1);
        var spacing = (mobile ? CONFIG.mobileSpacing : CONFIG.spacing) / Math.sqrt(lowEnd ? CONFIG.lowEndDensity : 1);
        var data = [];

        function unit() {
            var u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
            return [r * Math.cos(th), u, r * Math.sin(th)];
        }
        function gauss() {
            return Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
        }
        function jitterCol(c, amt) {
            var k = 1 + (rand() - 0.5) * amt;
            return [c[0] * k, c[1] * k, c[2] * k];
        }

        // One particle = 20 floats:
        // pos(3) scatter(3) colour(3) info(4: bright, size, delay, kind)
        // link(4: owner, path, pathS, sway) aux(3: phase, owner2, frac)
        function emit(p, col, bright, size, delay, kind, owner, path, pathS, sway, owner2, frac) {
            var s;
            if (kind === STAR) s = p;
            else s = [(rand() * 2 - 1) * 2.6, (rand() * 2 - 1) * 1.5, (rand() * 2 - 1) * 1.7];
            data.push(
                p[0], p[1], p[2], s[0], s[1], s[2],
                col[0], col[1], col[2],
                bright, size, delay, kind,
                owner, path, pathS, sway,
                rand(), owner2 === undefined ? -1 : owner2, frac || 0
            );
        }

        /* ---- Place neurons from the composition layout ---- */
        var layout = mobile ? LAYOUT_MOBILE : LAYOUT_DESKTOP;
        var count = Math.min(layout.length, mobile ? CONFIG.mobileCount : CONFIG.count);
        neurons = [];
        for (var i = 0; i < count; i++) {
            var L = layout[i];
            var z = L[2];
            var k = (CONFIG.camera + z) / CONFIG.camera;   // undo perspective so it lands on its screen spot
            var c = [
                (L[0] * W - view.cx) / view.scale * k,
                -(L[1] * H - view.cy) / view.scale * k,
                z,
            ];
            var hue = rand();
            var tint = mix3(BLUE, CYAN, hue * 0.55);
            if (i % 5 === 3) tint = mix3(tint, VIOLET, 0.45);          // a couple of violet-tinged cells
            var apical = norm(add([0, 1, 0], mul(unit(), 0.9)));
            neurons.push({
                c: c, size: L[3], type: L[4], tint: tint, apical: apical,
                R: 0.034 * L[3], out: [], act: 0, lastFire: -1e9,
                phase: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
                tips: [],
            });
        }

        /* ---- Stars: faint distant points giving the space volume ---- */
        var starCount = Math.round((mobile ? CONFIG.mobileStars : CONFIG.stars) * (lowEnd ? 0.7 : 1));
        var starPos = [];
        for (var s = 0; s < starCount; s++) {
            var sp = [(rand() * 2 - 1) * 2.8, (rand() * 2 - 1) * 1.6, (rand() * 2 - 1) * 1.9];
            starPos.push(sp);
            var b = 0.1 + Math.pow(rand(), 3) * 0.55;
            emit(sp, jitterCol(mix3(ICE, BLUE, rand() * 0.35), 0.1), b, 0.9 + rand() * 0.9, 0, STAR, -1, -1, 0, 0);
        }

        /* ---- Each neuron: soma, dendrites ---- */
        neurons.forEach(function (n, ni) {
            var c = n.c, R = n.R;
            var lobes = [];
            for (var q = 0; q < 4; q++) lobes.push({ d: unit(), k: 0.08 + rand() * 0.22 });

            // Irregular soma radius in direction d
            n.shapeR = function (d) {
                var r = 1;
                for (var j = 0; j < lobes.length; j++) {
                    var dp = dot(d, lobes[j].d);
                    if (dp > 0) r += lobes[j].k * dp * dp * dp;
                }
                var qa = dot(d, n.apical);
                if (n.type === "pyramidal") r += qa > 0 ? 0.75 * Math.pow(qa, 6) : -0.1 * qa * qa;
                if (n.type === "bipolar") r += 0.5 * Math.pow(Math.abs(qa), 5);
                return R * r;
            };

            // Nucleus: dense luminous core, slightly off-centre
            var nuc = add(c, mul(unit(), R * 0.22));
            var coreN = Math.round(320 * D * n.size);
            for (var a = 0; a < coreN; a++) {
                var g = [gauss(), gauss(), gauss()];
                emit(add(nuc, mul(g, R * 0.2)), jitterCol(mix3(ICE, n.tint, 0.25), 0.15),
                    0.26 + rand() * 0.16, 1.4, rand() * 0.06, CORE, ni, -1, 0, 0);
            }
            // Cytoplasm: volume filled, densest toward the middle
            var bodyN = Math.round(560 * D * n.size);
            for (var a2 = 0; a2 < bodyN; a2++) {
                var d = unit();
                var r = n.shapeR(d) * Math.pow(rand(), 0.75);
                emit(add(c, mul(d, r)), jitterCol(mix3(n.tint, ICE, 0.2 + rand() * 0.25), 0.2),
                    0.1 + rand() * 0.08, 1.25, 0.02 + rand() * 0.1, SOMA, ni, -1, 0, 0);
            }
            // Membrane: a thin, brighter shell that reads as the cell outline
            var memN = Math.round(760 * D * n.size);
            for (var a3 = 0; a3 < memN; a3++) {
                var dm = unit();
                var rm = n.shapeR(dm) * (0.94 + rand() * 0.1);
                emit(add(c, mul(dm, rm)), jitterCol(mix3(n.tint, CYAN, 0.3), 0.2),
                    0.14 + rand() * 0.1, 1.15, 0.05 + rand() * 0.1, SOMA, ni, -1, 0, 0);
            }
            // Haze: a few large, very faint points — an irregular glow, not a flat halo
            for (var h = 0; h < 22; h++) {
                var dh = unit();
                emit(add(c, mul(dh, n.shapeR(dh) * (0.3 + rand() * 1.4))), n.tint,
                    0.012 + rand() * 0.016, 16 + rand() * 26, 0.1 + rand() * 0.1, HAZE, ni, -1, 0, 0);
            }

            // Dendrites: tapered, wandering, branching
            function grow(o, dir, length, radius, depth, dist0, apicalTrunk) {
                var maxDepth = apicalTrunk ? 4 : 3;
                var step = spacing * (1 + depth * 0.2);
                var steps = Math.max(4, Math.round(length / step));
                var p = o.slice(), dv = dir.slice(), wander = unit();
                var sideAt = {};
                var sides = depth === 0 ? (apicalTrunk ? 4 + Math.floor(rand() * 3) : 1 + (rand() < 0.5 ? 1 : 0))
                    : (rand() < 0.42 - depth * 0.1 ? 1 : 0);
                for (var si = 0; si < sides; si++) sideAt[Math.floor(steps * (0.2 + rand() * 0.6))] = true;

                var r = radius;
                for (var st = 0; st <= steps; st++) {
                    var t = st / steps;
                    // Organic path: persistent wander, never a straight line
                    wander = norm(add(wander, mul(unit(), 0.45)));
                    dv = norm(add(dv, mul(wander, apicalTrunk && depth === 0 ? 0.035 : 0.06 + depth * 0.03)));
                    p = add(p, mul(dv, step));
                    r = radius * (1 - 0.55 * t);
                    var dist = dist0 + st * step;

                    // Fewer particles as the branch thins: dense near soma, dispersed at tips
                    var per = r / 0.0017 * D;
                    var cnt = Math.floor(per) + (rand() < per % 1 ? 1 : 0);
                    if (cnt < 1 && rand() < 0.75) cnt = 1;
                    var bs = basis(dv);
                    for (var e = 0; e < cnt; e++) {
                        var ang = rand() * 6.2832, rr = r * Math.sqrt(rand());
                        var pp = add(add(p, mul(bs[0], Math.cos(ang) * rr)), mul(bs[1], Math.sin(ang) * rr));
                        var col = mix3(n.tint, CYAN, depth * 0.12 + rand() * 0.15);
                        if (rand() < 0.035) col = mix3(col, VIOLET, 0.6);
                        emit(pp, jitterCol(col, 0.25),
                            (0.3 - depth * 0.035) * (0.7 + rand() * 0.5) * (1 - 0.3 * t),
                            1.25 - depth * 0.1,
                            Math.min(0.88, 0.16 + dist * 1.1 + rand() * 0.04),
                            DEND, ni, -1, 0, dist);
                    }

                    // Dendritic spines: tiny points just off the branch (reward a close look)
                    if (depth >= 1 && rand() < 0.2 * D) {
                        var sa = rand() * 6.2832, off = r + 0.003 + rand() * 0.006;
                        emit(add(add(p, mul(bs[0], Math.cos(sa) * off)), mul(bs[1], Math.sin(sa) * off)),
                            ICE, 0.22 + rand() * 0.12, 1.0, Math.min(0.92, 0.2 + dist * 1.1), SPINE, ni, -1, 0, dist);
                    }

                    // Side branch at varied angles
                    if (sideAt[st] && depth < maxDepth) {
                        var pr = basis(dv), ang2 = rand() * 6.2832;
                        var side = add(mul(pr[0], Math.cos(ang2)), mul(pr[1], Math.sin(ang2)));
                        var spread = 0.6 + rand() * 0.9;    // ~30–60°
                        grow(p, norm(add(dv, mul(side, spread))),
                            length * (0.4 + rand() * 0.3) * (1 - t * 0.4), r * 0.72, depth + 1, dist, false);
                    }
                }

                // Terminal: bifurcate or end as a fine tip
                var splitP = apicalTrunk ? 0.95 : 0.66 - depth * 0.1;
                if (depth < maxDepth && rand() < splitP) {
                    var pb = basis(dv), a0 = rand() * 6.2832;
                    var axis = add(mul(pb[0], Math.cos(a0)), mul(pb[1], Math.sin(a0)));
                    for (var kk = 0; kk < 2; kk++) {
                        var sgn = kk === 0 ? 1 : -1;
                        var spr = 0.35 + rand() * 0.45;
                        grow(p, norm(add(dv, mul(axis, sgn * spr))),
                            length * (0.5 + rand() * 0.25), r * 0.85, depth + 1, dist0 + steps * step, apicalTrunk && kk === 0);
                    }
                } else {
                    n.tips.push(p);
                }
            }

            // Hillock direction: away from the apical dendrite
            n.hillock = n.type === "pyramidal" ? norm(add(mul(n.apical, -1), mul(unit(), 0.35))) : unit();

            var S = n.size;
            if (n.type === "pyramidal") {
                // Long apical trunk with oblique branches and a terminal tuft
                grow(add(c, mul(n.apical, n.shapeR(n.apical) * 0.9)), n.apical,
                    (0.32 + rand() * 0.12) * S, 0.0085 * S, 0, 0, true);
                // Basal dendrites around the base
                var basal = 4 + Math.floor(rand() * 3);
                for (var bi = 0; bi < basal; bi++) {
                    var bd = unit();
                    if (dot(bd, n.apical) > 0.15) bd = norm(add(bd, mul(n.apical, -1.2)));
                    grow(add(c, mul(bd, n.shapeR(bd) * 0.9)), bd, (0.14 + rand() * 0.1) * S, 0.0062 * S, 0, 0, false);
                }
            } else if (n.type === "bipolar") {
                [1, -1].forEach(function (sg) {
                    var bd2 = mul(n.apical, sg);
                    grow(add(c, mul(bd2, n.shapeR(bd2) * 0.9)), bd2, (0.24 + rand() * 0.1) * S, 0.0075 * S, 0, 0, false);
                });
                for (var bb = 0; bb < 2; bb++) {
                    var bd3 = unit();
                    grow(add(c, mul(bd3, n.shapeR(bd3) * 0.9)), bd3, (0.1 + rand() * 0.06) * S, 0.0045 * S, 1, 0, false);
                }
            } else {
                var prim = 5 + Math.floor(rand() * 3);
                for (var mi = 0; mi < prim; mi++) {
                    var md = unit();
                    if (dot(md, n.hillock) > 0.6) md = norm(add(md, mul(n.hillock, -1)));
                    grow(add(c, mul(md, n.shapeR(md) * 0.9)), md, (0.16 + rand() * 0.12) * S, 0.0068 * S, 0, 0, false);
                }
            }
        });

        /* ---- Axons: source hillock → boutons on a neighbour ---- */
        paths = [];

        function buildAxon(src, dst, start, startDir, startS, initialSegment) {
            if (paths.length >= MAX_PATHS) return;
            var pid = paths.length;
            var A = neurons[src], B = neurons[dst];
            var target = add(B.c, mul(unit(), (0.05 + rand() * 0.07) * B.size));
            var dist = len(sub(target, start));
            var toward = norm(sub(target, start));
            var p1 = add(add(start, mul(startDir, dist * 0.35)), mul(unit(), dist * 0.12));
            var p2 = add(add(target, mul(toward, -dist * 0.35)), mul(unit(), dist * 0.18));
            var wob = norm(cross(toward, unit()));
            var wob2 = cross(toward, wob);
            var wf = 6 + rand() * 6, wph = rand() * 6.28;

            var M = Math.ceil(dist * 1.25 / (spacing * 0.9));
            var prev = start, s = startS;
            var sheath = 0.055 + rand() * 0.02, gap = 0.009, segPos = 0;
            var trunkEnd = 0.88;   // last 12% is unmyelinated before the terminal arbor

            for (var m = 1; m <= M; m++) {
                var t = m / M, u = 1 - t;
                var pt = [
                    u * u * u * start[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * target[0],
                    u * u * u * start[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * target[1],
                    u * u * u * start[2] + 3 * u * u * t * p1[2] + 3 * u * t * t * p2[2] + t * t * t * target[2],
                ];
                // Gentle meander so the fibre never looks like a perfect curve
                var wv = Math.sin(t * wf + wph) * Math.sin(t * Math.PI) * dist * 0.025;
                pt = add(add(pt, mul(wob, wv)), mul(wob2, Math.cos(t * wf * 0.7 + wph) * Math.sin(t * Math.PI) * dist * 0.015));
                var dirv = sub(pt, prev);
                var dl = len(dirv);
                s += dl;
                segPos += dl;
                prev = pt;
                var dlay = Math.min(0.92, 0.38 + 0.5 * t);
                var bs = basis(norm(dirv));
                var axCol = mix3(CYAN, ICE, 0.15 + rand() * 0.1);

                if (initialSegment && s - startS < 0.05) {
                    // Initial segment: a short tapering cone out of the hillock
                    var rr0 = 0.006 * (1 - (s - startS) / 0.05) + 0.0015;
                    for (var e0 = 0; e0 < 3; e0++) {
                        var an0 = rand() * 6.2832, q0 = rr0 * Math.sqrt(rand());
                        emit(add(add(pt, mul(bs[0], Math.cos(an0) * q0)), mul(bs[1], Math.sin(an0) * q0)),
                            jitterCol(mix3(A.tint, CYAN, 0.4), 0.2), 0.26, 1.15, dlay, AXON, src, pid, s, 0, dst, t);
                    }
                } else if (t < trunkEnd) {
                    // Myelinated: sheath segments separated by brighter nodes of Ranvier
                    var cyc = segPos % (sheath + gap);
                    if (cyc < sheath) {
                        var prof = Math.pow(Math.sin(Math.PI * cyc / sheath), 0.35);   // bead-like segment ends
                        var rs = 0.0032 * prof * (0.85 + 0.3 * (1 - t));
                        var cnt = rand() < 0.35 * D ? 2 : 1;
                        for (var e1 = 0; e1 < cnt; e1++) {
                            var an1 = rand() * 6.2832;
                            emit(add(add(pt, mul(bs[0], Math.cos(an1) * rs)), mul(bs[1], Math.sin(an1) * rs)),
                                jitterCol(axCol, 0.2), 0.2 + rand() * 0.08, 1.05, dlay, AXON, src, pid, s, 0, dst, t);
                        }
                    } else if (rand() < 0.8) {
                        emit(pt, ICE, 0.42, 1.35, dlay, AXON, src, pid, s, 0, dst, t);
                    }
                } else if (rand() < 0.8) {
                    // Unmyelinated pre-terminal: thinner, sparser
                    emit(pt, jitterCol(axCol, 0.2), 0.17, 0.95, dlay, AXON, src, pid, s, 0, dst, t);
                }
            }

            // Terminal arbor: a few fine twigs, each ending in a synaptic bouton
            var trunkS = s;
            var twigs = 3 + Math.floor(rand() * 3);
            var maxS = trunkS;
            for (var tw = 0; tw < twigs; tw++) {
                var tp = prev.slice(), td = norm(add(norm(sub(B.c, prev)), mul(unit(), 1.1)));
                var tl = (0.035 + rand() * 0.07) * B.size, ts = trunkS;
                var tsteps = Math.max(3, Math.round(tl / spacing));
                for (var q = 0; q < tsteps; q++) {
                    td = norm(add(td, mul(unit(), 0.3)));
                    tp = add(tp, mul(td, spacing));
                    ts += spacing;
                    if (rand() < 0.85) emit(tp, jitterCol(CYAN, 0.2), 0.15, 0.9, 0.9, AXON, src, pid, ts, 0, dst, 1);
                }
                var bn = Math.round((12 + rand() * 10) * Math.max(0.6, D));
                for (var bq = 0; bq < bn; bq++) {
                    emit(add(tp, [gauss() * 0.0032, gauss() * 0.0032, gauss() * 0.0032]),
                        jitterCol(ICE, 0.15), 0.2 + rand() * 0.1, 1.2, 0.92, BOUTON, src, pid, ts, 0, dst, 1);
                }
                if (ts > maxS) maxS = ts;
            }

            paths.push({ src: src, dst: dst, len: maxS, startS: startS, flash: 0, points: null });
            A.out.push(pid);
            return { pid: pid, trunk: { start: start, target: target, p1: p1, p2: p2 } };
        }

        // Wire each neuron to one of its nearest neighbours; some send a collateral to a second one
        var used = {};
        neurons.forEach(function (n, ni) {
            var order = neurons
                .map(function (m, mj) { return { j: mj, d: len(sub(m.c, n.c)) }; })
                .filter(function (o) { return o.j !== ni; })
                .sort(function (p, q) { return p.d - q.d; });
            var pick = order[rand() < 0.65 || order.length < 2 ? 0 : 1];
            if (used[pick.j + "-" + ni] && order[1]) pick = order[1];     // avoid an exact back-and-forth pair
            used[ni + "-" + pick.j] = true;
            var start = add(n.c, mul(n.hillock, n.shapeR(n.hillock)));
            var main = buildAxon(ni, pick.j, start, n.hillock, 0, true);
            if (!main) return;

            if (order.length > 2 && rand() < 0.45) {
                // Collateral: branches off the main trunk ~30% along it
                var tr = main.trunk, t = 0.25 + rand() * 0.15, u = 1 - t;
                var bp = [0, 1, 2].map(function (k) {
                    return u * u * u * tr.start[k] + 3 * u * u * t * tr.p1[k] + 3 * u * t * t * tr.p2[k] + t * t * t * tr.target[k];
                });
                var other = order[pick === order[0] ? 1 : 0].j;
                var sApprox = len(sub(bp, tr.start)) * 1.08;
                buildAxon(ni, other, bp, norm(sub(neurons[other].c, bp)), sApprox, false);
            }
        });

        /* ---- Neuropil dust: very faint points drifting around the cells ---- */
        var dustCount = Math.round((mobile ? CONFIG.mobileDust : CONFIG.dust) * (lowEnd ? 0.6 : 1));
        for (var du = 0; du < dustCount; du++) {
            var nn = neurons[Math.floor(rand() * neurons.length)];
            var dp2 = add(nn.c, [gauss() * 0.28 * nn.size, gauss() * 0.22 * nn.size, gauss() * 0.28 * nn.size]);
            emit(dp2, jitterCol(mix3(BLUE, VIOLET, rand() * 0.45), 0.2), 0.05 + rand() * 0.07, 1.0, rand() * 0.9, DUST, -1, -1, 0, 0);
        }

        /* ---- Faint dotted constellation lines: dendrite tips → nearby stars ---- */
        neurons.forEach(function (n) {
            n.tips.forEach(function (tip) {
                if (rand() > 0.22) return;
                var best = null, bd = 0.32;
                for (var si = 0; si < starPos.length; si++) {
                    var dd = len(sub(starPos[si], tip));
                    if (dd < bd) { bd = dd; best = starPos[si]; }
                }
                if (!best) return;
                var stepsL = Math.max(3, Math.round(bd / 0.014));
                for (var li = 1; li < stepsL; li++) {
                    var tt = li / stepsL;
                    emit(add(tip, mul(sub(best, tip), tt)), ICE, 0.09 * (1 - tt * 0.5), 0.9, 0.9, LINK, -1, -1, 0, 0);
                }
            });
        });

        N = data.length / 20;
        return new Float32Array(data);
    }

    /* =========================================================
       WEBGL
       ========================================================= */
    var VERT = [
        "precision highp float;",
        "#define MAXP " + MAX_PULSES,
        "#define MAXN " + MAX_NEURONS,
        "#define MAXA " + MAX_PATHS,
        "attribute vec3 aPos; attribute vec3 aScatter; attribute vec3 aColor;",
        "attribute vec4 aInfo; attribute vec4 aLink; attribute vec3 aAux;",
        "uniform vec2 uRes; uniform vec3 uView; uniform float uDPR, uCam, uTime, uIntro, uScroll, uPivot, uGain;",
        "uniform vec4 uRot; uniform vec2 uShift; uniform vec3 uPulseColor;",
        "uniform vec4 uPulse[MAXP]; uniform float uAct[MAXN]; uniform vec3 uOff[MAXN]; uniform float uFlash[MAXA];",
        "varying vec3 vColor;",
        "void main() {",
        "  float kind = aInfo.w; float ph = aAux.x;",
        "  vec3 p = aPos; float act = 0.0;",
        // Per-neuron drift (axons blend between their two neurons)
        "  if (aLink.x > -0.5) {",
        "    int o = int(aLink.x + 0.5); vec3 off = uOff[o]; act = uAct[o];",
        "    if (aAux.y > -0.5) { int o2 = int(aAux.y + 0.5); off = mix(off, uOff[o2], aAux.z); act = 0.0; }",
        "    p += off;",
        "  }",
        // Living motion: dendrites sway coherently, soma membrane breathes, dust drifts
        "  float sw = aLink.w;",
        "  if (sw > 0.0) p += vec3(sin(uTime*0.55 + aPos.y*6.0 + aPos.z*3.0), sin(uTime*0.47 + aPos.z*6.0 + aPos.x*2.0), sin(uTime*0.6 + aPos.x*6.0 + aPos.y*3.0)) * 0.014 * sw;",
        "  if (kind > 0.5 && kind < 2.5) p += vec3(sin(uTime*1.1 + ph*50.0), cos(uTime*0.9 + ph*41.0), sin(uTime*1.3 + ph*37.0)) * 0.0011;",
        "  if (kind > 7.5 && kind < 8.5) p += vec3(sin(uTime*0.13 + ph*40.0), cos(uTime*0.11 + ph*31.0), sin(uTime*0.09 + ph*23.0)) * 0.03;",
        // Formation: somas first, then branches grow outward; scroll dissolves back to stars
        "  float form = 1.0;",
        "  if (kind > 0.5) { float l = clamp((uIntro - aInfo.z*0.6) / 0.4, 0.0, 1.0); form = l*l*(3.0-2.0*l) * uScroll; }",
        "  float fl = form * (1.0 - form);",
        "  vec3 w = mix(aScatter, p, form) + vec3(sin(ph*37.0 + uTime*0.4), cos(ph*53.0 + uTime*0.35), sin(ph*71.0 + uTime*0.3)) * fl * 0.5;",
        // Rotate about a pivot in the middle of the field, then project
        "  w.z -= uPivot;",
        "  float x1 = w.x*uRot.x + w.z*uRot.y;",
        "  float z1 = -w.x*uRot.y + w.z*uRot.x;",
        "  float y1 = w.y*uRot.z - z1*uRot.w;",
        "  float z2 = w.y*uRot.w + z1*uRot.z + uPivot;",
        "  float den = uCam + z2;",
        "  if (den < 0.35) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }",
        "  float persp = uCam / den;",
        "  vec2 sp = vec2(uView.x + x1*uView.z*persp, uView.y - y1*uView.z*persp) + uShift * (persp - 0.75);",
        "  gl_Position = vec4(sp.x / uRes.x * 2.0 - 1.0, 1.0 - sp.y / uRes.y * 2.0, 0.0, 1.0);",
        "  float depth = clamp(0.74 - z2*0.34, 0.14, 1.0);",
        // Electrical impulses: light individual particles along the axon
        "  float glow = 0.0;",
        "  if (aLink.y > -0.5) {",
        "    for (int k = 0; k < MAXP; k++) {",
        "      vec4 P = uPulse[k];",
        "      if (abs(P.x - aLink.y) < 0.5) {",
        "        float d = P.y - aLink.z;",
        "        if (d > -0.01 && d < P.w) {",
        "          float f = 1.0 - max(d, 0.0) / P.w;",
        "          glow += P.z * (f*f*1.6 + exp(-d*d*20000.0) * 5.0);",
        "        }",
        "      }",
        "    }",
        "    float fa = uFlash[int(aLink.y + 0.5)];",
        "    if (kind > 4.5 && kind < 5.5) glow += fa * 1.8;",
        "    else if (aAux.z > 0.99) glow += fa * 0.5;",
        "  }",
        // Brightness: base, firing flare, scattered → star-like, depth
        "  float b = aInfo.x;",
        "  if (kind > 0.5 && kind < 2.5) b += act * 0.5;",
        "  else if (kind > 2.5 && kind < 3.5 || kind > 5.5 && kind < 6.5) b += act * 0.45 * exp(-sw * 7.0);",
        "  else if (kind > 6.5 && kind < 7.5) b += act * 0.05;",
        "  float scattered = kind > 6.5 && kind < 7.5 ? 0.0 : 0.16;",
        "  b = mix(scattered, b, form);",
        "  if (kind < 0.5) b *= 0.7 + 0.3 * sin(uTime * (0.5 + ph * 1.5) + ph * 30.0);",
        "  b *= depth * (kind < 0.5 ? 1.0 : uGain);",
        "  vec3 col = mix(aColor, vec3(dot(aColor, vec3(0.3, 0.5, 0.2))) * 0.85, (1.0 - depth) * 0.55);",
        "  col = col * b + uPulseColor * glow * depth * form;",
        "  float size = aInfo.y * mix(1.0, persp * (0.55 + depth * 0.6), form);",
        "  if (kind > 6.5 && kind < 7.5) size = aInfo.y * persp;",
        "  size *= 1.0 + min(glow, 3.0) * 0.35 * form;",
        "  size *= uDPR;",
        "  if (size < 1.0) { col *= size; size = 1.0; }",
        "  gl_PointSize = size;",
        "  vColor = col;",
        "}",
    ].join("\n");

    var FRAG = [
        "precision mediump float;",
        "varying vec3 vColor;",
        "void main() {",
        "  vec2 c = gl_PointCoord * 2.0 - 1.0;",
        "  float r2 = dot(c, c);",
        "  if (r2 > 1.0) discard;",
        "  vec3 col = vColor * exp(-r2 * 3.0);",
        "  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b)));",
        "}",
    ].join("\n");

    function initGL() {
        var opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" };
        gl = canvas.getContext("webgl", opts) || canvas.getContext("experimental-webgl", opts);
        if (!gl) return false;

        function compile(type, src) {
            var sh = gl.createShader(type);
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                if (window.console) console.warn("[hero] shader:", gl.getShaderInfoLog(sh));
                return null;
            }
            return sh;
        }
        var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
        gl.useProgram(program);

        ["aPos", "aScatter", "aColor", "aInfo", "aLink", "aAux"].forEach(function (n) { loc[n] = gl.getAttribLocation(program, n); });
        ["uRes", "uView", "uDPR", "uCam", "uGain", "uTime", "uIntro", "uScroll", "uPivot", "uRot", "uShift", "uPulseColor",
            "uPulse", "uAct", "uOff", "uFlash"].forEach(function (n) {
            loc[n] = gl.getUniformLocation(program, n) || gl.getUniformLocation(program, n + "[0]");
        });

        buffer = gl.createBuffer();
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);          // additive light
        gl.clearColor(0, 0, 0, 0);
        return true;
    }

    function upload(arr) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        var stride = 20 * 4;
        var layout = [["aPos", 3, 0], ["aScatter", 3, 3], ["aColor", 3, 6], ["aInfo", 4, 9], ["aLink", 4, 13], ["aAux", 3, 17]];
        layout.forEach(function (l) {
            var a = loc[l[0]];
            if (a < 0) return;
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, l[1], gl.FLOAT, false, stride, l[2] * 4);
        });
    }

    /* =========================================================
       SIZE / BUILD
       ========================================================= */
    function resize() {
        var rect = hero.getBoundingClientRect();
        W = rect.width;
        H = rect.height;
        if (!W || !H) return;
        DPR = Math.min(window.devicePixelRatio || 1, maxDPR);
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        gl.viewport(0, 0, canvas.width, canvas.height);

        var mobile = W < 768;
        view.scale = mobile ? W * CONFIG.view.mobileScale : Math.min(H * CONFIG.view.scale, W * 0.42);
        view.cx = W * 0.5;
        view.cy = H * 0.5;
        canvas.style.opacity = mobile ? "0.8" : "1";

        // Rebuild geometry only when the width changes (mobile URL bars change only the height)
        var key = (mobile ? "m" : "d") + "-" + Math.round(W);
        if (key !== builtFor) {
            builtFor = key;
            upload(build(mobile));
            pulses = [];
            scheduled = [];
        }
        if (!running) render(performance.now());
    }

    /* =========================================================
       ACTIVITY: impulses, synapses, firing
       ========================================================= */
    function rnd(r) { return r[0] + Math.random() * (r[1] - r[0]); }

    function fire(ni, now, intensity) {
        var n = neurons[ni];
        if (!n || now - n.lastFire < 1600) return;
        n.lastFire = now;
        n.act = Math.max(n.act, 0.55 * intensity);
        var speed = rnd(CONFIG.animation.pulseSpeed);
        for (var i = 0; i < n.out.length; i++) {
            if (pulses.length >= CONFIG.animation.maxPulses) break;
            pulses.push({ path: n.out[i], born: now, speed: speed, intensity: intensity, arrived: false });
        }
    }

    function updateActivity(now, dt, f) {
        var A = CONFIG.animation;
        var calm = f.scroll;                       // activity fades as you scroll away

        // Spontaneous firing at irregular intervals
        if (f.intro > 0.85 && calm > 0.4 && now >= nextSpontaneous) {
            fire(Math.floor(Math.random() * neurons.length), now, 0.75 + Math.random() * 0.45);
            nextSpontaneous = now + rnd(A.spontaneous) / Math.max(calm, 0.4);
        }

        // Chained firings waiting on synaptic delay
        for (var s = scheduled.length - 1; s >= 0; s--) {
            if (now >= scheduled[s].at) {
                if (calm > 0.4) fire(scheduled[s].ni, now, scheduled[s].intensity);
                scheduled.splice(s, 1);
            }
        }

        // Travel, arrival, synaptic flash, receiving soma flare
        for (var i = pulses.length - 1; i >= 0; i--) {
            var pu = pulses[i], path = paths[pu.path];
            var head = pu.speed * (now - pu.born) / 1000;
            pu.head = head;
            if (!pu.arrived && head >= path.len - 0.005) {
                pu.arrived = true;
                path.flash = Math.max(path.flash, pu.intensity);
                var dst = neurons[path.dst];
                dst.act = Math.max(dst.act, 0.95 * pu.intensity);
                if (Math.random() < A.fireChance) {
                    scheduled.push({ ni: path.dst, at: now + 220 + Math.random() * 520, intensity: pu.intensity * (0.85 + Math.random() * 0.2) });
                }
            }
            if (head > path.len + A.pulseTail) pulses.splice(i, 1);
        }

        var decayAct = Math.exp(-dt / 520), decayFlash = Math.exp(-dt / 380);
        for (var n = 0; n < neurons.length; n++) neurons[n].act *= decayAct;
        for (var p = 0; p < paths.length; p++) paths[p].flash *= decayFlash;
    }

    /* =========================================================
       FRAME
       ========================================================= */
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function formation(now) {
        if (reduceMotion.matches) return { intro: 1, scroll: 1 };
        var intro = revealAt ? clamp((now - revealAt) / CONFIG.animation.formationDuration, 0, 1) : 0;
        var s = clamp((window.scrollY || 0) / (H * 0.75), 0, 1);
        return { intro: intro, scroll: 1 - easeInOut(s) };
    }

    function render(now) {
        if (!gl || !N) return;
        var A = CONFIG.animation;
        var still = reduceMotion.matches;
        var f = formation(now);
        var t = still ? 0 : now / 1000;

        // Camera: slow swing + eased cursor tilt and parallax
        var tx = mouse.active && !still ? mouse.nx : 0, ty = mouse.active && !still ? mouse.ny : 0;
        tilt.yaw += (tx * A.tiltStrength - tilt.yaw) * A.tiltEase;
        tilt.pitch += (ty * A.tiltStrength * 0.6 - tilt.pitch) * A.tiltEase;
        tilt.sx += (-tx * A.parallax - tilt.sx) * A.tiltEase;
        tilt.sy += (-ty * A.parallax - tilt.sy) * A.tiltEase;
        var yaw = (still ? 0 : Math.sin(now * A.rotationSpeed) * A.rotationRange) + tilt.yaw;
        var pitch = 0.05 + (still ? 0 : Math.sin(now * A.rotationSpeed * 0.77 + 1.3) * A.rotationRange * 0.25) + tilt.pitch;

        // Per-neuron drift and activation
        for (var i = 0; i < MAX_NEURONS; i++) {
            var n = neurons[i];
            if (!n || still) {
                uOffData[i * 3] = uOffData[i * 3 + 1] = uOffData[i * 3 + 2] = 0;
                uActData[i] = n ? n.act : 0;
                continue;
            }
            var amp = 0.016 * n.size;
            uOffData[i * 3] = Math.sin(now * 0.00021 + n.phase[0]) * amp;
            uOffData[i * 3 + 1] = Math.sin(now * 0.00017 + n.phase[1]) * amp;
            uOffData[i * 3 + 2] = Math.sin(now * 0.00019 + n.phase[2]) * amp;
            uActData[i] = n.act;
        }
        for (var p = 0; p < MAX_PATHS; p++) uFlashData[p] = paths[p] ? paths[p].flash : 0;
        for (var k = 0; k < MAX_PULSES; k++) {
            var pu = pulses[k];
            uPulseData[k * 4] = pu && !still ? pu.path : -10;
            uPulseData[k * 4 + 1] = pu ? pu.head || 0 : 0;
            uPulseData[k * 4 + 2] = pu ? pu.intensity * f.scroll : 0;
            uPulseData[k * 4 + 3] = A.pulseTail;
        }

        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(loc.uRes, W, H);
        gl.uniform3f(loc.uView, view.cx, view.cy, view.scale);
        gl.uniform1f(loc.uDPR, DPR);
        gl.uniform1f(loc.uCam, CONFIG.camera);
        gl.uniform1f(loc.uGain, W < 768 ? CONFIG.mobileBrightness : CONFIG.brightness);
        gl.uniform1f(loc.uTime, t);
        gl.uniform1f(loc.uIntro, f.intro);
        gl.uniform1f(loc.uScroll, f.scroll);
        gl.uniform1f(loc.uPivot, 0.4);
        gl.uniform4f(loc.uRot, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
        gl.uniform2f(loc.uShift, tilt.sx, tilt.sy);
        gl.uniform3f(loc.uPulseColor, PULSE[0], PULSE[1], PULSE[2]);
        gl.uniform4fv(loc.uPulse, uPulseData);
        gl.uniform1fv(loc.uAct, uActData);
        gl.uniform3fv(loc.uOff, uOffData);
        gl.uniform1fv(loc.uFlash, uFlashData);
        gl.drawArrays(gl.POINTS, 0, N);
    }

    function revealed(now) {
        if (revealAt) return true;
        // Start forming once the page preloader has gone (or after a safety timeout)
        if (!document.querySelector(".preloader") || now - scriptStart > CONFIG.animation.maxPreloaderWait) {
            revealAt = now;
            return true;
        }
        return false;
    }

    function loop(now) {
        if (!running) return;
        requestAnimationFrame(loop);
        if (!revealed(now)) return;               // hidden behind the preloader: skip the work

        var dt = lastFrame ? Math.min(now - lastFrame, 50) : 16;
        lastFrame = now;
        var f = formation(now);
        updateActivity(now, dt, f);
        render(now);

        // Adaptive quality: drop resolution on devices that can't keep up
        if (f.intro >= 1 && perf.frames < 120) {
            perf.frames++;
            perf.total += dt;
            if (perf.frames === 120 && perf.total / 120 > 24 && maxDPR > 1) {
                maxDPR = 1;
                resize();
            }
        }
    }

    /* ---------- Run only while the hero is on screen ---------- */
    function start() {
        if (running || reduceMotion.matches || document.hidden || !heroVisible) return;
        running = true;
        lastFrame = 0;
        requestAnimationFrame(loop);
    }
    function stop() { running = false; }

    /* ---------- Init ---------- */
    if (!initGL()) {
        canvas.style.display = "none";            // graceful fallback: the night sky shows alone
        return;
    }

    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); stop(); }, false);
    canvas.addEventListener("webglcontextrestored", function () {
        builtFor = "";
        if (initGL()) { resize(); start(); }
    }, false);

    if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
            heroVisible = entries[0].isIntersecting;
            if (heroVisible) start(); else stop();
        }).observe(hero);
    }

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop(); else start();
    });

    function onMotionChange() {
        if (reduceMotion.matches) { stop(); pulses = []; render(performance.now()); }
        else start();
    }
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", onMotionChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

    // Cursor: the space tilts gently toward it (canvas ignores pointer events, so text and buttons stay usable)
    hero.addEventListener("mousemove", function (e) {
        if (!finePointer.matches) return;
        var r = hero.getBoundingClientRect();
        mouse.nx = (e.clientX - r.left) / r.width - 0.5;
        mouse.ny = (e.clientY - r.top) / r.height - 0.5;
        mouse.active = true;
    });
    hero.addEventListener("mouseleave", function () { mouse.active = false; });

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    resize();
    // Inspection hook for visual testing only (add ?herodebug to the URL)
    if (/[?&]herodebug/.test(location.search)) {
        console.log("[hero] particles:", N, "paths:", paths.length);
        window.__heroNetwork = {
            fire: function (ni) { neurons[ni].lastFire = -1e9; fire(ni, performance.now(), 1); },
            state: function () { return { N: N, pulses: pulses.map(function (p) { return [p.path, +(p.head || 0).toFixed(3), +paths[p.path].len.toFixed(3)]; }), act: neurons.map(function (n) { return +n.act.toFixed(2); }) }; },
        };
    }
    start();
})();
