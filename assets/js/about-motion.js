/* =========================================================
   ABOUT — "The Engineer in Motion"

   1. Entrance reveals (heading lines, portrait wipe, columns).
   2. Disciplines: hover (fine pointers), tap / click or keyboard
      focus selects one of three pathways. The card opens its
      description, its branch brightens, a pulse runs from the
      laptop to its node and the other branches dim.
   3. The signal: a thin particle pathway drawn on a Canvas 2D.
        source   the laptop screen in the photograph — a fixed
                 point in image coordinates, mapped through the
                 object-fit crop so it tracks every breakpoint
        trunk    desktop: out of the photo, across into the
                 gutter, straight down to a split point
                 ≤991px: out of the photo onto a rail at the
                 left edge, straight down past the biography
        branches three cubic Béziers, one per discipline node
                 (desktop: fanned from one split point;
                  ≤991px: peeling off the rail at each card)
      Particles are sampled along those curves (no neighbour
      graphs, no random links). They drift slowly outwards;
      pulses travel source → node along the same curves.
      Nothing is drawn over the face or over text.

   Seeded, so the particle layout is identical on every rebuild.
   Pauses off-screen and in hidden tabs; one still frame with
   prefers-reduced-motion. Without JS / canvas nothing changes
   in the content.
   ========================================================= */

