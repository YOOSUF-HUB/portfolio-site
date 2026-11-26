/*
 * PROJECT VISUALS
 *
 * Lightweight monochrome SVG diagrams for projects that have no real
 * screenshot. Each one is drawn from what the project actually does
 * (its architecture, data flow or interface) — no invented numbers.
 *
 * Every drawing uses a 400 × 250 viewBox and a handful of stroke/fill
 * classes styled in projects.css, so the colours follow the theme.
 *
 *   window.ProjectVisuals.render(project)  → SVG markup string
 */
(function (root) {
    "use strict";

    var W = 400;
    var H = 250;

    /* ---------- tiny drawing helpers ---------- */

    function rect(x, y, w, h, cls, rx) {
        return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx == null ? 3 : rx) + '" class="' + (cls || "pv-m") + '"/>';
    }

    function line(x1, y1, x2, y2, cls) {
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="' + (cls || "pv-l") + '"/>';
    }

    function path(d, cls) {
        return '<path d="' + d + '" class="' + (cls || "pv-m") + '"/>';
    }

    function circle(cx, cy, r, cls) {
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="' + (cls || "pv-m") + '"/>';
    }

    function text(x, y, str, anchor, cls) {
        return '<text x="' + x + '" y="' + y + '" text-anchor="' + (anchor || "start") + '" class="' + (cls || "pv-t") + '">' + str + "</text>";
    }

    // A connector with a small chevron at its end
    function arrow(x1, y1, x2, y2, cls) {
        var a = Math.atan2(y2 - y1, x2 - x1);
        var s = 4.5;
        var p1 = (x2 - s * Math.cos(a - 0.5)).toFixed(1) + "," + (y2 - s * Math.sin(a - 0.5)).toFixed(1);
        var p2 = (x2 - s * Math.cos(a + 0.5)).toFixed(1) + "," + (y2 - s * Math.sin(a + 0.5)).toFixed(1);
        return line(x1, y1, x2, y2, cls || "pv-l pv-flow") + '<path d="M' + p1 + " L" + x2 + "," + y2 + " L" + p2 + '" class="pv-m"/>';
    }

    // Text placeholder lines inside a panel
    function lines(x, y, widths, gap, cls) {
        var out = "";
        for (var i = 0; i < widths.length; i++) {
            out += line(x, y + i * (gap || 8), x + widths[i], y + i * (gap || 8), cls || "pv-l");
        }
        return out;
    }

    // Database cylinder
    function cylinder(cx, top, rx, h, cls) {
        var ry = rx * 0.32;
        return (
            '<ellipse cx="' + cx + '" cy="' + top + '" rx="' + rx + '" ry="' + ry + '" class="' + (cls || "pv-m") + '"/>' +
            path("M" + (cx - rx) + "," + top + " V" + (top + h) + " A" + rx + "," + ry + " 0 0 0 " + (cx + rx) + "," + (top + h) + " V" + top, cls || "pv-m") +
            path("M" + (cx - rx) + "," + (top + h / 2) + " A" + rx + "," + ry + " 0 0 0 " + (cx + rx) + "," + (top + h / 2), "pv-l")
        );
    }

    // Deterministic pseudo-random numbers, so a drawing never changes between loads
    function seeded(seed) {
        var s = seed;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    /* ---------- one drawing per project ---------- */

    var V = {};

    // Multi-agent RAG over legal documents
    V["avjns"] = {
        label: "Diagram: legal documents are retrieved and passed to several cooperating agents that produce guidance",
        draw: function () {
            var o = "";
            o += rect(38, 66, 62, 82, "pv-l pv-ff") + rect(32, 72, 62, 82, "pv-l pv-ff") + rect(26, 78, 62, 82, "pv-m pv-bg");
            o += lines(36, 94, [40, 34, 42, 28, 38, 22], 9);
            o += text(57, 186, "LEGAL CORPUS", "middle");
            o += arrow(96, 119, 138, 119);
            o += circle(160, 119, 19, "pv-s pv-bg") + circle(160, 119, 7, "pv-m");
            o += line(165, 124, 171, 130, "pv-m");
            o += text(160, 162, "RETRIEVE", "middle");
            var ys = [64, 119, 174];
            ys.forEach(function (y) {
                o += arrow(179, 119, 237, y);
                o += circle(252, y, 14, "pv-s pv-bg") + circle(252, y, 3.5, "pv-f");
            });
            o += path("M266,64 C285,80 285,103 266,119", "pv-l pv-dash");
            o += path("M266,119 C285,135 285,158 266,174", "pv-l pv-dash");
            o += text(252, 212, "AGENTS", "middle");
            ys.forEach(function (y) { o += arrow(267, y, 300, 119); });
            o += rect(304, 92, 74, 54, "pv-s pv-bg", 4);
            o += lines(314, 108, [52, 40, 46], 10, "pv-m");
            o += text(341, 168, "GUIDANCE", "middle");
            return o;
        }
    };

    // MCP server exposing safe tools to Claude Desktop
    V["ai-project-manager"] = {
        label: "Diagram: Claude Desktop calls four predefined tools on an MCP server, which reads SQLite and writes an audit log",
        draw: function () {
            var o = "";
            o += rect(18, 92, 78, 66, "pv-m pv-bg", 4);
            o += line(18, 106, 96, 106, "pv-l");
            o += circle(25, 99, 1.6, "pv-f") + circle(31, 99, 1.6, "pv-l") + circle(37, 99, 1.6, "pv-l");
            o += rect(28, 114, 46, 9, "pv-l pv-ff", 4) + rect(42, 129, 44, 9, "pv-m", 4) + rect(28, 144, 34, 7, "pv-l pv-ff", 3);
            o += text(57, 176, "CLAUDE DESKTOP", "middle");
            o += rect(132, 34, 136, 182, "pv-s pv-bg", 5);
            o += text(146, 54, "MCP SERVER", "start", "pv-t pv-t-strong");
            o += line(132, 64, 268, 64, "pv-l");
            var tools = ["SPRINT RISK", "WORKLOAD", "CLIENT STATUS", "WRITE + AUDIT"];
            tools.forEach(function (t, i) {
                var y = 76 + i * 33;
                o += rect(144, y, 112, 23, i === 3 ? "pv-m pv-ff" : "pv-l", 3);
                o += rect(152, y + 9, 5, 5, i === 3 ? "pv-f" : "pv-m", 1);
                o += text(165, y + 15, t, "start", "pv-t pv-t-sm");
                o += arrow(102, 125, 140, y + 11);
            });
            o += cylinder(330, 66, 30, 58, "pv-s pv-bg");
            o += text(330, 146, "SQLITE", "middle");
            o += arrow(260, 87, 296, 87);
            o += arrow(260, 120, 296, 104);
            o += rect(302, 170, 58, 12, "pv-l pv-bg", 2) + rect(306, 176, 58, 12, "pv-l pv-bg", 2) + rect(310, 182, 58, 12, "pv-m pv-bg", 2);
            o += lines(316, 188, [34], 0, "pv-m");
            o += arrow(260, 186, 298, 186);
            o += text(339, 212, "AUDIT LOG", "middle");
            return o;
        }
    };

    // MCP tools over a pharmacy inventory, with an approval gate on writes
    V["pharmacy-inventory-mcp"] = {
        label: "Diagram: an AI client uses stock, reorder and expiry tools; writes pass an approval gate before reaching the SQLite inventory",
        draw: function () {
            var o = "";
            o += rect(16, 102, 60, 42, "pv-m pv-bg", 4);
            o += circle(46, 118, 6, "pv-m") + line(36, 133, 56, 133, "pv-l");
            o += text(46, 162, "AI CLIENT", "middle");
            var tools = ["STOCK", "REORDER", "EXPIRY"];
            tools.forEach(function (t, i) {
                var y = 62 + i * 44;
                o += rect(104, y, 72, 26, "pv-m pv-bg", 13);
                o += text(140, y + 16.5, t, "middle", "pv-t pv-t-sm");
                o += arrow(78, 123, 101, y + 13);
            });
            o += path("M206,112 L218,124 L206,136 L194,124 Z", "pv-s pv-bg");
            o += circle(206, 124, 2.2, "pv-f");
            o += text(206, 156, "APPROVAL", "middle");
            o += arrow(178, 119, 192, 122);
            o += cylinder(248, 98, 18, 44, "pv-s pv-bg");
            o += arrow(220, 124, 228, 124);
            o += text(248, 172, "SQLITE", "middle");
            var levels = [0.82, 0.36, 0.7, 0.24, 0.9, 0.58, 0.3, 0.76];
            var base = 196;
            var threshold = base - 0.42 * 130;
            levels.forEach(function (l, i) {
                var h = l * 130;
                o += rect(290 + i * 12, base - h, 7, h, l < 0.42 ? "pv-f" : "pv-l pv-ff", 1);
            });
            o += line(284, threshold, 390, threshold, "pv-m pv-dash");
            o += line(284, base, 390, base, "pv-l");
            o += text(337, 216, "REORDER LEVEL", "middle");
            return o;
        }
    };

    // Four-dimension scoring rubric feeding a constrained MVP plan
    V["idea-forge"] = {
        label: "Diagram: an idea is scored on clarity, feasibility, novelty and demand, then turned into an MVP plan checklist",
        draw: function () {
            var o = "";
            var cx = 128, cy = 124, r = 80;
            [1, 0.66, 0.33].forEach(function (k) {
                o += path("M" + cx + "," + (cy - r * k) + " L" + (cx + r * k) + "," + cy + " L" + cx + "," + (cy + r * k) + " L" + (cx - r * k) + "," + cy + " Z", k === 1 ? "pv-m" : "pv-l");
            });
            o += line(cx, cy - r, cx, cy + r, "pv-l") + line(cx - r, cy, cx + r, cy, "pv-l");
            var v = [0.82, 0.62, 0.74, 0.9];
            var pts = [[cx, cy - r * v[0]], [cx + r * v[1], cy], [cx, cy + r * v[2]], [cx - r * v[3], cy]];
            o += path("M" + pts.map(function (p) { return p.join(","); }).join(" L") + " Z", "pv-s pv-ff2");
            pts.forEach(function (p) { o += circle(p[0], p[1], 2.6, "pv-f"); });
            o += text(cx, cy - r - 9, "CLARITY", "middle");
            o += text(cx + r + 6, cy + 3, "FEASIBILITY", "start");
            o += text(cx, cy + r + 15, "NOVELTY", "middle");
            o += text(cx - r - 6, cy + 3, "DEMAND", "end");
            o += arrow(262, 124, 288, 124);
            o += rect(292, 58, 94, 132, "pv-s pv-bg", 4);
            o += text(304, 78, "MVP PLAN", "start", "pv-t pv-t-strong");
            o += line(292, 88, 386, 88, "pv-l");
            [0, 1, 2, 3].forEach(function (i) {
                var y = 104 + i * 21;
                o += rect(304, y - 5, 9, 9, i < 2 ? "pv-f" : "pv-m", 2);
                o += line(320, y, 320 + [52, 44, 56, 38][i], y, i < 2 ? "pv-m" : "pv-l");
            });
            return o;
        }
    };

    // Conversational data analyst: question → deterministic tools → chart + insight
    V["open-analyst"] = {
        label: "Diagram: a dataset and a plain-language question go to deterministic analysis tools orchestrated by an LLM, producing a chart and insights",
        draw: function () {
            var o = "";
            o += rect(16, 46, 86, 104, "pv-m pv-bg", 3);
            for (var r = 1; r < 7; r++) o += line(16, 46 + r * 14.8, 102, 46 + r * 14.8, "pv-l");
            o += line(44, 46, 44, 150, "pv-l") + line(72, 46, 72, 150, "pv-l");
            o += rect(16, 46, 86, 14.8, "pv-m pv-ff", 0);
            o += text(59, 168, "DATASET", "middle");
            o += rect(126, 40, 118, 34, "pv-s pv-bg", 10);
            o += lines(138, 53, [82, 58], 9, "pv-m");
            o += path("M140,74 L136,82 L148,74", "pv-s");
            o += text(185, 98, "ASK IN PLAIN LANGUAGE", "middle");
            o += arrow(104, 98, 124, 98);
            ["STATS", "CHART", "INSIGHT"].forEach(function (t, i) {
                var x = 126 + i * 40;
                o += rect(x, 124, 36, 22, "pv-m pv-bg", 11);
                o += text(x + 18, 138, t, "middle", "pv-t pv-t-xs");
                o += arrow(185, 106, x + 18, 121);
            });
            o += text(185, 170, "LLM ORCHESTRATES TOOLS", "middle");
            o += arrow(246, 135, 268, 112);
            o += rect(270, 38, 116, 118, "pv-s pv-bg", 4);
            var bars = [0.42, 0.66, 0.5, 0.86, 0.72, 0.58];
            bars.forEach(function (b, i) {
                o += rect(284 + i * 15, 136 - b * 78, 9, b * 78, i === 3 ? "pv-f" : "pv-l pv-ff", 1);
            });
            o += path("M288,108 L303,88 L318,96 L333,64 L348,74 L363,84", "pv-s pv-noFill");
            o += line(280, 136, 376, 136, "pv-m");
            o += lines(270, 176, [116, 88, 102], 9, "pv-l");
            o += rect(270, 170, 3, 24, "pv-f", 0);
            return o;
        }
    };

    // API specification → security analysis → findings
    V["api-sentinel-ai"] = {
        label: "Diagram: endpoints from an API specification are analysed for vulnerabilities and returned as flagged findings",
        draw: function () {
            var o = "";
            o += rect(16, 40, 120, 156, "pv-m pv-bg", 4);
            o += text(28, 60, "API SPEC", "start", "pv-t pv-t-strong");
            o += line(16, 70, 136, 70, "pv-l");
            ["GET", "POST", "PUT", "DELETE", "GET", "POST"].forEach(function (m, i) {
                var y = 86 + i * 18;
                o += text(26, y + 3, m, "start", "pv-t pv-t-xs");
                o += line(62, y, 62 + [54, 40, 48, 36, 58, 44][i], y, i === 3 ? "pv-s" : "pv-l");
            });
            o += arrow(140, 118, 168, 118);
            o += path("M200,58 L232,70 V112 C232,140 216,160 200,170 C184,160 168,140 168,112 V70 Z", "pv-s pv-bg");
            o += line(176, 104, 224, 104, "pv-m pv-scan");
            o += path("M188,112 L197,121 L213,100", "pv-s pv-noFill");
            o += text(200, 196, "ANALYSE", "middle");
            o += arrow(236, 118, 262, 118);
            o += rect(266, 54, 120, 128, "pv-s pv-bg", 4);
            o += text(278, 74, "FINDINGS", "start", "pv-t pv-t-strong");
            o += line(266, 84, 386, 84, "pv-l");
            [true, false, true, false].forEach(function (flag, i) {
                var y = 102 + i * 20;
                o += rect(278, y - 5, 9, 9, flag ? "pv-f" : "pv-m", 1);
                o += line(296, y, 296 + [70, 56, 62, 48][i], y, flag ? "pv-m" : "pv-l");
            });
            return o;
        }
    };

    // PDF → chunks → FAISS vectors → cited answer
    V["complyai"] = {
        label: "Diagram: a policy PDF is chunked and embedded into a FAISS index, and answers cite the retrieved source passages",
        draw: function () {
            var o = "";
            o += path("M16,46 H66 L82,62 V150 H16 Z", "pv-m pv-bg");
            o += path("M66,46 V62 H82", "pv-m pv-noFill");
            o += lines(26, 76, [46, 38, 48, 30, 44, 36, 26], 10);
            o += text(49, 168, "POLICY PDF", "middle");
            o += arrow(86, 98, 104, 98);
            for (var r = 0; r < 4; r++) {
                for (var c = 0; c < 3; c++) {
                    o += rect(110 + c * 18, 62 + r * 18, 14, 14, r === 1 && c === 2 ? "pv-f" : "pv-l pv-ff", 2);
                }
            }
            o += text(136, 152, "CHUNKS", "middle");
            o += arrow(166, 98, 186, 98);
            var rnd = seeded(7);
            var q = [244, 104];
            var pts = [];
            for (var i = 0; i < 30; i++) pts.push([194 + rnd() * 96, 44 + rnd() * 120]);
            pts.sort(function (a, b) {
                return Math.hypot(a[0] - q[0], a[1] - q[1]) - Math.hypot(b[0] - q[0], b[1] - q[1]);
            });
            pts.forEach(function (p, i) {
                if (i < 3) o += line(q[0], q[1], p[0], p[1], "pv-m");
                o += circle(p[0], p[1], i < 3 ? 2.8 : 1.8, i < 3 ? "pv-f" : "pv-dot");
            });
            o += line(q[0] - 5, q[1], q[0] + 5, q[1], "pv-s") + line(q[0], q[1] - 5, q[0], q[1] + 5, "pv-s");
            o += circle(q[0], q[1], 9, "pv-m pv-dash");
            o += text(242, 186, "FAISS INDEX", "middle");
            o += arrow(294, 104, 310, 104);
            o += rect(314, 60, 72, 92, "pv-s pv-bg", 4);
            o += lines(324, 78, [50, 42, 52, 34], 10, "pv-m");
            o += text(324, 130, "[1]", "start", "pv-t pv-t-strong") + text(342, 130, "[2]", "start", "pv-t pv-t-strong");
            o += text(350, 170, "CITED ANSWER", "middle");
            return o;
        }
    };

    // Embedding → unrolled LSTM → polarity
    V["sentiment-analysis"] = {
        label: "Diagram: review tokens are embedded and read by an unrolled LSTM whose final state classifies sentiment as positive or negative",
        draw: function () {
            var o = "";
            var n = 5;
            for (var i = 0; i < n; i++) {
                var x = 26 + i * 64;
                o += rect(x, 92, 44, 44, "pv-s pv-bg", 6);
                o += path("M" + (x + 8) + ",122 C" + (x + 18) + ",122 " + (x + 18) + ",106 " + (x + 36) + ",106", "pv-m pv-noFill");
                o += circle(x + 22, 114, 2, "pv-f");
                if (i < n - 1) o += arrow(x + 46, 114, x + 62, 114);
                o += rect(x + 6, 182, 32, 8, "pv-l pv-ff", 4);
                o += rect(x + 15, 158, 14, 14, "pv-m pv-bg", 2);
                o += arrow(x + 22, 180, x + 22, 175, "pv-l");
                o += arrow(x + 22, 157, x + 22, 139, "pv-l pv-flow");
            }
            o += text(26, 210, "TOKENS", "start");
            o += text(26, 80, "LSTM", "start", "pv-t pv-t-strong");
            o += text(376, 210, "EMBEDDING", "end");
            var last = 26 + (n - 1) * 64 + 22;
            o += arrow(last, 90, last, 62);
            o += rect(last - 42, 30, 84, 26, "pv-s pv-bg", 13);
            o += circle(last - 24, 43, 4, "pv-f") + text(last - 15, 46, "POS", "start", "pv-t pv-t-xs");
            o += circle(last + 12, 43, 4, "pv-m") + text(last + 21, 46, "NEG", "start", "pv-t pv-t-xs");
            return o;
        }
    };

    // MRI slice → convolutional blocks → four classes
    V["neuroscan-ai"] = {
        label: "Diagram: an MRI slice passes through convolutional layers to one of four classes: glioma, meningioma, pituitary or no tumor",
        draw: function () {
            var o = "";
            o += rect(14, 60, 100, 120, "pv-l pv-bg", 4);
            o += '<ellipse cx="64" cy="120" rx="38" ry="48" class="pv-s pv-noFill"/>';
            o += '<ellipse cx="64" cy="120" rx="30" ry="40" class="pv-l pv-noFill"/>';
            o += path("M64,82 C58,96 70,104 62,118 C56,130 68,138 64,158", "pv-l pv-noFill");
            o += path("M44,104 C52,108 50,118 42,124 M84,104 C76,110 80,120 88,126 M46,140 C54,138 56,146 50,152 M82,140 C74,140 74,148 80,152", "pv-l pv-noFill");
            o += circle(78, 110, 6, "pv-f pv-soft");
            o += text(64, 198, "MRI", "middle");
            var blocks = [[136, 64, 18, 112], [172, 78, 16, 84], [204, 92, 14, 56], [232, 104, 12, 32]];
            blocks.forEach(function (b, i) {
                var d = 10 - i * 2;
                var x = b[0], y = b[1], w = b[2], h = b[3];
                o += path("M" + x + "," + y + " l" + d + "," + -d + " h" + w + " v" + h + " l" + -d + "," + d + " Z", "pv-l pv-ff");
                o += rect(x, y, w, h, "pv-m pv-bg", 1);
                o += line(x + w, y, x + w + d, y - d, "pv-l");
            });
            o += arrow(116, 120, 132, 120);
            o += text(196, 198, "CNN", "middle");
            var classes = ["GLIOMA", "MENINGIOMA", "PITUITARY", "NO TUMOR"];
            classes.forEach(function (c, i) {
                var y = 72 + i * 32;
                o += arrow(248, 120, 288, y);
                o += circle(296, y, 7, i === 0 ? "pv-f" : "pv-m pv-bg");
                o += text(310, y + 3, c, "start", i === 0 ? "pv-t pv-t-strong" : "pv-t");
            });
            return o;
        }
    };

    // Dense network over 30 cell features with dropout
    V["breast-cancer-ann"] = {
        label: "Diagram: 30 cell features feed a dense neural network with dropout layers and a single malignant-or-benign output",
        draw: function () {
            var o = "";
            var layers = [
                { x: 46, n: 15 },
                { x: 140, n: 9 },
                { x: 232, n: 7 },
                { x: 320, n: 1 }
            ];
            var pos = layers.map(function (L) {
                var span = L.n === 1 ? 0 : 154;
                var ys = [];
                for (var i = 0; i < L.n; i++) ys.push(L.n === 1 ? 118 : 41 + (span / (L.n - 1)) * i);
                return ys;
            });
            var dropped = { 1: [2, 6], 2: [4] };
            for (var l = 0; l < layers.length - 1; l++) {
                pos[l].forEach(function (y1, i) {
                    pos[l + 1].forEach(function (y2, j) {
                        var off = (dropped[l] || []).indexOf(i) !== -1 || (dropped[l + 1] || []).indexOf(j) !== -1;
                        if (!off) o += line(layers[l].x, y1, layers[l + 1].x, y2, "pv-hair");
                    });
                });
            }
            pos.forEach(function (ys, l) {
                ys.forEach(function (y, i) {
                    var off = (dropped[l] || []).indexOf(i) !== -1;
                    var r = l === 0 ? 3 : l === 3 ? 9 : 5.5;
                    o += circle(layers[l].x, y, r, off ? "pv-l pv-dash pv-bg" : l === 3 ? "pv-f" : "pv-s pv-bg");
                });
            });
            o += text(46, 222, "30 FEATURES", "middle");
            o += text(186, 222, "DROPOUT", "middle");
            o += text(320, 146, "MALIGNANT /", "middle", "pv-t pv-t-strong");
            o += text(320, 158, "BENIGN", "middle", "pv-t pv-t-strong");
            return o;
        }
    };

    // Leaf photo → quantised TFLite model → diagnosis
    V["plant-doctor-ai"] = {
        label: "Diagram: a leaf photo is scanned by a quantised TensorFlow Lite model that returns a disease diagnosis",
        draw: function () {
            var o = "";
            o += path("M40,186 C34,122 70,62 142,50 C150,120 118,176 40,186 Z", "pv-s pv-bg");
            o += path("M40,186 C70,150 102,104 142,50", "pv-m pv-noFill");
            o += path("M66,154 L58,126 M84,132 L80,102 M104,108 L104,80 M74,146 L100,148 M94,122 L120,118 M112,96 L132,90", "pv-l pv-noFill");
            o += circle(86, 150, 5, "pv-f pv-soft") + circle(108, 132, 3.5, "pv-f pv-soft") + circle(122, 100, 4, "pv-f pv-soft");
            o += path("M22,46 V36 H32 M150,36 H160 V46 M160,184 V194 H150 M32,194 H22 V184", "pv-m pv-noFill");
            o += line(22, 112, 160, 112, "pv-m pv-scan");
            o += text(91, 214, "LEAF PHOTO", "middle");
            o += arrow(170, 115, 204, 115);
            o += rect(212, 85, 60, 60, "pv-s pv-bg", 6);
            for (var i = 0; i < 4; i++) {
                o += line(224 + i * 12, 79, 224 + i * 12, 85, "pv-m") + line(224 + i * 12, 145, 224 + i * 12, 151, "pv-m");
                o += line(206, 97 + i * 12, 212, 97 + i * 12, "pv-m") + line(272, 97 + i * 12, 278, 97 + i * 12, "pv-m");
            }
            o += text(242, 119, "TFLITE", "middle", "pv-t pv-t-strong");
            o += text(242, 176, "QUANTISED", "middle");
            o += arrow(282, 115, 300, 115);
            o += rect(304, 80, 82, 70, "pv-s pv-bg", 4);
            o += text(314, 98, "DIAGNOSIS", "start", "pv-t pv-t-strong");
            o += lines(314, 114, [56, 42, 50], 11, "pv-m");
            return o;
        }
    };

    // Half pitch shot map (xG) → match outcome
    V["football-xg-model"] = {
        label: "Diagram: a half-pitch shot map where marker size reflects shot quality, feeding a win, draw or loss prediction",
        draw: function () {
            var o = "";
            var gx = 246;
            o += rect(16, 28, gx - 16, 194, "pv-m pv-noFill", 2);
            o += rect(gx - 66, 72, 66, 106, "pv-m pv-noFill", 0);
            o += rect(gx - 22, 100, 22, 50, "pv-m pv-noFill", 0);
            o += rect(gx, 108, 6, 34, "pv-s pv-noFill", 0);
            o += path("M" + (gx - 66) + ",104 A26,26 0 0 0 " + (gx - 66) + ",146", "pv-m pv-noFill");
            o += path("M16,96 A30,30 0 0 1 16,154", "pv-l pv-noFill");
            o += circle(gx - 44, 125, 1.6, "pv-f");
            // Shots spread across the final third; closer and more central = bigger marker (higher xG)
            var rnd = seeded(29);
            var shots = [];
            for (var i = 0; i < 60 && shots.length < 20; i++) {
                var dist = 22 + Math.pow(rnd(), 0.8) * 150;
                var ang = (rnd() - 0.5) * 2.2;
                var x = gx - 8 - Math.cos(ang) * dist;
                var y = 125 + Math.sin(ang) * dist * 0.7;
                if (x < 30 || y < 40 || y > 210) continue;
                var tooClose = shots.some(function (s) { return Math.hypot(s[0] - x, s[1] - y) < 13; });
                if (tooClose) continue;
                shots.push([x, y, Math.max(0.05, 1 - dist / 175 - Math.abs(ang) * 0.25)]);
            }
            shots.forEach(function (s, i) {
                o += circle(s[0].toFixed(1), s[1].toFixed(1), (1.8 + s[2] * 7).toFixed(1), s[2] > 0.55 && i % 2 === 0 ? "pv-f pv-soft" : "pv-m pv-bg");
            });
            o += text(22, 240, "SHOT QUALITY · xG", "start");
            o += arrow(262, 125, 282, 125);
            o += rect(290, 70, 96, 110, "pv-s pv-bg", 4);
            o += text(302, 90, "OUTCOME", "start", "pv-t pv-t-strong");
            ["W", "D", "L"].forEach(function (k, i) {
                var y = 110 + i * 22;
                o += text(302, y + 3, k, "start", "pv-t pv-t-strong");
                o += rect(316, y - 4, [52, 30, 22][i], 8, i === 0 ? "pv-f" : "pv-l pv-ff", 2);
            });
            return o;
        }
    };

    // Price regression + feature selection (80 → 12)
    V["real-estate-price-predictor"] = {
        label: "Diagram: a price regression scatter plot beside a funnel showing 80 raw columns reduced to the 12 strongest price drivers",
        draw: function () {
            var o = "";
            o += line(28, 196, 228, 196, "pv-m") + line(28, 196, 28, 34, "pv-m");
            var rnd = seeded(3);
            for (var i = 0; i < 34; i++) {
                var t = rnd();
                var x = 38 + t * 180;
                var y = 186 - t * 132 + (rnd() - 0.5) * 38;
                o += circle(x.toFixed(1), y.toFixed(1), 2.4, "pv-dot");
            }
            o += line(36, 188, 222, 50, "pv-s");
            o += text(28, 214, "PREDICTED PRICE", "start");
            o += text(36, 30, "ACTUAL", "start");
            var lx = 268, rx = 360;
            for (var a = 0; a < 20; a++) o += line(lx, 40 + a * 8, lx + 18, 40 + a * 8, "pv-hair2");
            o += path("M" + (lx + 24) + ",36 L" + (rx - 22) + ",80 V156 L" + (lx + 24) + ",200 Z", "pv-l pv-ff");
            for (var b = 0; b < 12; b++) o += line(rx - 14, 84 + b * 6.4, rx + 18, 84 + b * 6.4, "pv-s");
            o += text(lx + 9, 222, "80", "middle", "pv-t pv-t-strong");
            o += text(rx + 2, 222, "12", "middle", "pv-t pv-t-strong");
            o += text(314, 236, "FEATURES", "middle");
            return o;
        }
    };

    // Pharmacy operations interface (wireframe)
    V["medisync"] = {
        label: "Wireframe: a pharmacy management interface with navigation and an inventory table tracking batches and expiry",
        draw: function () {
            var o = "";
            o += rect(14, 24, 372, 204, "pv-m pv-bg", 6);
            o += line(14, 42, 386, 42, "pv-l");
            o += circle(26, 33, 2.2, "pv-l") + circle(34, 33, 2.2, "pv-l") + circle(42, 33, 2.2, "pv-l");
            o += line(84, 42, 84, 228, "pv-l");
            ["INVENTORY", "PRESCRIPTIONS", "SALES", "BATCHES"].forEach(function (t, i) {
                var y = 64 + i * 22;
                if (i === 0) o += rect(20, y - 9, 58, 14, "pv-l pv-ff", 2);
                o += text(26, y + 1, t, "start", "pv-t pv-t-xs");
            });
            o += lines(100, 62, [96], 0, "pv-s");
            o += rect(320, 54, 52, 16, "pv-m", 8);
            o += line(100, 88, 372, 88, "pv-m");
            o += text(100, 82, "ITEM", "start", "pv-t pv-t-xs") + text(214, 82, "BATCH", "start", "pv-t pv-t-xs") + text(272, 82, "EXPIRY", "start", "pv-t pv-t-xs") + text(372, 82, "STOCK", "end", "pv-t pv-t-xs");
            for (var r = 0; r < 6; r++) {
                var y = 104 + r * 20;
                o += line(100, y, 100 + [70, 54, 82, 60, 74, 48][r], y, "pv-m");
                o += rect(214, y - 5, 36, 10, "pv-l", 5);
                o += rect(272, y - 5, 40, 10, r === 2 ? "pv-f" : "pv-l", 5);
                o += line(372 - [30, 22, 8, 26, 18, 30][r], y, 372, y, r === 2 ? "pv-s" : "pv-l");
                if (r < 5) o += line(100, y + 10, 372, y + 10, "pv-hair");
            }
            return o;
        }
    };

    // Subscription dashboard (wireframe)
    V["sub-tracker"] = {
        label: "Wireframe: a subscription dashboard with spend summaries, a monthly spend chart and upcoming 7- and 30-day renewals",
        draw: function () {
            var o = "";
            o += rect(14, 24, 372, 204, "pv-m pv-bg", 6);
            [0, 1, 2].forEach(function (i) {
                var x = 28 + i * 80;
                o += rect(x, 38, 70, 40, "pv-l pv-ff", 4);
                o += line(x + 10, 52, x + 34, 52, "pv-l");
                o += line(x + 10, 66, x + [50, 42, 46][i], 66, "pv-s");
            });
            o += text(28, 98, "MONTHLY SPEND", "start", "pv-t pv-t-xs");
            var bars = [0.4, 0.46, 0.44, 0.52, 0.5, 0.58, 0.55, 0.6, 0.66, 0.62, 0.7, 0.74];
            bars.forEach(function (b, i) {
                o += rect(30 + i * 18, 212 - b * 96, 10, b * 96, i === 11 ? "pv-f" : "pv-l pv-ff", 1);
            });
            o += line(26, 212, 246, 212, "pv-m");
            o += line(262, 34, 262, 218, "pv-l");
            o += text(276, 48, "RENEWALS", "start", "pv-t pv-t-strong");
            ["7D", "7D", "30D", "30D", "30D"].forEach(function (k, i) {
                var y = 72 + i * 30;
                o += circle(284, y, 7, "pv-m pv-bg");
                o += line(298, y - 3, 298 + [40, 32, 44, 28, 36][i], y - 3, "pv-m");
                o += line(298, y + 5, 324, y + 5, "pv-l");
                o += rect(346, y - 7, 28, 14, k === "7D" ? "pv-f" : "pv-l", 7);
                o += text(360, y + 3, k, "middle", k === "7D" ? "pv-t pv-t-xs pv-t-inv" : "pv-t pv-t-xs");
            });
            return o;
        }
    };

    // Textile operations pipeline + role-based access
    V["versori"] = {
        label: "Diagram: inventory, production, orders and an operations dashboard, with role-based access controlling each module",
        draw: function () {
            var o = "";
            var mods = ["INVENTORY", "PRODUCTION", "ORDERS", "DASHBOARD"];
            mods.forEach(function (m, i) {
                var x = 20 + i * 94;
                o += rect(x, 40, 78, 44, i === 3 ? "pv-s pv-ff" : "pv-s pv-bg", 4);
                o += text(x + 39, 66, m, "middle", "pv-t pv-t-xs");
                if (i < 3) o += arrow(x + 80, 62, x + 92, 62);
            });
            o += text(20, 120, "ROLE-BASED ACCESS", "start", "pv-t pv-t-strong");
            var grid = [[1, 1, 1, 1], [1, 1, 0, 1], [0, 1, 1, 0]];
            grid.forEach(function (row, r) {
                var y = 142 + r * 28;
                o += text(20, y + 4, "ROLE " + (r + 1), "start", "pv-t pv-t-xs");
                o += line(68, y, 370, y, "pv-hair");
                row.forEach(function (on, c) {
                    var x = 59 + c * 94;
                    o += rect(x - 6, y - 6, 12, 12, on ? "pv-f" : "pv-m pv-dash", 2);
                });
            });
            mods.forEach(function (m, c) { o += line(59 + c * 94, 86, 59 + c * 94, 130, "pv-l pv-dash"); });
            return o;
        }
    };

    // Java MVC architecture with three role dashboards
    V["techhub"] = {
        label: "Diagram: an MVC servlet architecture — JSP views, servlet controllers and models over MySQL — serving three role dashboards",
        draw: function () {
            var o = "";
            ["STOCK MANAGER", "SALES REP", "AUDITOR"].forEach(function (r, i) {
                var x = 24 + i * 118;
                o += rect(x, 28, 100, 36, "pv-m pv-bg", 4);
                o += text(x + 50, 50, r, "middle", "pv-t pv-t-xs");
                o += arrow(x + 50, 66, 200, 98, "pv-l");
            });
            var chain = [["JSP", "VIEW"], ["SERVLET", "CONTROLLER"], ["MODEL", "DAO"]];
            chain.forEach(function (c, i) {
                var x = 24 + i * 102;
                o += rect(x, 104, 84, 56, "pv-s pv-bg", 4);
                o += text(x + 42, 128, c[0], "middle", "pv-t pv-t-strong");
                o += text(x + 42, 144, c[1], "middle", "pv-t pv-t-xs");
                o += arrow(x + 86, 132, x + 100, 132);
            });
            o += cylinder(354, 108, 28, 46, "pv-s pv-bg");
            o += text(354, 182, "MYSQL", "middle");
            o += path("M66,162 V200 H354 V188", "pv-l pv-dash pv-noFill");
            o += text(210, 216, "REPORT GENERATION", "middle");
            return o;
        }
    };

    // Native Android wellbeing app
    V["aura"] = {
        label: "Diagram: an Android phone screen with a mood selector, a habit tracker and a hydration tracker",
        draw: function () {
            var o = "";
            o += rect(146, 14, 108, 222, "pv-s pv-bg", 16);
            o += rect(154, 34, 92, 184, "pv-l pv-noFill", 4);
            o += rect(184, 22, 32, 4, "pv-m", 2);
            var faces = [-3, -1.5, 0, 1.5, 3];
            faces.forEach(function (f, i) {
                var cx = 165 + i * 17.5, cy = 56;
                o += circle(cx, cy, 6.5, i === 3 ? "pv-f" : "pv-m pv-bg");
                o += path("M" + (cx - 3) + "," + (cy + 2) + " Q" + cx + "," + (cy + 2 + f) + " " + (cx + 3) + "," + (cy + 2), i === 3 ? "pv-inv" : "pv-m pv-noFill");
            });
            [0, 1, 2, 3].forEach(function (i) {
                var y = 88 + i * 18;
                o += rect(162, y - 5, 10, 10, i < 3 ? "pv-f" : "pv-m", 2);
                o += line(180, y, 180 + [48, 36, 54, 40][i], y, "pv-l");
            });
            o += path("M200,160 C192,172 186,180 186,188 A14,14 0 0 0 214,188 C214,180 208,172 200,160 Z", "pv-s pv-noFill");
            o += '<clipPath id="pv-drop"><path d="M200,160 C192,172 186,180 186,188 A14,14 0 0 0 214,188 C214,180 208,172 200,160 Z"/></clipPath>';
            o += '<rect x="184" y="183" width="32" height="24" class="pv-f" clip-path="url(#pv-drop)"/>';
            o += line(124, 56, 152, 56, "pv-l") + text(118, 59, "MOOD", "end");
            o += line(124, 106, 156, 106, "pv-l") + text(118, 109, "HABITS", "end");
            o += line(276, 186, 248, 186, "pv-l") + text(282, 189, "HYDRATION", "start");
            o += line(276, 56, 250, 56, "pv-l") + text(282, 59, "SIGN-UP & LOGIN", "start");
            o += text(282, 120, "KOTLIN · ANDROID", "start", "pv-t pv-t-strong");
            return o;
        }
    };

    /* ---------- public API ---------- */

    var uid = 0;

    function get(project) {
        return V[project.visual] || V[project.id] || null;
    }

    function render(project) {
        var v = get(project);

        if (!v) {
            return "";
        }

        uid++;

        return (
            '<svg class="pv" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + v.label.replace(/"/g, "&quot;") + '" preserveAspectRatio="xMidYMid meet" focusable="false">' +
            // ids inside a drawing (e.g. clip paths) must stay unique when it appears twice on a page
            v.draw().replace(/pv-drop/g, "pv-drop-" + uid) +
            "</svg>"
        );
    }

    // "Diagram" or "Wireframe", for the figure caption
    function kind(project) {
        var v = get(project);
        return v ? v.label.split(":")[0] : "";
    }

    root.ProjectVisuals = {
        render: render,
        kind: kind,
        has: function (p) { return !!get(p); }
    };
})(window);
