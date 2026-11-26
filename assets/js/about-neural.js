/* =========================================================
   ABOUT — "The Neural Specimen"

   1. Entrance reveals for the heading and stage.
   2. Focus areas: hover (fine pointers), tap or click selects
      one of three pathways. The readout changes, the pathway
      brightens, one impulse runs along it and the others dim.
   3. The specimen: ONE pyramidal neuron drawn in fine points.
        - Soma       a small, asymmetric cell body that tapers
                     into each process; a faint nucleus.
        - Dendrites  an apical dendrite (oblique branches and a
                     tuft at the top) plus four basal dendrites.
                     Primary → secondary → tertiary, tapering,
                     each a seeded cubic Bézier. A branch that
                     would cross the face or any text is cut
                     short rather than re-routed.
        - Axon       one thin, myelinated axon (dotted sheath,
                     nodes of Ranvier) that gives off three
                     collaterals ending on the three focus nodes:
                       01 AI  terminal arbor (forked twigs)
                       02 ML  boutons en passant along its length
                       03 SE  the regular, evenly segmented end
      Impulses travel particle by particle along those same
      curves: inward along dendrites to the soma, and sometimes
      on through the axon into a collateral.

   Geometry is measured from the DOM (soma marker, the three
   focus nodes, the portrait frame and every .ni-quiet text box)
   and rebuilt deterministically on resize.

   Rendering: WebGL1, one static point buffer per layout plus a
   tiny dynamic buffer for the impulse heads. Lighting is done
   in the vertex shader from a few uniforms; no allocations in
   the frame loop; time-based, so frame-rate independent.
   Pauses off-screen and in hidden tabs; draws one still frame
   with prefers-reduced-motion. Without WebGL the canvas stays
   empty and the content is unaffected.
   ========================================================= */

