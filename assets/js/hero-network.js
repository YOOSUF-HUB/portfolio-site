/* =========================================================
   HERO — Inside the brain (3D particles)
   A slowly turning 3D space of neurons made entirely of points:
   each neuron is a dense cell body with dendrites branching
   through space as fine dotted trails. Dotted nerve fibres
   (axons) link neighbouring neurons and carry light pulses;
   when a pulse arrives, that neuron fires and passes it on.
   Stars float through the space, linked to dendrite tips by
   faint lines. On load the stars gather into the neurons; on
   scroll they dissolve back into the night sky.
   Respects reduced motion and pauses when off screen.
   ========================================================= */

(function () {
    "use strict";

    var hero = document.querySelector(".section-hero-v1");
    var canvas = document.getElementById("hero-network");
    if (!hero || !canvas || !canvas.getContext) return;

    var ctx = canvas.getContext("2d");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    var W = 0, H = 0, DPR = 1;
    var CAM = 3.2;

    // Particle buffers
    var N = 0;
    var X, Y, Z, A, S, OWN, SX, SY, DL;   // world pos, alpha, size, owning neuron, scatter pos, delay
    var QX, QY, QD, QT;                    // projected x, y, depth factor, formation

    var neurons = [];   // { soma: [start, end), act }
    var axons = [];     // { path: [particle idx...], a, b }
    var links = [];     // [tipIdx, starIdx]
    var pulses = [];
    var view = { cx: 0, cy: 0, scale: 1 };
    var tilt = { yaw: 0, pitch: 0 };
    var mouse = { nx: 0, ny: 0, active: false };
    var startTime = performance.now();
    var lastPulseAt = 0;
    var running = false;

    /* ---------- Helpers ---------- */
    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    /* ---------- Build the 3D scene ---------- */
    function build() {
        var rand = mulberry32(31);
        var mobile = W < 768;

        function unit() {
            var u = rand() * 2 - 1, th = rand() * Math.PI * 2, r = Math.sqrt(1 - u * u);
            return [r * Math.cos(th), u, r * Math.sin(th)];
        }

        var px = [], py = [], pz = [], pa = [], ps = [], po = [];
        function add(x, y, z, a, s, owner) {
            px.push(x); py.push(y); pz.push(z); pa.push(a); ps.push(s); po.push(owner);
            return px.length - 1;
        }

        // Sample a quadratic curve as dotted particles
        function dotted(x0, y0, z0, x1, y1, z1, x2, y2, z2, spacing, a, s, owner) {
            var len = Math.hypot(x2 - x0, y2 - y0, z2 - z0);
            var n = Math.max(3, Math.round(len / spacing));
            var idx = [];
            for (var i = 0; i <= n; i++) {
                var t = i / n, u = 1 - t;
                idx.push(add(
                    u * u * x0 + 2 * u * t * x1 + t * t * x2,
                    u * u * y0 + 2 * u * t * y1 + t * t * y2,
                    u * u * z0 + 2 * u * t * z1 + t * t * z2,
                    a * (0.75 + rand() * 0.25), s, owner
                ));
            }
            return idx;
        }

        // 1. Neuron positions spread through the space
        var count = mobile ? 7 : 11;
        var centres = [];
        var tries = 0;
        while (centres.length < count && tries++ < 4000) {
            var c = [(rand() * 2 - 1) * 1.35, (rand() * 2 - 1) * 0.72, (rand() * 2 - 1) * 0.8];
            var ok = centres.every(function (o) { return Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 0.68; });
            if (ok) centres.push(c);
        }

        neurons = [];
        var tips = [];
        var spacing = mobile ? 0.013 : 0.0095;

        centres.forEach(function (c, ni) {
            var start = px.length;

            // Cell body: a dense glowing cluster
            for (var k = 0; k < (mobile ? 60 : 110); k++) {
                var d = unit(), r = 0.045 * Math.cbrt(rand());
                add(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r, 0.85 + rand() * 0.15, 1.5, ni);
            }
            var somaEnd = px.length;

            // Dendrites branching through 3D space
            function branch(o, dir, len, depth) {
                var e = [o[0] + dir[0] * len, o[1] + dir[1] * len, o[2] + dir[2] * len];
                var j = unit();
                var m = [
                    (o[0] + e[0]) / 2 + j[0] * len * 0.18,
                    (o[1] + e[1]) / 2 + j[1] * len * 0.18,
                    (o[2] + e[2]) / 2 + j[2] * len * 0.18,
                ];
                dotted(o[0], o[1], o[2], m[0], m[1], m[2], e[0], e[1], e[2], spacing, 0.85 - depth * 0.15, 1.35 - depth * 0.14, ni);

                if (depth < 3) {
                    var kids = rand() < 0.6 ? 2 : 1;
                    for (var q = 0; q < kids; q++) {
                        var p = unit();
                        var nd = [dir[0] + p[0] * 0.75, dir[1] + p[1] * 0.75, dir[2] + p[2] * 0.75];
                        var l = Math.hypot(nd[0], nd[1], nd[2]);
                        branch(e, [nd[0] / l, nd[1] / l, nd[2] / l], len * (0.62 + rand() * 0.15), depth + 1);
                    }
                } else {
                    tips.push(px.length - 1);
                }
            }

            var prim = 5 + Math.floor(rand() * 3);
            for (var b = 0; b < prim; b++) branch(c, unit(), 0.2 + rand() * 0.12, 0);

            neurons.push({ c: c, soma: [start, somaEnd], act: 0, links: [] });
        });

        // 2. Axons: dotted fibres to the two nearest neurons
        axons = [];
        var seen = {};
        centres.forEach(function (a, ai) {
            centres
                .map(function (b, bi) { return { bi: bi, d: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) }; })
                .filter(function (o) { return o.bi !== ai; })
                .sort(function (p, q) { return p.d - q.d; })
                .slice(0, 2)
                .forEach(function (o) {
                    var key = ai < o.bi ? ai + "-" + o.bi : o.bi + "-" + ai;
                    if (seen[key]) return;
                    seen[key] = true;
                    var b = centres[o.bi];
                    var j = unit();
                    var mid = [
                        (a[0] + b[0]) / 2 + j[0] * o.d * 0.25,
                        (a[1] + b[1]) / 2 + j[1] * o.d * 0.25,
                        (a[2] + b[2]) / 2 + j[2] * o.d * 0.25,
                    ];
                    var path = dotted(a[0], a[1], a[2], mid[0], mid[1], mid[2], b[0], b[1], b[2], spacing * 1.2, 0.5, 1.05, -1);
                    var idx = axons.length;
                    axons.push({ path: path, a: ai, b: o.bi });
                    neurons[ai].links.push(idx);
                    neurons[o.bi].links.push(idx);
                });
        });

        // 3. Stars floating through the space
        var starStart = px.length;
        var stars = mobile ? 260 : 520;
        for (var s = 0; s < stars; s++) {
            add((rand() * 2 - 1) * 2.3, (rand() * 2 - 1) * 1.35, (rand() * 2 - 1) * 1.5, 0.25 + rand() * 0.45, 1 + rand() * 0.5, -2);
        }

        // 4. Faint links from dendrite tips to their nearest star
        links = [];
        tips.forEach(function (t) {
            var best = -1, bd = 0.3;
            for (var i = starStart; i < px.length; i++) {
                var d = Math.hypot(px[i] - px[t], py[i] - py[t], pz[i] - pz[t]);
                if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0 && rand() < 0.7) links.push([t, best]);
        });

        // Typed buffers
        N = px.length;
        X = Float32Array.from(px); Y = Float32Array.from(py); Z = Float32Array.from(pz);
        A = Float32Array.from(pa); S = Float32Array.from(ps); OWN = Int16Array.from(po);
        SX = new Float32Array(N); SY = new Float32Array(N); DL = new Float32Array(N);
        QX = new Float32Array(N); QY = new Float32Array(N); QD = new Float32Array(N); QT = new Float32Array(N);
        for (var p = 0; p < N; p++) {
            SX[p] = rand() * W;
            SY[p] = rand() * H;
            DL[p] = rand() * 0.45;
        }

        view.scale = mobile ? W * 0.62 : Math.min(W * 0.4, H * 0.74);
        view.cx = W * 0.5;
        view.cy = H * (mobile ? 0.36 : 0.46);
        canvas.style.opacity = mobile ? "0.75" : "1";
    }

    function resize() {
        var rect = hero.getBoundingClientRect();
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = rect.width;
        H = rect.height;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        build();
        if (!running) draw(performance.now());
    }

    function formation(now) {
        if (reduceMotion.matches) return { intro: 1, scroll: 1 };
        var intro = clamp((now - startTime - 300) / 3200, 0, 1);
        var s = clamp((window.scrollY || 0) / (H * 0.75), 0, 1);
        return { intro: intro, scroll: 1 - easeInOut(s) };
    }

    /* ---------- Pulses along axons ---------- */
    function firePulse(axIndex, fromNeuron, now, hops) {
        var ax = axons[axIndex];
        pulses.push({ ax: axIndex, reverse: ax.a !== fromNeuron, born: now, dur: 1100 + Math.random() * 700, hops: hops });
    }

    function spawnPulse(now) {
        if (!axons.length) return;
        var i = Math.floor(Math.random() * axons.length);
        firePulse(i, Math.random() < 0.5 ? axons[i].a : axons[i].b, now, 2 + Math.floor(Math.random() * 3));
    }

    /* ---------- Draw ---------- */
    function draw(now) {
        ctx.clearRect(0, 0, W, H);

        var f = formation(now);
        var still = reduceMotion.matches;

        if (!still) {
            tilt.yaw += ((mouse.active ? mouse.nx * 0.45 : 0) - tilt.yaw) * 0.04;
            tilt.pitch += ((mouse.active ? mouse.ny * 0.25 : 0) - tilt.pitch) * 0.04;
        }
        var yaw = (still ? 0 : Math.sin(now * 0.00009) * 0.55) + tilt.yaw;
        var pitch = 0.08 + (still ? 0 : Math.sin(now * 0.00007) * 0.1) + tilt.pitch;
        var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);

        neurons.forEach(function (n) { n.act *= still ? 0 : 0.955; });

        // Project and draw every particle
        ctx.fillStyle = "#fff";
        for (var i = 0; i < N; i++) {
            var x1 = X[i] * cyw + Z[i] * syw;
            var z1 = -X[i] * syw + Z[i] * cyw;
            var y1 = Y[i] * cp - z1 * sp;
            var z2 = Y[i] * sp + z1 * cp;
            var den = CAM + z2;
            if (den < 0.4) { QT[i] = 0; continue; }
            var persp = CAM / den;

            var local = clamp((f.intro - DL[i]) / (1 - DL[i]), 0, 1);
            var t = easeInOut(local) * f.scroll;
            var depth = clamp(0.7 - z2 * 0.3, 0.25, 1);

            var bx = view.cx + x1 * view.scale * persp;
            var by = view.cy - y1 * view.scale * persp;
            var qx = lerp(SX[i], bx, t), qy = lerp(SY[i], by, t);
            QX[i] = qx; QY[i] = qy; QD[i] = depth; QT[i] = t;

            var own = OWN[i];
            var boost = own >= 0 ? neurons[own].act * 0.6 : 0;
            var alpha = lerp(0.4, Math.min(1, A[i] * depth + boost * depth), t);
            if (alpha < 0.02) continue;
            var size = lerp(1, S[i] * (0.55 + depth * 0.75) * persp * 0.8, t);
            if (size < 0.6) size = 0.6;

            ctx.globalAlpha = alpha;
            ctx.fillRect(qx - size / 2, qy - size / 2, size, size);
        }

        // Faint constellation links: stars ↔ dendrite tips
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.5;
        for (var l = 0; l < links.length; l++) {
            var p = links[l][0], q = links[l][1];
            var vis = Math.min(QT[p], QT[q]);
            if (vis < 0.05) continue;
            ctx.globalAlpha = 0.2 * vis * Math.min(QD[p], QD[q]);
            ctx.beginPath();
            ctx.moveTo(QX[p], QY[p]);
            ctx.lineTo(QX[q], QY[q]);
            ctx.stroke();
        }

        ctx.globalCompositeOperation = "lighter";

        // Cell-body glow (stronger when firing)
        neurons.forEach(function (n) {
            var ci = n.soma[0];
            if (QT[ci] < 0.3) return;
            var d = QD[ci], r = (10 + n.act * 22) * (0.5 + d);
            var g = ctx.createRadialGradient(QX[ci], QY[ci], 0, QX[ci], QY[ci], r);
            g.addColorStop(0, "rgba(255,255,255," + ((0.12 + n.act * 0.45) * d * QT[ci]).toFixed(3) + ")");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(QX[ci], QY[ci], r, 0, Math.PI * 2);
            ctx.fill();
        });

        // Pulses travelling along the dotted fibres
        if (!still) {
            for (var k = pulses.length - 1; k >= 0; k--) {
                var pu = pulses[k];
                var ax = axons[pu.ax];
                var prog = (now - pu.born) / pu.dur;
                var target = pu.reverse ? ax.a : ax.b;

                if (prog >= 1) {
                    var T = neurons[target];
                    T.act = 1;
                    pulses.splice(k, 1);
                    if (pu.hops > 1 && T.links.length > 1 && Math.random() < 0.85) {
                        var opts = T.links.filter(function (x) { return x !== pu.ax; });
                        firePulse(opts[Math.floor(Math.random() * opts.length)], target, now, pu.hops - 1);
                    }
                    continue;
                }

                var path = ax.path, L = path.length;
                var pos = (pu.reverse ? 1 - prog : prog) * (L - 1);
                var head = Math.round(pos);
                var dir = pu.reverse ? 1 : -1;
                var hp = path[clamp(head, 0, L - 1)];
                if (QT[hp] < 0.3) continue;

                // Tail: light up the dots behind the head
                ctx.fillStyle = "#fff";
                for (var s2 = 0; s2 < 14; s2++) {
                    var ti = head + dir * s2;
                    if (ti < 0 || ti >= L) break;
                    var pi = path[ti];
                    ctx.globalAlpha = (1 - s2 / 14) * 0.9 * QD[pi] * QT[pi];
                    var sz = 1.8 * (1 - s2 / 20) * (0.6 + QD[pi]);
                    ctx.fillRect(QX[pi] - sz / 2, QY[pi] - sz / 2, sz, sz);
                }

                // Glowing head
                var hr = 5 + QD[hp] * 9;
                var hg = ctx.createRadialGradient(QX[hp], QY[hp], 0, QX[hp], QY[hp], hr);
                hg.addColorStop(0, "rgba(255,255,255," + (0.85 * QD[hp] * QT[hp]).toFixed(3) + ")");
                hg.addColorStop(1, "rgba(255,255,255,0)");
                ctx.globalAlpha = 1;
                ctx.fillStyle = hg;
                ctx.beginPath();
                ctx.arc(QX[hp], QY[hp], hr, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    }

    function loop(now) {
        if (!running) return;
        var f = formation(now);
        if (f.intro > 0.8 && f.scroll > 0.5 && now - lastPulseAt > 320) {
            spawnPulse(now);
            lastPulseAt = now;
        }
        if (pulses.length > 30) pulses.splice(0, pulses.length - 30);
        draw(now);
        requestAnimationFrame(loop);
    }

    /* ---------- Run only while the hero is on screen ---------- */
    var heroVisible = true;

    function start() {
        if (running || reduceMotion.matches || document.hidden || !heroVisible) return;
        running = true;
        requestAnimationFrame(loop);
    }

    function stop() { running = false; }

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
        if (reduceMotion.matches) { stop(); pulses = []; draw(performance.now()); }
        else start();
    }
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", onMotionChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

    /* ---------- Cursor: the space turns gently toward it ---------- */
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
    start();
})();