(function () {
    'use strict';

    var root = document.querySelector('[data-em]');
    if (!root) return;

    var stage = root.querySelector('[data-em-stage]');
    var canvas = root.querySelector('[data-em-canvas]');
    var photo = root.querySelector('[data-em-photo]');
    var frame = root.querySelector('[data-em-frame]');
    var img = root.querySelector('[data-em-img]');
    var srcEl = root.querySelector('[data-em-src]');
    var paths = root.querySelector('.em-paths');
    var bio = root.querySelector('.em-bio');
    var exp = root.querySelector('.em-exp');
    var btns = [].slice.call(root.querySelectorAll('[data-em-path]'));
    var nodes = btns.map(function (b) { return b.querySelector('[data-em-node]'); });

    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var stackMQ = window.matchMedia('(max-width: 991px)');

    root.classList.add('is-js');

    /* Image geometry (normalised to the photograph) */
    var IMG_W = 1599, IMG_H = 2133;
    var SOURCE = { u: 0.152, v: 0.668 };                    // laptop screen
    var FACE = { u: 0.665, v: 0.335, ru: 0.17, rv: 0.165 }; // head, generous

    /* =====================================================
       1. Entrance
       ===================================================== */

    var head = root.querySelector('.em-head');
    var reveals = [head].concat([].slice.call(root.querySelectorAll('.em-reveal')));

    if ('IntersectionObserver' in window && !reduceMQ.matches) {
        var revealIO = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in');
                    revealIO.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
        reveals.forEach(function (el) { if (el) revealIO.observe(el); });
    } else {
        reveals.forEach(function (el) { if (el) el.classList.add('is-in'); });
    }

    /* =====================================================
       2. Disciplines
       ===================================================== */

    var pinned = -1, hovered = -1, shown = -2;

    function applyFocus(force) {
        var active = hovered >= 0 ? hovered : pinned;
        if (active === shown && !force) return;
        shown = active;

        root.classList.toggle('has-active', active >= 0);
        btns.forEach(function (b, i) {
            b.parentNode.classList.toggle('is-active', i === active);
            b.setAttribute('aria-pressed', i === active ? 'true' : 'false');
        });
        signal.focus(active);
    }

    btns.forEach(function (b, i) {
        b.addEventListener('pointerenter', function (e) {
            if (e.pointerType !== 'mouse' || !fineMQ.matches) return;
            hovered = i; applyFocus();
        });
        b.addEventListener('pointerleave', function (e) {
            if (e.pointerType !== 'mouse') return;
            hovered = -1; applyFocus();
        });
        b.addEventListener('click', function () {
            hovered = -1;
            pinned = pinned === i ? -1 : i;
            applyFocus(true);   // re-fire the pulse on every press
        });
        b.addEventListener('focus', function () {
            if (b.matches && b.matches(':focus-visible')) { hovered = i; applyFocus(); }
        });
        b.addEventListener('blur', function () {
            if (hovered === i) { hovered = -1; applyFocus(); }
        });
    });

    /* =====================================================
       3. The signal
       ===================================================== */

    var signal = createSignal();
    signal.init();

    function createSignal() {
        var ctx = canvas.getContext && canvas.getContext('2d');
        var dpr = 1, ox = 0, oy = 0, cw = 0, ch = 0;   // canvas box in stage coords
        var trunk = null, branches = [], splits = [0, 0, 0];
        var parts = [];                                  // particles
        var face = null, quiet = [];
        var srcPt = null;
        var stacked = false;

        var pulses = [], rings = [];
        var emph = [1, 1, 1], emphT = 1, emphTarget = [1, 1, 1], emphTTarget = 1;
        var focusIdx = -1, lastAuto = 0, nextIdle = 0;
        var progress = 0, buildStart = -1;
        var running = false, inView = false, raf = 0, last = 0, clock = 0;
        var hitTimers = [0, 0, 0];

        var WEIGHT = [1, 1, 0.62];          // AI and ML lead, SE quieter
        var FLOW = 16;                      // px/s outward drift
        var PULSE_SPEED = 560, TAIL = 120;

        /* ---------- Seeded random ---------- */
        var seed = 0;
        function rand() {
            seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        function gauss() { return (rand() + rand() + rand() - 1.5) / 1.5; }

        /* ---------- Geometry helpers ---------- */
        function rel(el) {
            var s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
            return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height,
                     r: r.right - s.left, b: r.bottom - s.top };
        }

        function cubic(p0, c1, c2, p3, out) {
            for (var i = out.length ? 1 : 0; i <= 64; i++) {
                var t = i / 64, m = 1 - t;
                out.push([
                    m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p3[0],
                    m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p3[1]
                ]);
            }
            return out;
        }
        function line(p0, p3, out) { return cubic(p0, p0, p3, p3, out); }

        // Resample a polyline at 1px arc-length steps, with unit normals.
        function resample(pts) {
            var acc = [0];
            for (var i = 1; i < pts.length; i++) {
                acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            }
            var len = acc[acc.length - 1], n = Math.max(2, Math.floor(len) + 1);
            var x = new Float32Array(n), y = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
            var j = 0;
            for (var k = 0; k < n; k++) {
                var d = Math.min(k, len);
                while (j < acc.length - 2 && acc[j + 1] < d) j++;
                var seg = acc[j + 1] - acc[j] || 1, f = (d - acc[j]) / seg;
                x[k] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * f;
                y[k] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f;
            }
            for (k = 0; k < n; k++) {
                var a = Math.max(0, k - 2), b = Math.min(n - 1, k + 2);
                var dx = x[b] - x[a], dy = y[b] - y[a], l = Math.hypot(dx, dy) || 1;
                nx[k] = -dy / l; ny[k] = dx / l;
            }
            return { x: x, y: y, nx: nx, ny: ny, len: n - 1 };
        }

        function mapImage(F) {
            var pos = (getComputedStyle(img).objectPosition || '50% 50%').split(' ');
            var px = parseFloat(pos[0]) / 100, py = parseFloat(pos[1] || pos[0]) / 100;
            if (isNaN(px)) px = 0.5; if (isNaN(py)) py = 0.5;
            var sc = Math.max(F.w / IMG_W, F.h / IMG_H), dw = IMG_W * sc, dh = IMG_H * sc;
            var x0 = F.x + (F.w - dw) * px, y0 = F.y + (F.h - dh) * py;
            return function (u, v) { return [x0 + u * dw, y0 + v * dh, dw, dh]; };
        }

        /* ---------- Build ---------- */
        function build() {
            if (!ctx) return;
            stacked = stackMQ.matches;
            var S = stage.getBoundingClientRect();
            if (!S.width) return;

            var F = rel(frame), P = rel(photo), map = mapImage(F);
            var s = map(SOURCE.u, SOURCE.v);
            srcPt = [Math.max(F.x + 10, Math.min(F.r - 10, s[0])), Math.max(F.y + 10, Math.min(F.b - 10, s[1]))];
            var fc = map(FACE.u, FACE.v);
            face = { x: fc[0], y: fc[1], rx: FACE.ru * fc[2], ry: FACE.rv * fc[3] };

            photo.style.setProperty('--src-x', (srcPt[0] - P.x) + 'px');
            photo.style.setProperty('--src-y', (srcPt[1] - P.y) + 'px');

            var N = nodes.map(function (n) { var r = rel(n); return [r.x + r.w / 2, r.y + r.h / 2]; });
            quiet = [].slice.call(root.querySelectorAll('.em-quiet')).map(rel);

            var tp = [], bps = [];
            if (!stacked) {
                var B = rel(bio), E = rel(exp), Pt = rel(paths);
                var leftEdge = Math.max(B.r, E.r);
                var gx = F.x - Math.max(28, Math.min(80, (F.x - leftEdge) * 0.5));
                var J = [gx, Pt.y - 140];
                var bend = [gx, srcPt[1] + 96];
                cubic(srcPt, [srcPt[0] - (srcPt[0] - gx) * 0.62, srcPt[1]], [gx, srcPt[1] + 26], bend, tp);
                line(bend, J, tp);
                N.forEach(function (n) {
                    var k = (n[1] - J[1]) * 0.62;
                    bps.push(cubic(J, [J[0], J[1] + k], [n[0], n[1] - k], n, []));
                });
                trunk = resample(tp);
                splits = [trunk.len, trunk.len, trunk.len];
            } else {
                var railX = Math.max(6, F.x * 0.32);
                var drop = [railX, srcPt[1] + 64];
                cubic(srcPt, [srcPt[0] - (srcPt[0] - railX) * 0.7, srcPt[1]], [railX, srcPt[1] + 18], drop, tp);
                var lenA = resample(tp).len;
                var starts = N.map(function (n) { return [railX, n[1] - 40]; });
                line(drop, starts[starts.length - 1], tp);
                N.forEach(function (n, i) {
                    var a = starts[i];
                    bps.push(cubic(a, [railX, n[1] - 14], [n[0] - 14, n[1]], n, []));
                    splits[i] = lenA + (a[1] - drop[1]);
                });
                trunk = resample(tp);
            }
            branches = bps.map(resample);

            // Canvas covers only the signal's bounding box.
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            [trunk].concat(branches).forEach(function (p) {
                for (var k = 0; k <= p.len; k += 4) {
                    if (p.x[k] < minX) minX = p.x[k]; if (p.x[k] > maxX) maxX = p.x[k];
                    if (p.y[k] < minY) minY = p.y[k]; if (p.y[k] > maxY) maxY = p.y[k];
                }
            });
            var pad = 28;
            ox = Math.floor(minX - pad); oy = Math.floor(minY - pad);
            cw = Math.ceil(maxX - minX + pad * 2); ch = Math.ceil(maxY - minY + pad * 2);
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.style.inset = 'auto';
            canvas.style.left = ox + 'px';
            canvas.style.top = oy + 'px';
            canvas.style.width = cw + 'px';
            canvas.style.height = ch + 'px';
            canvas.width = Math.round(cw * dpr);
            canvas.height = Math.round(ch * dpr);

            // Particles
            seed = 20261126;
            parts = [];
            seedPath(-1, trunk, stacked ? 3.4 : 3.0, stacked ? 1.0 : 1.5, 0.9);
            branches.forEach(function (b, i) {
                seedPath(i, b, i === 2 ? 4.4 : 3.0, i === 2 ? 1.1 : 1.7, WEIGHT[i]);
            });
        }

        function seedPath(id, p, spacing, width, weight) {
            var n = Math.floor(p.len / spacing);
            for (var k = 0; k < n; k++) {
                parts.push({
                    p: id,
                    s0: (k + rand()) * spacing,
                    o: gauss() * width,
                    ph: rand() * 6.283,
                    r: 0.55 + rand() * 0.6,
                    a: (0.28 + rand() * 0.55) * weight,
                    sp: 0.8 + rand() * 0.4
                });
            }
        }

        function pathOf(id) { return id < 0 ? trunk : branches[id]; }

        function inQuiet(x, y) {
            if (face) {
                var dx = (x - face.x) / face.rx, dy = (y - face.y) / face.ry;
                if (dx * dx + dy * dy < 1) return true;
            }
            for (var i = 0; i < quiet.length; i++) {
                var q = quiet[i];
                if (x > q.x - 4 && x < q.r + 4 && y > q.y - 4 && y < q.b + 4) return true;
            }
            return false;
        }

        /* ---------- Pulses ---------- */
        function routeLen(i) { return splits[i] + branches[i].len; }

        function fire(i, now) {
            if (!trunk || reduceMQ.matches) return;
            pulses.push({ i: i, t0: now, d: 0, hit: false });
            rings.push(now);
            if (pulses.length > 6) pulses.shift();
        }

        function pointOnRoute(i, d) {
            var p, k;
            if (d <= splits[i]) { p = trunk; k = d; } else { p = branches[i]; k = d - splits[i]; }
            k = Math.max(0, Math.min(p.len, k)) | 0;
            return [p.x[k], p.y[k]];
        }

        function hit(i) {
            var n = nodes[i];
            n.classList.add('is-hit');
            clearTimeout(hitTimers[i]);
            hitTimers[i] = setTimeout(function () { n.classList.remove('is-hit'); }, 420);
        }

        /* ---------- Frame ---------- */
        var glow = null;
        function glowSprite() {
            var c = document.createElement('canvas'), g = c.getContext('2d'), R = 32;
            c.width = c.height = R * 2;
            var grd = g.createRadialGradient(R, R, 0, R, R, R);
            grd.addColorStop(0, 'rgba(255,255,255,0.9)');
            grd.addColorStop(0.18, 'rgba(255,255,255,0.35)');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(0, 0, R * 2, R * 2);
            return c;
        }

        function draw(now) {
            if (!ctx || !trunk) return;
            var still = reduceMQ.matches;
            ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
            ctx.clearRect(ox, oy, cw, ch);

            var reach = still ? Infinity : progress * (Math.max(routeLen(0), routeLen(1), routeLen(2)) + 40);

            // Faint guide strokes: the pathway itself
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#ffffff';
            [-1, 0, 1, 2].forEach(function (id) {
                var p = pathOf(id), e = id < 0 ? emphT : emph[id] * WEIGHT[id];
                var base = id < 0 ? 0 : splits[id];
                var end = Math.min(p.len, reach - base);
                if (end <= 2) return;
                ctx.globalAlpha = 0.06 + 0.05 * Math.min(1.6, e);
                ctx.beginPath();
                for (var k = 0; k <= end; k += 3) {
                    if (k === 0) ctx.moveTo(p.x[k], p.y[k]); else ctx.lineTo(p.x[k], p.y[k]);
                }
                ctx.stroke();
            });

            // Particles
            ctx.fillStyle = '#ffffff';
            var t = still ? 0 : clock;
            for (var n = 0; n < parts.length; n++) {
                var q = parts[n], p = pathOf(q.p);
                var s = (q.s0 + t * FLOW * q.sp) % p.len;
                var routeD = q.p < 0 ? s : splits[q.p] + s;
                if (routeD > reach) continue;
                var k = s | 0;
                var wob = still ? 0 : Math.sin(t * 0.9 + q.ph) * 0.5;
                var x = p.x[k] + p.nx[k] * (q.o + wob), y = p.y[k] + p.ny[k] * (q.o + wob);
                if (inQuiet(x, y)) continue;

                var e = q.p < 0 ? emphT : emph[q.p];
                var a = q.a * e;
                // taper at both ends
                var end = Math.min(s, p.len - s);
                if (end < 14) a *= end / 14;
                if (q.p < 0 && s < 10) a *= s / 10;
                // build front
                if (!still && reach - routeD < 40) a *= (reach - routeD) / 40;

                var boost = 0;
                for (var j = 0; j < pulses.length; j++) {
                    var pl = pulses[j];
                    if (q.p >= 0 && q.p !== pl.i) continue;
                    if (q.p < 0 && s > splits[pl.i]) continue;
                    var behind = pl.d - routeD;
                    if (behind >= 0 && behind < TAIL) {
                        var f = 1 - behind / TAIL;
                        boost = Math.max(boost, f * f);
                    }
                }
                a = Math.min(1, a + boost * 0.95);
                if (a < 0.02) continue;
                var r = q.r * (1 + boost * 0.7);
                ctx.globalAlpha = a;
                ctx.fillRect(x - r, y - r, r * 2, r * 2);
            }

            // Pulse heads
            if (!glow) glow = glowSprite();
            for (var m = 0; m < pulses.length; m++) {
                var P = pulses[m];
                if (P.d > routeLen(P.i)) continue;
                var h = pointOnRoute(P.i, P.d);
                if (inQuiet(h[0], h[1])) continue;
                ctx.globalAlpha = 0.85;
                ctx.drawImage(glow, h[0] - 14, h[1] - 14, 28, 28);
                ctx.globalAlpha = 1;
                ctx.fillRect(h[0] - 1.3, h[1] - 1.3, 2.6, 2.6);
            }

            // Emission rings at the source
            for (var g = 0; g < rings.length; g++) {
                var age = (now - rings[g]) / 700;
                if (age > 1) continue;
                ctx.globalAlpha = 0.5 * (1 - age);
                ctx.beginPath();
                ctx.arc(srcPt[0], srcPt[1], 6 + age * 16, 0, 6.283);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        function step(now) {
            raf = 0;
            if (!running) return;
            var dt = Math.min(0.05, (now - (last || now)) / 1000);
            last = now;
            clock += dt;

            if (buildStart < 0) buildStart = now + 500;
            progress = Math.max(0, Math.min(1, (now - buildStart) / 2200));
            progress = 1 - Math.pow(1 - progress, 3);

            // Ease emphasis toward its target
            var k = 1 - Math.exp(-dt * 7);
            for (var i = 0; i < 3; i++) emph[i] += (emphTarget[i] - emph[i]) * k;
            emphT += (emphTTarget - emphT) * k;

            // Pulses
            for (var p = pulses.length - 1; p >= 0; p--) {
                var P = pulses[p];
                P.d = (now - P.t0) / 1000 * PULSE_SPEED;
                var L = routeLen(P.i);
                if (!P.hit && P.d >= L) { P.hit = true; hit(P.i); }
                if (P.d > L + TAIL) pulses.splice(p, 1);
            }
            while (rings.length && now - rings[0] > 700) rings.shift();

            if (progress >= 1) {
                if (focusIdx >= 0) {
                    if (now - lastAuto > 1500) { fire(focusIdx, now); lastAuto = now; }
                } else if (now > nextIdle) {
                    var r = rand(), i2 = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
                    fire(i2, now);
                    nextIdle = now + 2400 + rand() * 1800;
                }
            }

            draw(now);
            raf = requestAnimationFrame(step);
        }

        function start() {
            if (running || reduceMQ.matches || !trunk) return;
            running = true; last = 0;
            raf = requestAnimationFrame(step);
        }
        function stop() {
            running = false;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }
        function sync() {
            if (inView && !document.hidden && !reduceMQ.matches) start(); else stop();
            if (reduceMQ.matches) draw(performance.now());
        }

        var pending = 0;
        function rebuild() {
            if (pending) return;
            pending = requestAnimationFrame(function () {
                pending = 0;
                build();
                draw(performance.now());
            });
        }

        return {
            init: function () {
                if (!ctx) return;
                build();
                if ('ResizeObserver' in window) {
                    new ResizeObserver(rebuild).observe(stage);
                } else {
                    window.addEventListener('resize', rebuild);
                }
                stackMQ.addEventListener && stackMQ.addEventListener('change', rebuild);
                if (img && !img.complete) img.addEventListener('load', rebuild);
                if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);

                if ('IntersectionObserver' in window) {
                    new IntersectionObserver(function (en) {
                        inView = en[0].isIntersecting;
                        sync();
                    }, { rootMargin: '120px 0px' }).observe(stage);
                } else { inView = true; }
                document.addEventListener('visibilitychange', sync);
                reduceMQ.addEventListener && reduceMQ.addEventListener('change', function () { pulses = []; sync(); });
                sync();
            },
            focus: function (i) {
                focusIdx = i;
                for (var k = 0; k < 3; k++) emphTarget[k] = i < 0 ? 1 : (k === i ? 1.7 : 0.32);
                emphTTarget = i < 0 ? 1 : 1.35;
                if (reduceMQ.matches) {
                    emph = emphTarget.slice(); emphT = emphTTarget;
                    draw(performance.now());
                    return;
                }
                if (i >= 0) {
                    var now = performance.now();
                    if (progress < 1) { buildStart = now - 2200; progress = 1; }
                    fire(i, now); lastAuto = now;
                }
            }
        };
    }
})();