(function () {
    'use strict';

    var root = document.querySelector('[data-ni]');
    if (!root) return;

    var stage = root.querySelector('[data-ni-stage]');
    var canvas = root.querySelector('[data-ni-canvas]');
    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var fineMQ = window.matchMedia('(hover: hover) and (pointer: fine)');
    var stackMQ = window.matchMedia('(max-width: 991px)');

    root.classList.add('is-js');

    /* =====================================================
       1. Entrance
       ===================================================== */

    var head = root.querySelector('.ni-head');
    var portrait = root.querySelector('[data-ni-portrait]');
    var reveals = [head, portrait].concat([].slice.call(root.querySelectorAll('.ni-reveal')));

    if ('IntersectionObserver' in window && !reduceMQ.matches) {
        var revealIO = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-in');
                    revealIO.unobserve(e.target);
                }
            });
        }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
        reveals.forEach(function (el) { if (el) revealIO.observe(el); });
    } else {
        reveals.forEach(function (el) { if (el) el.classList.add('is-in'); });
    }

    /* =====================================================
       2. Focus areas
       ===================================================== */

    var btns = [].slice.call(root.querySelectorAll('[data-ni-pillar]'));
    var panels = [].slice.call(root.querySelectorAll('[data-ni-panel]'));
    var pinned = -1, hovered = -1, shown = -2;

    function applyFocus() {
        var active = hovered >= 0 ? hovered : pinned;
        if (active === shown) return;
        shown = active;

        root.classList.toggle('has-active', active >= 0);
        btns.forEach(function (b, i) {
            b.parentNode.classList.toggle('is-active', i === active);
            b.setAttribute('aria-pressed', i === pinned ? 'true' : 'false');
        });
        panels.forEach(function (p) {
            var on = +p.getAttribute('data-ni-panel') === active;
            p.classList.toggle('is-current', on);
            p.setAttribute('aria-hidden', on ? 'false' : 'true');
        });

        net.focus(active);
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
            shown = -2;           // force: re-fire the impulse on every press
            applyFocus();
        });
        b.addEventListener('focus', function () {
            if (b.matches && b.matches(':focus-visible')) { hovered = i; applyFocus(); }
        });
        b.addEventListener('blur', function () {
            if (hovered === i) { hovered = -1; applyFocus(); }
        });
    });

    panels.forEach(function (p) {
        p.setAttribute('aria-hidden', p.classList.contains('is-current') ? 'false' : 'true');
    });

    /* =====================================================
       3. The specimen
       ===================================================== */

    var net = createNet();
    net.init();

    function createNet() {
        var noop = { init: function () {}, focus: function () {} };
        if (!canvas) return noop;

        var gl = null, prog = null, buf = null, sparkBuf = null;
        var U = {}, A = {};
        var STRIDE = 11;                    // floats per particle
        var MAXP = 16, MAXF = 8;            // impulses, flares (match shader)
        var count = 0;

        // Groups: 0 soma + dendrites, 1–3 the three collaterals, 4 axon trunk
        var G_TRUNK = 4;

        var W = 0, H = 0, DPR = 1, stacked = false, small = false;
        var vis0 = 0, vis1 = 0, top0 = 0;
        var paths = [], leaves = [], trunk = null, coll = [];
        var somaPt = { x: 0, y: 0 }, somaR = 10;
        var face = null, quiet = [], photoReach = 80;

        // Impulses and flares (pooled; no allocation per frame)
        var pulses = [], flares = [];
        var pulseU = new Float32Array(MAXP * 4);
        var flareU = new Float32Array(MAXF * 4);
        var sparkData = new Float32Array(MAXP * STRIDE);
        var tmp = { x: 0, y: 0 };
        for (var i = 0; i < MAXP; i++) pulses.push({ on: false, path: null, head: 0, dir: 1, speed: 0, str: 0, chain: 0, target: -1, fade: false });
        for (var j = 0; j < MAXF; j++) flares.push({ on: false, x: 0, y: 0, age: 0, dur: 0, str: 0 });

        // Focus state, eased
        var focusCur = [0, 0, 0], focusTgt = [0, 0, 0], anyCur = 0, anyTgt = 0;

        // Time
        var running = false, visible = false, raf = 0, last = 0, clock = 0;
        var grow = 0, growing = false, nextSpont = 900, built = false;

        /* ---------- Shaders ---------- */

        var VS = [
            'precision highp float;',
            'attribute vec4 a0;',   // x, y, size(px), alpha
            'attribute vec4 a1;',   // pathId, s(px), group, born
            'attribute vec3 a2;',   // mask, phase, drift(px)
            'uniform vec2 uRes;',
            'uniform float uTime, uGrow, uDpr, uTail, uAny;',
            'uniform vec3 uFocus;',
            'uniform vec4 uPulse[16];',
            'uniform vec4 uFlare[8];',
            'varying float vA;',
            'void main() {',
            '  vec2 p = a0.xy;',
            '  float ph = a2.y;',
            '  p += vec2(sin(uTime * 0.00037 + ph * 6.2831), cos(uTime * 0.00029 + ph * 4.7)) * a2.z;',
            '  float light = 0.0;',
            '  for (int i = 0; i < 16; i++) {',
            '    vec4 P = uPulse[i];',
            '    if (P.w <= 0.0) continue;',
            '    if (abs(P.x - a1.x) > 0.5) continue;',
            '    float d = P.z > 0.0 ? (P.y - a1.y) : (a1.y - P.y);',
            '    float hd = exp(-d * d / 9.0);',
            '    float tr = d > 0.0 ? exp(-d / uTail) : 0.0;',
            '    light += P.w * (hd * 2.3 + tr * 0.8);',
            '  }',
            '  for (int j = 0; j < 8; j++) {',
            '    vec4 F = uFlare[j];',
            '    if (F.w <= 0.0) continue;',
            '    vec2 dd = a0.xy - F.xy;',
            '    float rad = 5.0 + 15.0 * F.z;',
            '    float k = 1.0 - F.z;',
            '    light += F.w * exp(-dot(dd, dd) / (rad * rad)) * k * k;',
            '  }',
            '  float g = a1.z;',
            // focus: collaterals follow their own pillar; the trunk follows "any"
            '  float fo = g < 0.5 ? 0.0 : (g < 1.5 ? uFocus.x : (g < 2.5 ? uFocus.y : (g < 3.5 ? uFocus.z : uAny)));',
            '  float dimK = g < 0.5 ? 0.3 : (g < 3.5 ? 0.62 : 0.0);',
            '  float dim = 1.0 - uAny * (1.0 - fo) * dimK;',
            '  float tw = 0.88 + 0.12 * sin(uTime * 0.0011 * (0.5 + ph) + ph * 37.0);',
            '  float base = a0.w * dim * tw * (1.0 + (g > 3.5 ? 0.45 : 1.25) * fo);',
            '  float born = smoothstep(a1.w, a1.w + 0.05, uGrow);',
            '  float a = (base + light) * born * a2.x;',
            '  vA = min(a, 1.4);',
            '  gl_PointSize = a0.z * uDpr * (1.0 + 0.4 * min(light, 1.5) + 0.15 * fo);',
            '  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);',
            '  if (a < 0.003) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }',
            '}'
        ].join('\n');

        var FS = [
            'precision mediump float;',
            'varying float vA;',
            'void main() {',
            '  vec2 c = gl_PointCoord - 0.5;',
            '  float r = length(c) * 2.0;',
            '  if (r > 1.0) discard;',
            '  float f = 1.0 - smoothstep(0.35, 1.0, r);',
            '  float v = vA * f;',
            // neutral only: r = g = b
            '  gl_FragColor = vec4(v, v, v, 1.0);',
            '}'
        ].join('\n');

        function compile(type, src) {
            var s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                if (window.console) console.warn('[about-neural]', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }

        function setupGL() {
            var opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
            try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
            if (!gl) return false;
            var vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
            if (!vs || !fs) return false;
            prog = gl.createProgram();
            gl.attachShader(prog, vs); gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
            gl.useProgram(prog);
            ['a0', 'a1', 'a2'].forEach(function (n) { A[n] = gl.getAttribLocation(prog, n); });
            ['uRes', 'uTime', 'uGrow', 'uDpr', 'uTail', 'uAny', 'uFocus', 'uPulse', 'uFlare'].forEach(function (n) {
                U[n] = gl.getUniformLocation(prog, n);
            });
            buf = gl.createBuffer();
            sparkBuf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, sparkBuf);
            gl.bufferData(gl.ARRAY_BUFFER, sparkData.byteLength, gl.DYNAMIC_DRAW);
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE);            // additive light
            gl.clearColor(0, 0, 0, 0);
            return true;
        }

        function bindAttribs(b) {
            gl.bindBuffer(gl.ARRAY_BUFFER, b);
            var F = 4;
            gl.enableVertexAttribArray(A.a0); gl.vertexAttribPointer(A.a0, 4, gl.FLOAT, false, STRIDE * F, 0);
            gl.enableVertexAttribArray(A.a1); gl.vertexAttribPointer(A.a1, 4, gl.FLOAT, false, STRIDE * F, 4 * F);
            gl.enableVertexAttribArray(A.a2); gl.vertexAttribPointer(A.a2, 3, gl.FLOAT, false, STRIDE * F, 8 * F);
        }

        /* ---------- Seeded randomness (same specimen on every rebuild) ---------- */

        var seed = 1;
        function rnd() {
            seed |= 0; seed = seed + 0x6D2B79F5 | 0;
            var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
        function rr(a, b) { return a + (b - a) * rnd(); }
        function gauss() { return (rnd() + rnd() + rnd() - 1.5) / 1.5; }
        function rad(deg) { return deg * Math.PI / 180; }
        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

        /* ---------- Layout measurement ---------- */

        var cRect = null;
        function rel(el) {
            var r = el.getBoundingClientRect();
            return { x: r.left - cRect.left, y: r.top - cRect.top, w: r.width, h: r.height };
        }

        function measure() {
            cRect = canvas.getBoundingClientRect();
            W = Math.max(1, Math.round(cRect.width));
            H = Math.max(1, Math.round(cRect.height));
            stacked = stackMQ.matches;
            small = window.innerWidth < 576;

            // only the part of the canvas that is actually on screen
            var vw = document.documentElement.clientWidth;
            vis0 = Math.max(0, -cRect.left) + 6;
            vis1 = Math.min(W, vw - cRect.left) - 6;

            var s = rel(root.querySelector('[data-ni-soma]'));
            somaPt = { x: s.x, y: s.y };
            somaR = stacked ? 8 : 10.5;

            var f = rel(root.querySelector('.ni-portrait__frame'));
            // Face of this photograph (fractions of the frame).
            face = { cx: f.x + f.w * 0.535, cy: f.y + f.h * 0.33, rx: f.w * 0.25, ry: f.h * 0.265, frame: f };
            photoReach = stacked ? f.w * 0.24 : Math.min(110, f.w * 0.2);

            var pad = stacked ? 6 : 8;
            var boxes = [].slice.call(root.querySelectorAll('.ni-quiet'));
            if (head) boxes.push(head);
            quiet = boxes.map(function (el) {
                var r = rel(el);
                return { x0: r.x - pad, y0: r.y - pad, x1: r.x + r.w + pad, y1: r.y + r.h + pad };
            }).filter(function (r) { return r.x1 > r.x0 && r.y1 > r.y0; });

            top0 = head ? Math.max(6, rel(head).y + rel(head).h + 24) : 6;

            return [].slice.call(root.querySelectorAll('[data-ni-anchor]')).map(function (el) {
                var r = rel(el);
                return { x: r.x + r.w / 2, y: r.y + r.h / 2, x0: r.x };
            });
        }

        function faceE(x, y) {
            var dx = (x - face.cx) / face.rx, dy = (y - face.cy) / face.ry;
            return dx * dx + dy * dy;
        }

        function rectDist(r, x, y) {
            var dx = Math.max(r.x0 - x, 0, x - r.x1), dy = Math.max(r.y0 - y, 0, y - r.y1);
            return Math.sqrt(dx * dx + dy * dy);   // 0 inside
        }

        function smooth(a, b, x) {
            var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
            return t * t * (3 - 2 * t);
        }

        // How far (px) a point is inside the photograph; 0 outside.
        function inPhoto(x, y) {
            var f = face.frame;
            if (x < f.x || y < f.y || x > f.x + f.w || y > f.y + f.h) return 0;
            return Math.min(x - f.x, f.x + f.w - x, y - f.y, f.y + f.h - y);
        }

        // Static visibility: the photograph stays dominant, the face stays clear.
        function maskAt(x, y) {
            var m = smooth(1.25, 1.9, faceE(x, y));
            var ip = inPhoto(x, y);
            if (ip > 0) m *= 1 - 0.5 * smooth(0, photoReach * 0.8, ip);
            for (var i = 0; i < quiet.length; i++) {
                var d = rectDist(quiet[i], x, y);
                if (d < 6) m *= 0.15 + 0.85 * smooth(0, 6, d);
            }
            return m;
        }

        function blocked(x, y, margin) {
            if (x < vis0 || x > vis1 || y < top0 || y > H - 6) return true;
            if (faceE(x, y) < 1.55) return true;
            if (inPhoto(x, y) > photoReach) return true;
            for (var i = 0; i < quiet.length; i++) if (rectDist(quiet[i], x, y) < margin) return true;
            return false;
        }

        // Free distance along a ray before protected space.
        function freeRun(x, y, ang, max, margin) {
            var cx = Math.cos(ang), cy = Math.sin(ang);
            for (var d = 4; d <= max; d += 4) if (blocked(x + cx * d, y + cy * d, margin)) return d - 4;
            return max;
        }

        /* ---------- Paths ---------- */

        var P = [];                 // particle floats (plain array while building)
        var maxReach = 1;

        function particle(x, y, size, alpha, pathId, s, group, dist, drift) {
            P.push(x, y, size, alpha, pathId, s, group, dist, maskAt(x, y), rnd(), drift);
        }

        function newPath(pts, group, kind, parent, parentS, rootDist) {
            var cum = [0], len = 0;
            for (var i = 2; i < pts.length; i += 2) {
                len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
                cum.push(len);
            }
            var p = {
                id: paths.length, pts: pts, cum: cum, len: len, group: group, kind: kind, idx: -1,
                parent: parent, parentS: parentS, rootDist: rootDist, children: [],
                end: { x: pts[pts.length - 2], y: pts[pts.length - 1] }
            };
            paths.push(p);
            if (parent) parent.children.push(p);
            maxReach = Math.max(maxReach, rootDist + len);
            return p;
        }

        function pointAt(p, s, out) {
            var c = p.cum, n = c.length;
            if (s <= 0) { out.x = p.pts[0]; out.y = p.pts[1]; return out; }
            if (s >= p.len) { out.x = p.pts[2 * n - 2]; out.y = p.pts[2 * n - 1]; return out; }
            var lo = 0, hi = n - 1;
            while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (c[mid] <= s) lo = mid; else hi = mid; }
            var t = (s - c[lo]) / Math.max(1e-6, c[hi] - c[lo]);
            out.x = p.pts[2 * lo] + (p.pts[2 * hi] - p.pts[2 * lo]) * t;
            out.y = p.pts[2 * lo + 1] + (p.pts[2 * hi + 1] - p.pts[2 * lo + 1]) * t;
            return out;
        }

        var tA = { x: 0, y: 0 }, tB = { x: 0, y: 0 };
        function angleAt(p, s) {
            pointAt(p, Math.max(0, s - 2), tA);
            pointAt(p, Math.min(p.len, s + 2), tB);
            return Math.atan2(tB.y - tA.y, tB.x - tA.x);
        }

        function pol(x, y, a, d) { return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d }; }

        // A cubic Bézier, sampled every ~step px, as a flat [x, y, …] array.
        function cubic(a, b, c, d, step) {
            var est = Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(c.x - b.x, c.y - b.y) + Math.hypot(d.x - c.x, d.y - c.y);
            var N = Math.max(8, Math.ceil(est / step)), out = [];
            for (var i = 0; i <= N; i++) {
                var t = i / N, mt = 1 - t;
                out.push(
                    mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
                    mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y
                );
            }
            return out;
        }

        // Low-frequency organic irregularity, zero at both ends.
        function wiggle(pts, amp, wave, phase) {
            var n = pts.length / 2, out = pts.slice(), L = 0, cum = [0];
            for (var i = 1; i < n; i++) { L += Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]); cum.push(L); }
            if (L < 1) return out;
            for (var k = 1; k < n - 1; k++) {
                var dx = pts[2 * k + 2] - pts[2 * k - 2], dy = pts[2 * k + 3] - pts[2 * k - 1], dl = Math.hypot(dx, dy) || 1;
                var u = cum[k] / L, env = Math.sin(Math.PI * Math.min(1, u * 1.6));
                var o = amp * env * (Math.sin(cum[k] / wave * 6.2831 + phase) * 0.7 + Math.sin(cum[k] / (wave * 0.41) + phase * 1.7) * 0.3);
                out[2 * k] += -dy / dl * o; out[2 * k + 1] += dx / dl * o;
            }
            return out;
        }

        /* ---------- Soma ---------- */

        // Cell body: irregular, volumetric, tapering into each process.
        function somaBody(cx, cy, R, dirs) {
            var ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
            function edge(a) {
                var r = R * (1 + 0.12 * Math.sin(2 * a + ph1) + 0.07 * Math.sin(3 * a + ph2));
                for (var i = 0; i < dirs.length; i++) {
                    var d = Math.atan2(Math.sin(a - dirs[i].a), Math.cos(a - dirs[i].a));
                    r += R * dirs[i].k * Math.exp(-d * d / 0.075);
                }
                return r;
            }
            var n = stacked ? 300 : 460;
            for (var i = 0; i < n; i++) {
                var a = rnd() * Math.PI * 2;
                var u = Math.pow(rnd(), 0.62);           // volumetric, slightly centre-weighted
                var d = u * edge(a);
                var al = 0.16 + 0.3 * Math.pow(1 - u, 1.3) + (u > 0.86 ? 0.1 : 0);
                if (rnd() < 0.18) al *= 0.5;             // graphite grains
                particle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr(1.0, 1.45), al, -1, 0, 0, u * 6, 0.25);
            }
            // nucleus, a little off centre, and a nucleolus
            var nx = cx + R * 0.14, ny = cy - R * 0.12;
            for (var k = 0; k < (stacked ? 26 : 40); k++) {
                var b = rnd() * Math.PI * 2, e = Math.sqrt(rnd()) * R * 0.36;
                particle(nx + Math.cos(b) * e, ny + Math.sin(b) * e * 0.85, rr(1.0, 1.3), 0.3, -1, 0, 0, 1, 0.2);
            }
            for (var m = 0; m < 4; m++) {
                particle(nx + rr(-1, 1), ny + rr(-1, 1), 1.35, 0.5, -1, 0, 0, 0, 0.1);
            }
        }

        /* ---------- Dendrites ---------- */

        function dressDend(p, w0, tipK, level, o) {
            var q = { x: 0, y: 0 }, q2 = { x: 0, y: 0 };
            var s = 0;
            var lvA = 1 - 0.13 * level;
            while (s <= p.len) {
                var u = s / Math.max(1, p.len);
                var w = Math.max(0.45, w0 * (1 - (1 - tipK) * u));
                pointAt(p, s, q); pointAt(p, Math.min(p.len, s + 2), q2);
                var dx = q2.x - q.x, dy = q2.y - q.y, dl = Math.hypot(dx, dy) || 1;
                var nx = -dy / dl, ny = dx / dl;
                var n = Math.max(1, Math.round(w * o.per));
                for (var k = 0; k < n; k++) {
                    var off = gauss() * w * 0.8;
                    var a = o.alpha * lvA * (0.6 + 0.4 * (1 - Math.min(1, Math.abs(off) / (w + 0.01)))) * (1 - 0.5 * u);
                    if (rnd() < 0.2) a *= 0.45;          // graphite grains
                    var sz = (o.size + rr(-0.2, 0.3)) * (1 - 0.28 * u);
                    particle(q.x + nx * off, q.y + ny * off, sz, a, p.id, s, 0, p.rootDist + s, o.drift);
                }
                // dendritic spines on the finer branches
                if (level >= 1 && rnd() < o.spines) {
                    var side = rnd() < 0.5 ? -1 : 1, ln = w + rr(1.4, 3.2);
                    particle(q.x + nx * side * ln, q.y + ny * side * ln, rr(0.9, 1.15), o.alpha * 0.4 * lvA, p.id, s, 0, p.rootDist + s, o.drift);
                }
                s += o.spacing * (1 + 0.9 * u) * rr(0.8, 1.2);
            }
        }

        // One dendrite segment and (recursively) its branches.
        // plan: optional explicit child placement (the apical dendrite).
        function dendrite(x, y, ang, len, w0, level, parent, parentS, rootDist, o, plan) {
            var run = freeRun(x, y, ang, len, o.margin);
            len = Math.min(len, run * 0.94);
            if (len < o.minLen) return null;

            var b1 = rr(-1, 1) * o.bend[level], b2 = rr(-1, 1) * o.bend[level] * 0.8;
            var a = { x: x, y: y },
                c1 = pol(x, y, ang + b1 * 0.35, len * 0.34),
                c2 = pol(x, y, ang + b1, len * 0.67),
                e = pol(x, y, ang + b1 + b2, len);
            var pts = cubic(a, c1, c2, e, 2);
            pts = wiggle(pts, Math.min(2.2, 0.5 + len * 0.01), rr(24, 46), rnd() * 6.28);

            // cut short where it would reach protected space
            for (var i = 4; i < pts.length; i += 2) {
                if (blocked(pts[i], pts[i + 1], o.margin)) { pts = pts.slice(0, i); break; }
            }
            if (pts.length < 10) return null;

            var p = newPath(pts, 0, 'dend', parent, parentS, rootDist);
            p.level = level;
            if (p.len < o.minLen * 0.7) { paths.pop(); if (parent) parent.children.pop(); return null; }

            var tipK = level === 0 ? 0.38 : 0.45;
            dressDend(p, w0, tipK, level, o);

            var kids = plan ? plan(p) : defaultKids(p, level, o);
            for (var k = 0; k < kids.length; k++) {
                var c = kids[k];
                var wc = w0 * (1 - (1 - tipK) * c.s / p.len) * 0.74;
                dendrite(c.x, c.y, c.a, c.len, Math.max(0.6, wc), c.level, p, c.s, rootDist + c.s, o);
            }

            if (!p.children.length) {
                leaves.push(p);
                // a faint terminal swelling
                particle(p.end.x, p.end.y, 1.2, o.alpha * 0.55, p.id, p.len, 0, rootDist + p.len, o.drift);
            }
            return p;
        }

        function defaultKids(p, level, o) {
            var range = o.kids[level] || [0, 0];
            var nk = range[0] + Math.floor(rnd() * (range[1] - range[0] + 1));
            var out = [], side = rnd() < 0.5 ? -1 : 1, q = { x: 0, y: 0 };
            for (var k = 0; k < nk; k++) {
                var s = p.len * (0.26 + 0.56 * (k + rr(0.15, 0.85)) / nk);
                pointAt(p, s, q);
                var t = angleAt(p, s);
                var want = (p.len - s) * rr(0.65, 1.0) + p.len * 0.18;
                var ca = t + side * rr(0.42, 0.85);
                // prefer the side with room
                var alt = t - side * rr(0.42, 0.85);
                if (freeRun(q.x, q.y, ca, want, o.margin) < want * 0.45 && freeRun(q.x, q.y, alt, want, o.margin) > freeRun(q.x, q.y, ca, want, o.margin)) ca = alt;
                out.push({ s: s, x: q.x, y: q.y, a: ca, len: want, level: level + 1 });
                side = -side;
            }
            return out;
        }

        // Apical dendrite: obliques along the shaft, a tuft at the top.
        function apicalPlan(o, nObl) {
            return function (p) {
                var out = [], q = { x: 0, y: 0 }, side = rnd() < 0.5 ? -1 : 1;
                for (var k = 0; k < nObl; k++) {
                    var s = p.len * (0.16 + 0.58 * (k + rr(0.2, 0.8)) / nObl);
                    pointAt(p, s, q);
                    var t = angleAt(p, s);
                    var want = p.len * rr(0.2, 0.36);
                    var ca = t + side * rr(0.55, 0.95);
                    out.push({ s: s, x: q.x, y: q.y, a: ca, len: want, level: 1 });
                    side = -side;
                }
                // tuft
                var tuft = stacked ? 2 : 3;
                for (var m = 0; m < tuft; m++) {
                    var s2 = p.len * rr(0.82, 0.95);
                    pointAt(p, s2, q);
                    var t2 = angleAt(p, s2);
                    var spread = (m - (tuft - 1) / 2) * 0.62 + rr(-0.12, 0.12);
                    if (Math.abs(spread) < 0.2) spread = (m % 2 ? 1 : -1) * 0.3;
                    out.push({ s: s2, x: q.x, y: q.y, a: t2 + spread, len: p.len * rr(0.18, 0.28), level: 1 });
                }
                return out;
            };
        }

        /* ---------- Axon ---------- */

        // Myelinated: a dotted sheath broken by nodes of Ranvier; bare at
        // the hillock and at the terminal.
        function dressAxon(p, o) {
            var q = { x: 0, y: 0 }, q2 = { x: 0, y: 0 };
            var s = 0, inGap = false, segLeft = o.internode;
            while (s <= p.len) {
                pointAt(p, s, q); pointAt(p, Math.min(p.len, s + 2), q2);
                var dx = q2.x - q.x, dy = q2.y - q.y, dl = Math.hypot(dx, dy) || 1;
                var nx = -dy / dl, ny = dx / dl;
                var hill = s < o.hillock, bare = p.len - s < o.bare;
                var dist = p.rootDist + s, st;
                if (hill) {
                    var w = o.w * (1 + 1.8 * Math.pow(1 - s / o.hillock, 1.5));
                    var n = Math.max(1, Math.round(w * 1.3));
                    for (var k = 0; k < n; k++) {
                        var off = gauss() * w * 0.75;
                        particle(q.x + nx * off, q.y + ny * off, rr(1.0, 1.35), o.alpha * rr(0.7, 1), p.id, s, p.group, dist, o.drift);
                    }
                    st = 1.6;
                } else if (bare) {
                    particle(q.x + nx * gauss() * 0.4, q.y + ny * gauss() * 0.4, rr(0.95, 1.2), o.alpha * 0.8, p.id, s, p.group, dist, o.drift);
                    st = o.step * 1.3;
                } else if (!inGap) {
                    for (var e = -1; e <= 1; e += 2) {
                        var oo = e * o.w * 0.8 + gauss() * 0.2;
                        particle(q.x + nx * oo, q.y + ny * oo, rr(0.95, 1.25), o.alpha * rr(0.75, 1), p.id, s, p.group, dist, o.drift);
                    }
                    if (rnd() < 0.45) particle(q.x, q.y, 0.95, o.alpha * 0.45, p.id, s, p.group, dist, o.drift);
                    st = o.step;
                    segLeft -= st;
                    if (segLeft <= 0) { inGap = true; }
                } else {
                    // node of Ranvier: a single fine point in a short gap
                    particle(q.x, q.y, 0.95, o.alpha * 0.55, p.id, s, p.group, dist, o.drift);
                    st = o.gap;
                    inGap = false;
                    segLeft = o.internode * (o.regular ? 1 : rr(0.82, 1.18));
                }
                s += st;
            }
        }

        // A small synaptic bouton.
        function bouton(x, y, n, r, alpha, p, s) {
            for (var i = 0; i < n; i++) {
                var a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r;
                particle(x + Math.cos(a) * d, y + Math.sin(a) * d, rr(1.0, 1.4), alpha * rr(0.65, 1), p.id, s, p.group, p.rootDist + s, 0.15);
            }
        }

        function buildAxon(anchors, axA) {
            var k = stacked ? 0.7 : 1;
            var nodeX = anchors[0].x0 - 1;          // just outside the node ring
            var gut = Math.max(30, nodeX - somaPt.x);
            var xT = stacked ? Math.max(vis0 + 6, nodeX - 22) : nodeX - clamp(gut * 0.62, 34, 92);
            // branch below each row's divider on phones, above it on desktop
            var lead = stacked ? 22 : 46;
            var y2 = anchors[2].y - lead;
            var A0 = pol(somaPt.x, somaPt.y, axA, somaR * 0.9);
            var dy = y2 - A0.y;

            var tp = cubic(A0, { x: A0.x + Math.cos(axA) * dy * 0.3, y: A0.y + dy * 0.32 }, { x: xT, y: y2 - dy * 0.42 }, { x: xT, y: y2 }, 2);
            tp = wiggle(tp, stacked ? 0.8 : 1.4, 70, 1.3);
            trunk = newPath(tp, G_TRUNK, 'axon', null, 0, somaR);
            var ax = { w: stacked ? 1.0 : 1.2, internode: 15 * k, gap: 3.2, step: stacked ? 1.9 : 1.55, hillock: stacked ? 14 : 20, bare: 0, alpha: 0.42, drift: 0.3 };
            dressAxon(trunk, ax);

            coll = [];
            var q = { x: 0, y: 0 };
            for (var i = 0; i < 3; i++) {
                var b = anchors[i], s, ang;
                if (i < 2) {
                    // branch off where the trunk passes above this row
                    s = 0;
                    for (var t = 0; t <= trunk.len; t += 2) { pointAt(trunk, t, q); if (q.y >= b.y - lead) { s = t; break; } }
                    pointAt(trunk, s, q);
                } else {
                    s = trunk.len - 0.5;
                    q.x = trunk.end.x; q.y = trunk.end.y;
                }
                ang = angleAt(trunk, s);
                var end = { x: nodeX - (stacked ? 2 : 3), y: b.y };
                var span = end.x - q.x;
                var lean = i < 2 ? -0.55 : -0.25;                       // turn toward the row
                var c1 = pol(q.x, q.y, ang + lean, Math.min(22, Math.max(10, (b.y - q.y) * 0.55)));
                var c2 = { x: end.x - Math.max(10, span * 0.55), y: end.y };
                var cp = cubic({ x: q.x, y: q.y }, c1, c2, end, 2);
                var C = newPath(cp, i + 1, 'coll', trunk, s, trunk.rootDist + s);
                C.idx = i;
                coll.push(C);

                var co = { w: stacked ? 0.8 : 0.95, internode: (i === 2 ? 11 : 9) * k, gap: 2.8, step: stacked ? 1.9 : 1.6, hillock: 0, bare: Math.min(16, C.len * 0.3), alpha: stacked ? 0.56 : 0.48, drift: 0.25, regular: i === 2 };
                dressAxon(C, co);

                if (i === 0) {
                    // 01 AI — a small terminal arbor: two forked twigs
                    [0.58, 0.76].forEach(function (f, m) {
                        var ts = C.len * f, tq = { x: 0, y: 0 };
                        pointAt(C, ts, tq);
                        var ta = angleAt(C, ts) + (m ? 0.75 : -0.75);
                        var L = (stacked ? 7 : 12) * rr(0.9, 1.15);
                        var tw = cubic(tq, pol(tq.x, tq.y, ta, L * 0.4), pol(tq.x, tq.y, ta + (m ? -0.3 : 0.3), L * 0.75), pol(tq.x, tq.y, ta + (m ? -0.45 : 0.45), L), 1.6);
                        var T = newPath(tw, 1, 'twig', C, ts, C.rootDist + ts);
                        for (var z = 0; z <= T.len; z += 1.7) { pointAt(T, z, tq); particle(tq.x, tq.y, rr(0.9, 1.15), 0.4, T.id, z, 1, T.rootDist + z, 0.25); }
                        bouton(T.end.x, T.end.y, 4, 1.6, 0.5, T, T.len);
                    });
                } else if (i === 1) {
                    // 02 ML — boutons en passant: small swellings along the fibre
                    [0.32, 0.52, 0.72].forEach(function (f) {
                        var bs = C.len * f, bq = { x: 0, y: 0 };
                        pointAt(C, bs, bq);
                        bouton(bq.x, bq.y, stacked ? 4 : 6, stacked ? 1.6 : 2.1, 0.55, C, bs);
                    });
                }
                // the synapse on the focus node
                bouton(end.x - 1.5, end.y, stacked ? 6 : 9, stacked ? 2 : 2.6, 0.62, C, C.len);
            }
        }

        /* ---------- Build ---------- */

        function build() {
            seed = 20260611;
            P = []; paths = []; leaves = []; coll = []; trunk = null; maxReach = 1;
            var anchors = measure();

            var o = {
                margin: stacked ? 6 : 10,
                minLen: stacked ? 9 : 12,
                spacing: stacked ? 2.1 : 1.6,
                per: stacked ? 1.1 : 1.35,
                size: stacked ? 1.15 : 1.25,
                alpha: 0.58,
                spines: stacked ? 0.05 : 0.09,
                drift: 0.35,
                bend: [0.3, 0.42, 0.5, 0.5],
                kids: [[2, 3], [1, 2], [0, 1], [0, 0]]
            };

            // Process directions (screen angles; y points down).
            var apA, axA, basal, apLen;
            if (!stacked) {
                apA = rad(-87); axA = rad(84);
                var L = clamp(W * 0.085, 96, 176);
                basal = [
                    { a: rad(-148), len: L * 0.95 },
                    { a: rad(170), len: L * 1.0 },
                    { a: rad(128), len: L * 0.85 },
                    { a: rad(22), len: L * 0.6 }
                ];
                apLen = somaPt.y - top0 - 10;
            } else {
                apA = rad(-91); axA = rad(96);
                var Lm = clamp(W * 0.36, 110, 210);
                basal = [
                    { a: rad(-16), len: Lm * 1.0 },
                    { a: rad(12), len: Lm * 1.15 },
                    { a: rad(40), len: Lm * 0.55 },
                    { a: rad(150), len: 40 }
                ];
                apLen = Math.min(somaPt.y - face.frame.y - face.frame.h * 0.1, face.frame.h * 0.82);
            }

            var dirs = [{ a: apA, k: 0.75 }, { a: axA, k: 0.42 }];
            basal.forEach(function (b) { dirs.push({ a: b.a, k: 0.32 }); });
            somaBody(somaPt.x, somaPt.y, somaR, dirs);

            // Apical dendrite: a calm, nearly straight shaft
            var oA = {};
            for (var key in o) oA[key] = o[key];
            oA.bend = [0.08, 0.4, 0.5, 0.5];
            var sp = pol(somaPt.x, somaPt.y, apA, somaR * 1.2);
            dendrite(sp.x, sp.y, apA, apLen, stacked ? 2.6 : 3.3, 0, null, 0, somaR, oA, apicalPlan(oA, stacked ? 4 : 5));

            // Basal dendrites
            basal.forEach(function (b) {
                var bp = pol(somaPt.x, somaPt.y, b.a, somaR * 0.95);
                dendrite(bp.x, bp.y, b.a, b.len, stacked ? 1.9 : 2.3, 0, null, 0, somaR, o);
            });

            // Axon and its three collaterals
            if (anchors.length === 3) buildAxon(anchors, axA);

            // Normalise "born" (distance from the soma) for the formation
            for (var b = 7; b < P.length; b += STRIDE) P[b] = Math.min(0.97, 0.02 + P[b] / maxReach * 0.95);

            count = P.length / STRIDE;
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
            P = [];

            for (var z = 0; z < MAXP; z++) pulses[z].on = false;
            for (var f = 0; f < MAXF; f++) flares[f].on = false;
            built = true;
        }

        function resize() {
            DPR = Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2);
            var w = Math.round(W * DPR), h = Math.round(H * DPR);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            gl.viewport(0, 0, w, h);
        }

        /* ---------- Impulses ---------- */

        function fire(path, dir, str, speed, chain) {
            for (var i = 0; i < MAXP; i++) {
                var p = pulses[i];
                if (!p.on) {
                    p.on = true; p.path = path; p.dir = dir; p.head = dir > 0 ? 0 : path.len;
                    p.str = str; p.speed = speed; p.chain = chain || 0; p.target = -1; p.fade = false;
                    return p;
                }
            }
            return null;
        }

        function flare(x, y, str, dur) {
            var best = flares[0];
            for (var i = 0; i < MAXF; i++) { if (!flares[i].on) { best = flares[i]; break; } if (flares[i].age > best.age) best = flares[i]; }
            best.on = true; best.x = x; best.y = y; best.age = 0; best.dur = dur || 700; best.str = str;
        }

        // Out of the soma, down the axon; target = collateral 0–2, or -1 for all.
        function fireAxon(target, str, fast) {
            if (!trunk) return;
            var p = fire(trunk, 1, str, (stacked ? 420 : 480) * (fast ? 1.25 : 1), 2);
            if (p) p.target = target;
        }

        function spontaneous() {
            if (leaves.length && rnd() < 0.8) {
                var leaf = leaves[Math.floor(rnd() * leaves.length)];
                fire(leaf, -1, rr(0.5, 0.8), rr(130, 200), 1);
            } else {
                fireAxon(rnd() < 0.3 ? -1 : Math.floor(rnd() * 3), 0.55);
            }
            // irregular: mostly calm, an occasional quick follow-up
            nextSpont = rnd() < 0.18 ? rr(240, 480) : rr(1200, 3000);
        }

        function step(dt) {
            nextSpont -= dt;
            if (nextSpont <= 0) spontaneous();

            for (var i = 0; i < MAXP; i++) {
                var p = pulses[i];
                if (!p.on) continue;
                var prev = p.head;
                p.head += p.dir * p.speed * dt / 1000;
                var path = p.path;

                if (p.fade) {
                    p.str *= Math.exp(-dt / 80);
                    if (p.str < 0.02) { p.on = false; continue; }
                }

                // outward: hand over to branches as the head passes them
                if (p.dir > 0 && !p.fade) {
                    var ch = path.children;
                    for (var c = 0; c < ch.length; c++) {
                        var cs = ch[c].parentS;
                        if (cs <= prev || cs > p.head) continue;
                        if (path === trunk) {
                            if (p.target >= 0 && ch[c].idx !== p.target) continue;
                            fire(ch[c], 1, p.str, p.speed * 0.8, 2);
                            if (p.target >= 0) p.fade = true;        // the impulse turns into the collateral
                        } else if (p.chain > 0 && rnd() < 0.85) {
                            fire(ch[c], 1, p.str * 0.8, p.speed * 0.8, p.chain - 1);
                        }
                    }
                }

                if (p.dir > 0 && p.head >= path.len + 14) {
                    p.on = false;
                    if (path.kind === 'coll' || path.kind === 'twig') {
                        flare(path.end.x, path.end.y, (path.kind === 'coll' ? 0.75 : 0.4) * p.str, 750);
                    }
                } else if (p.dir < 0 && p.head <= -14) {
                    p.on = false;
                    if (path.parent) {
                        var up = fire(path.parent, -1, p.str * 0.97, p.speed, 1);
                        if (up) up.head = path.parentS;
                    } else if (path.kind === 'dend') {
                        // the signal reaches the cell body
                        flare(somaPt.x, somaPt.y, 0.28, 520);
                        if (rnd() < 0.4) fireAxon(rnd() < 0.25 ? -1 : Math.floor(rnd() * 3), 0.6);
                    }
                }
            }

            for (var f = 0; f < MAXF; f++) {
                var F = flares[f];
                if (!F.on) continue;
                F.age += dt / F.dur;
                if (F.age >= 1) F.on = false;
            }

            var ease = 1 - Math.exp(-dt / 200);
            for (var k = 0; k < 3; k++) focusCur[k] += (focusTgt[k] - focusCur[k]) * ease;
            anyCur += (anyTgt - anyCur) * ease;
        }

        /* ---------- Draw ---------- */

        function draw() {
            if (!built) return;
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform2f(U.uRes, W, H);
            gl.uniform1f(U.uTime, clock);
            gl.uniform1f(U.uGrow, grow);
            gl.uniform1f(U.uDpr, DPR);
            gl.uniform1f(U.uTail, stacked ? 12 : 16);
            gl.uniform1f(U.uAny, anyCur);
            gl.uniform3f(U.uFocus, focusCur[0], focusCur[1], focusCur[2]);

            var ns = 0;
            for (var i = 0; i < MAXP; i++) {
                var p = pulses[i], o = i * 4;
                if (p.on && grow > 0.9) {
                    pulseU[o] = p.path.id; pulseU[o + 1] = p.head; pulseU[o + 2] = p.dir; pulseU[o + 3] = p.str;
                    if (p.head >= 0 && p.head <= p.path.len) {
                        pointAt(p.path, p.head, tmp);
                        var b = ns * STRIDE;
                        sparkData[b] = tmp.x; sparkData[b + 1] = tmp.y; sparkData[b + 2] = stacked ? 2.5 : 2.9; sparkData[b + 3] = 1.1 * p.str;
                        sparkData[b + 4] = -9; sparkData[b + 5] = 0; sparkData[b + 6] = p.path.group; sparkData[b + 7] = 0;
                        sparkData[b + 8] = maskAt(tmp.x, tmp.y); sparkData[b + 9] = 0.5; sparkData[b + 10] = 0;
                        ns++;
                    }
                } else {
                    pulseU[o] = -9; pulseU[o + 1] = 0; pulseU[o + 2] = 1; pulseU[o + 3] = 0;
                }
            }
            for (var f = 0; f < MAXF; f++) {
                var F = flares[f], q = f * 4;
                flareU[q] = F.x; flareU[q + 1] = F.y; flareU[q + 2] = F.age; flareU[q + 3] = F.on && grow > 0.9 ? F.str : 0;
            }
            gl.uniform4fv(U.uPulse, pulseU);
            gl.uniform4fv(U.uFlare, flareU);

            bindAttribs(buf);
            gl.drawArrays(gl.POINTS, 0, count);

            if (ns) {
                bindAttribs(sparkBuf);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, sparkData.subarray(0, ns * STRIDE));
                gl.drawArrays(gl.POINTS, 0, ns);
            }
        }

        /* ---------- Loop ---------- */

        function frame(now) {
            raf = 0;
            if (!running) return;
            var dt = Math.min(50, Math.max(0, now - last));
            last = now;
            clock += dt;
            if (growing) {
                grow = Math.min(1.06, grow + dt / 2400 * 1.06);
                if (grow >= 1.06) growing = false;
            }
            step(dt);
            draw();
            raf = requestAnimationFrame(frame);
        }

        function start() {
            if (running || !built || reduceMQ.matches || document.hidden || !visible) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        }

        function stop() {
            running = false;
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        }

        function still() {
            // one calm frame: fully formed, no impulses
            grow = 1.06; growing = false;
            for (var i = 0; i < MAXP; i++) pulses[i].on = false;
            for (var f = 0; f < MAXF; f++) flares[f].on = false;
            for (var k = 0; k < 3; k++) focusCur[k] = focusTgt[k];
            anyCur = anyTgt;
            draw();
        }

        /* ---------- Public ---------- */

        function relayout() {
            if (!gl) return;
            build();
            resize();
            if (reduceMQ.matches) still(); else draw();
        }

        function init() {
            if (!setupGL()) return;

            relayout();

            var t = 0;
            if ('ResizeObserver' in window) {
                var lastW = 0, lastH = 0;
                new ResizeObserver(function () {
                    var r = stage.getBoundingClientRect();
                    if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
                    lastW = r.width; lastH = r.height;
                    clearTimeout(t);
                    t = setTimeout(relayout, 120);
                }).observe(stage);
            } else {
                window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(relayout, 160); });
            }
            // web fonts can shift text boxes after first layout
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { relayout(); });

            if ('IntersectionObserver' in window) {
                new IntersectionObserver(function (entries) {
                    visible = entries[0].isIntersecting;
                    if (visible) {
                        if (grow === 0 && !reduceMQ.matches) growing = true;
                        start();
                    } else {
                        stop();
                    }
                }, { rootMargin: '80px 0px' }).observe(stage);
            } else {
                visible = true; growing = true; start();
            }

            document.addEventListener('visibilitychange', function () {
                if (document.hidden) stop(); else start();
            });

            var onMotion = function () {
                if (reduceMQ.matches) { stop(); still(); } else start();
            };
            if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onMotion);
            else if (reduceMQ.addListener) reduceMQ.addListener(onMotion);

            canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); built = false; });
            canvas.addEventListener('webglcontextrestored', function () {
                if (setupGL()) { relayout(); start(); }
            });

            if (reduceMQ.matches) still();
        }

        function focus(i) {
            for (var k = 0; k < 3; k++) focusTgt[k] = k === i ? 1 : 0;
            anyTgt = i >= 0 ? 1 : 0;
            if (!gl || !built) return;
            if (reduceMQ.matches) { still(); return; }
            if (i >= 0) {
                if (grow < 1) { grow = 1.06; growing = false; }
                // one impulse: soma → axon → this collateral
                flare(somaPt.x, somaPt.y, 0.22, 420);
                fireAxon(i, 1, true);
            }
        }

        return { init: init, focus: focus };
    }
})();
