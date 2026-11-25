/* =========================================================
   NIGHT SKY BACKGROUND
   A fixed, minimal star field behind the whole page:
   - three parallax star layers that drift as you scroll
   - constellations themed on maths & AI, which brighten as
     they pass through the middle of the screen
   - an occasional, subtle shooting star (starlight-roof style)
   Respects prefers-reduced-motion and pauses in hidden tabs.
   ========================================================= */

(function () {
    "use strict";

    var canvas = document.getElementById("night-sky");
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext("2d");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* ---------- Seeded random: same sky on every load ---------- */
    function mulberry32(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ---------- Constellations ----------
       Points are in a unit box, scaled per screen size.
       Real constellations named after mathematical instruments,
       plus one invented "Perceptron" (a tiny neural network). */
    var CONSTELLATIONS = [
        {
            name: "Triangulum",
            side: 0.78,
            stars: [[0.0, 0.85], [0.82, 0.12], [0.94, 0.4], [1.0, 0.56]],
            lines: [[0, 1], [1, 3], [3, 0]],
        },
        {
            name: "Perceptron",
            side: 0.16,
            stars: [
                [0.0, 0.05], [0.0, 0.5], [0.0, 0.95],
                [0.5, 0.25], [0.5, 0.75],
                [1.0, 0.5],
            ],
            lines: [[0, 3], [0, 4], [1, 3], [1, 4], [2, 3], [2, 4], [3, 5], [4, 5]],
        },
        {
            name: "Circinus",
            side: 0.84,
            stars: [[0.5, 1.0], [0.18, 0.0], [0.7, 0.04]],
            lines: [[0, 1], [0, 2]],
        },
        {
            name: "Norma",
            side: 0.2,
            stars: [[0.05, 0.0], [0.0, 0.92], [0.78, 1.0], [0.42, 0.5]],
            lines: [[0, 1], [1, 2], [2, 0]],
        },
        {
            name: "Octans",
            side: 0.8,
            stars: [[0.0, 0.35], [1.0, 0.0], [0.55, 1.0]],
            lines: [[0, 1], [1, 2], [2, 0]],
        },
        {
            name: "Sextans",
            side: 0.18,
            stars: [[0.0, 0.7], [0.38, 0.12], [0.72, 0.42], [1.0, 0.95]],
            lines: [[0, 1], [1, 2], [2, 3]],
        },
    ];

    /* ---------- Star layers (far → near) ---------- */
    var LAYERS = [
        { share: 0.55, speed: 0.02, rMin: 0.35, rMax: 0.7, aMin: 0.25, aMax: 0.55 },
        { share: 0.33, speed: 0.05, rMin: 0.55, rMax: 1.0, aMin: 0.35, aMax: 0.75 },
        { share: 0.12, speed: 0.1, rMin: 0.9, rMax: 1.4, aMin: 0.55, aMax: 0.95 },
    ];

    var W = 0, H = 0, DPR = 1;
    var stars = [];
    var shooting = null;
    var nextShootAt = 0;
    var scrollTarget = 0, scrollCurrent = 0;
    var running = false;

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        buildStars();
        if (!running) draw(performance.now());
    }

    function buildStars() {
        var rand = mulberry32(2026);
        var total = Math.min(420, Math.round((W * H) / 5200));
        stars = [];

        LAYERS.forEach(function (layer, li) {
            var n = Math.round(total * layer.share);
            for (var i = 0; i < n; i++) {
                stars.push({
                    layer: li,
                    x: rand() * W,
                    y: rand() * H,
                    r: layer.rMin + rand() * (layer.rMax - layer.rMin),
                    a: layer.aMin + rand() * (layer.aMax - layer.aMin),
                    tw: 0.4 + rand() * 1.2,   // twinkle speed
                    ph: rand() * Math.PI * 2, // twinkle phase
                });
            }
        });
    }

    function mod(n, m) {
        return ((n % m) + m) % m;
    }

    /* ---------- Constellation layout ----------
       They sit on a tall virtual strip that scrolls past once
       over the length of the page, alternating left / right
       so they frame the content rather than sit behind it. */
    function constellationLayout() {
        var mobile = W < 768;
        var size = mobile ? Math.min(W * 0.42, 170) : Math.min(W * 0.17, 250);
        var gap = H * 0.85;
        var strip = gap * CONSTELLATIONS.length;
        var maxScroll = Math.max(1, document.documentElement.scrollHeight - H);
        var speed = Math.min(0.5, Math.max(0.12, strip / maxScroll));
        return { size: size, gap: gap, strip: strip, speed: speed, mobile: mobile };
    }

    function drawConstellations(t, L) {
        var offset = scrollCurrent * L.speed;

        // The hero has its own neural constellation, so the sky's
        // constellations fade in only once you scroll past it.
        var heroFade = Math.min(1, Math.max(0, (scrollCurrent - H * 0.35) / (H * 0.5)));
        if (heroFade <= 0) return;
        ctx.save();
        ctx.globalAlpha = heroFade;

        CONSTELLATIONS.forEach(function (c, i) {
            var cx = c.side * W;
            var cy = mod(i * L.gap + H * 0.3 - offset, L.strip) - L.size * 0.5;

            // Skip if off screen (with margin for labels)
            if (cy < -L.size * 1.6 || cy > H + L.size * 0.6) return;

            // Brighter near the middle of the viewport
            var mid = cy + L.size * 0.5;
            var focus = 1 - Math.min(1, Math.abs(mid - H * 0.5) / (H * 0.6));
            focus = focus * focus * (3 - 2 * focus); // smoothstep

            var ox = cx - L.size * 0.5;
            var pts = c.stars.map(function (p) {
                return [ox + p[0] * L.size, cy + p[1] * L.size];
            });

            // Lines
            ctx.lineWidth = 0.7;
            ctx.strokeStyle = "rgba(255,255,255," + (0.05 + focus * 0.17).toFixed(3) + ")";
            ctx.beginPath();
            c.lines.forEach(function (ln) {
                ctx.moveTo(pts[ln[0]][0], pts[ln[0]][1]);
                ctx.lineTo(pts[ln[1]][0], pts[ln[1]][1]);
            });
            ctx.stroke();

            // Stars with a soft halo
            pts.forEach(function (p, k) {
                var tw = reduceMotion.matches ? 1 : 0.85 + 0.15 * Math.sin(t * 0.0012 + i * 1.7 + k);
                var a = (0.45 + focus * 0.5) * tw;

                ctx.fillStyle = "rgba(255,255,255," + (a * 0.12).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(p[0], p[1], 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(p[0], p[1], 1.5, 0, Math.PI * 2);
                ctx.fill();
            });

            // Label
            var minY = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
            var maxY = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
            ctx.font = "500 " + (L.mobile ? 8 : 9) + "px Figtree, sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255," + (0.08 + focus * 0.22).toFixed(3) + ")";
            if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
            ctx.fillText(c.name.toUpperCase(), cx, maxY + 26 > H ? minY - 16 : maxY + 26);
        });

        ctx.restore();
    }

    /* ---------- Shooting star ---------- */
    function scheduleShootingStar(now) {
        nextShootAt = now + 7000 + Math.random() * 9000; // every 7–16 s
    }

    function spawnShootingStar(now) {
        var leftToRight = Math.random() < 0.5;
        var angle = (leftToRight ? 25 : 155) + (Math.random() * 14 - 7); // degrees, gently downward
        var rad = (angle * Math.PI) / 180;
        shooting = {
            x: W * (leftToRight ? 0.1 + Math.random() * 0.5 : 0.4 + Math.random() * 0.5),
            y: H * (0.05 + Math.random() * 0.4),
            dx: Math.cos(rad),
            dy: Math.sin(rad),
            dist: Math.min(W, H) * (0.22 + Math.random() * 0.12),
            len: 70 + Math.random() * 60,
            born: now,
            life: 900 + Math.random() * 400,
        };
    }

    function drawShootingStar(now) {
        var s = shooting;
        var p = (now - s.born) / s.life;
        if (p >= 1) {
            shooting = null;
            return;
        }

        var ease = 1 - Math.pow(1 - p, 3); // fast start, soft finish
        var hx = s.x + s.dx * s.dist * ease;
        var hy = s.y + s.dy * s.dist * ease;
        var len = s.len * (p < 0.2 ? p / 0.2 : 1);
        var tx = hx - s.dx * len;
        var ty = hy - s.dy * len;
        var alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;

        var g = ctx.createLinearGradient(tx, ty, hx, hy);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(1, "rgba(255,255,255," + (0.85 * alpha).toFixed(3) + ")");

        ctx.strokeStyle = g;
        ctx.lineWidth = 1.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255," + (0.9 * alpha).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(hx, hy, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    /* ---------- Frame ---------- */
    function draw(now) {
        ctx.clearRect(0, 0, W, H);

        var still = reduceMotion.matches;

        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            var y = mod(s.y - scrollCurrent * LAYERS[s.layer].speed, H);
            var a = still ? s.a : s.a * (0.7 + 0.3 * Math.sin(now * 0.001 * s.tw + s.ph));
            ctx.fillStyle = "rgba(255,255,255," + a.toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }

        drawConstellations(now, constellationLayout());

        if (shooting) drawShootingStar(now);
    }

    function loop(now) {
        if (!running) return;

        // Ease toward the real scroll position so the sky glides
        scrollCurrent += (scrollTarget - scrollCurrent) * 0.07;
        if (Math.abs(scrollTarget - scrollCurrent) < 0.05) scrollCurrent = scrollTarget;

        if (!shooting && now >= nextShootAt) {
            spawnShootingStar(now);
            scheduleShootingStar(now);
        }

        draw(now);
        requestAnimationFrame(loop);
    }

    function start() {
        if (running || reduceMotion.matches || document.hidden) return;
        running = true;
        scheduleShootingStar(performance.now());
        requestAnimationFrame(loop);
    }

    function stop() {
        running = false;
    }

    /* ---------- Events ---------- */
    window.addEventListener("scroll", function () {
        scrollTarget = window.scrollY || window.pageYOffset || 0;
        if (!running) {
            scrollCurrent = scrollTarget;
            draw(performance.now());
        }
    }, { passive: true });

    var resizeTimer;
    window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    document.addEventListener("visibilitychange", function () {
        if (document.hidden) stop();
        else start();
    });

    function onMotionChange() {
        if (reduceMotion.matches) {
            stop();
            shooting = null;
            draw(performance.now());
        } else {
            start();
        }
    }
    if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", onMotionChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onMotionChange);

    scrollTarget = scrollCurrent = window.scrollY || 0;
    resize();
    start();

    // Re-draw once web fonts are ready so labels use Figtree
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
            if (!running) draw(performance.now());
        });
    }
})();
