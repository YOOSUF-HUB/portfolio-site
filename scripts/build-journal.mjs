#!/usr/bin/env node
/* =========================================================
   FIELD NOTES — journal generator
   ---------------------------------------------------------
   Reads the Pages CMS collections in content/journal/*, skips
   anything that is not "Published", validates the rest and
   assembles the deployable site in dist/:

     dist/                     copy of the hand-made site (unchanged)
     dist/journal/index.html   listing: featured, filters, search
     dist/journal/<slug>/      one page per entry, per-type template
     dist/journal/latest.json  latest three entries (homepage block)
     dist/journal/feed.xml     RSS 2.0
     dist/sitemap.xml          main pages + journal
     dist/robots.txt           points crawlers at the sitemap

   content/, scripts/, node_modules/ and config files are never
   copied, so drafts can't be downloaded from the live site.

   Usage
     npm run build                  build dist/
     npm run journal:check          validate content only, write nothing
     node scripts/build-journal.mjs --content <dir> --out <dir>
   Env
     SITE_URL   canonical origin (default https://yoosufahamed.com)
   ========================================================= */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? path.resolve(args[i + 1]) : dflt; };
const CHECK_ONLY = args.includes("--check");
const CONTENT = arg("--content", path.join(ROOT, "content", "journal"));
const OUT = arg("--out", path.join(ROOT, "dist"));
const SITE = (process.env.SITE_URL || "https://yoosufahamed.com").replace(/\/+$/, "");
const TODAY = new Date().toISOString().slice(0, 10);

/* Root entries that are part of the source, never of the public site */
const EXCLUDE = new Set(["node_modules", "content", "scripts", "dist", ".git", ".github", ".venv", ".claude", ".vscode",
    ".pages.yml", "package.json", "package-lock.json", "vercel.json", ".gitignore", ".vercelignore", "api", "README.md", "JOURNAL.md"]);
/* Main pages listed in the sitemap (template leftovers are deliberately left out) */
const SITEMAP_PAGES = [["/", 1.0], ["/projects", 0.8], ["/certifications", 0.6]];
const MEDIA_DIR = "/assets/images/journal"; // Pages CMS media output (see .pages.yml)
const RESERVED_SLUGS = new Set(["feed", "latest", "index", "assets", "page", "tag", "category"]);

const TYPES = {
    articles: { type: "article", label: "Article", plural: "Articles", date: "publish_date", excerpt: "excerpt", required: ["title", "slug", "excerpt", "publish_date", "category"] },
    events: { type: "event", label: "Event", plural: "Events", date: "event_date", excerpt: "excerpt", required: ["title", "slug", "excerpt", "event_date"] },
    hackathons: { type: "hackathon", label: "Hackathon", plural: "Hackathons", date: "start_date", excerpt: "description", required: ["title", "slug", "hackathon_name", "start_date", "description"] },
    experiments: { type: "experiment", label: "Experiment", plural: "Experiments", date: "publish_date", excerpt: "excerpt", required: ["title", "slug", "excerpt", "publish_date"] },
};
const TYPE_ORDER = ["article", "event", "hackathon", "experiment"];
const TYPE_INFO = Object.fromEntries(Object.values(TYPES).map((t) => [t.type, t]));

/* ---------------- helpers ---------------- */

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const str = (v) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
const list = (v) => (Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : String(v).split(",")).map(str).filter(Boolean);
const isUrl = (u) => /^https?:\/\/[^\s]+$/i.test(u);
const abs = (u) => (/^https?:\/\//i.test(u) ? u : SITE + srcAttr(u.startsWith("/") ? u : "/" + u));

/* ISO date (yyyy-mm-dd) from whatever the CMS stored: string, Date, or datetime */
function isoDate(v) {
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(v));
    if (!m) return "";
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    return isNaN(d) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}` ? "" : `${m[1]}-${m[2]}-${m[3]}`;
}
const fmtLong = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const fmtShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtDay = (iso, f = fmtLong) => (iso ? f.format(new Date(iso + "T00:00:00Z")) : "");
function fmtRange(a, b, f = fmtLong) {
    if (!b || b === a) return fmtDay(a, f);
    const A = new Date(a + "T00:00:00Z"), B = new Date(b + "T00:00:00Z");
    if (A.getUTCFullYear() === B.getUTCFullYear() && A.getUTCMonth() === B.getUTCMonth())
        return `${A.getUTCDate()}–${fmtDay(b, f)}`;
    return `${fmtDay(a, f)} – ${fmtDay(b, f)}`;
}
const rfc822 = (iso) => new Date(iso + "T00:00:00Z").toUTCString();

/* Image paths: keep what the CMS uploaded, make site-relative paths absolute from root.
   Pages CMS saves media paths with the configured output prefix
   (/assets/images/journal/x.jpg) and decoded (a space stays a space). */
function mediaPath(v) {
    const s = str(v).replace(/^<(.*)>$/, "$1");
    if (!s) return "";
    if (/^(https?:)?\/\//i.test(s) || s.startsWith("/") || /^data:/i.test(s)) return s;
    return "/" + s.replace(/^\.?\/+/, "");
}
const decodeSafe = (p) => { try { return decodeURI(p); } catch (e) { return p; } };
/* value for an HTML src/href attribute: encode spaces etc. once, never twice */
const srcAttr = (p) => (/^data:/i.test(p) ? p : encodeURI(decodeSafe(p)));

/* Intrinsic size from the file header (PNG, GIF, JPEG, WebP) — no image library needed.
   Used for width/height attributes so pages don't shift while images load. */
const IMG_INFO = new Map();
function imageInfo(publicPath) {
    if (!publicPath || !publicPath.startsWith("/") || publicPath.startsWith("//")) return null;
    if (IMG_INFO.has(publicPath)) return IMG_INFO.get(publicPath);
    let info = null;
    try {
        const file = path.join(ROOT, decodeSafe(publicPath));
        const bytes = fs.statSync(file).size;
        const b = Buffer.alloc(Math.min(bytes, 512 * 1024));
        const fd = fs.openSync(file, "r"); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd);
        let w = 0, h = 0;
        if (b.readUInt32BE(0) === 0x89504e47) { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
        else if (b.toString("ascii", 0, 3) === "GIF") { w = b.readUInt16LE(6); h = b.readUInt16LE(8); }
        else if (b[0] === 0xff && b[1] === 0xd8) {
            for (let o = 2; o + 9 < b.length;) {
                if (b[o] !== 0xff) { o++; continue; }
                const m = b[o + 1];
                if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = b.readUInt16BE(o + 5); w = b.readUInt16BE(o + 7); break; }
                o += 2 + b.readUInt16BE(o + 2);
            }
        } else if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
            const kind = b.toString("ascii", 12, 16);
            if (kind === "VP8X") { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); }
            else if (kind === "VP8L") { const v = b.readUInt32LE(21); w = 1 + (v & 0x3fff); h = 1 + ((v >> 14) & 0x3fff); }
            else if (kind === "VP8 ") { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
        }
        info = { w, h, bytes };
    } catch (e) { info = null; }
    IMG_INFO.set(publicPath, info);
    return info;
}
const dims = (p) => { const i = imageInfo(p); return i && i.w && i.h ? ` width="${i.w}" height="${i.h}"` : ""; };
const ratio = (p, dflt = 4 / 3) => { const i = imageInfo(p); return i && i.w && i.h ? i.w / i.h : dflt; };
/* an <img> that opens in the lightbox; without JS the link opens the original file */
function zoomImg(src, alt, caption, attrs = 'loading="lazy" decoding="async"') {
    const s = srcAttr(src);
    return `<a class="jn-zoom" href="${esc(s)}" data-jn-lb${caption ? ` data-caption="${esc(caption)}"` : ""} aria-label="${esc(alt ? `Enlarge image: ${alt}` : "Enlarge image")}"><img data-jn src="${esc(s)}" alt="${esc(alt)}"${dims(src)} ${attrs}></a>`;
}
const USED_MEDIA = new Set(); // journal images referenced by published entries (decoded paths)
const MD_NOTES = []; // per-render notes (alt text etc.), collected for the file being built
const looksLikeFilename = (alt) => /\.(jpe?g|png|webp|gif|avif|heic)$/i.test(alt.trim());

/* Frontmatter split: --- yaml --- body */
function splitFrontmatter(src) {
    const text = src.replace(/^\uFEFF/, "");
    const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/.exec(text);
    if (!m) return { data: {}, body: text, ok: false };
    return { data: parseYaml(m[1]) || {}, body: m[2], ok: true };
}

/* ---------------- Markdown ---------------- */

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
    renderer: {
        image({ href, title, text }) {
            const src = mediaPath(href);
            if (!text.trim()) MD_NOTES.push(`inline image ${src} has no alt text`);
            else if (looksLikeFilename(text)) MD_NOTES.push(`inline image ${src} uses its file name as alt text ("${text}") — describe the image instead`);
            return zoomImg(src, text, title);
        },
        /* a paragraph that only holds images becomes figure(s) between paragraphs */
        paragraph({ tokens }) {
            const imgs = tokens.filter((t) => t.type === "image");
            const onlyImages = imgs.length && tokens.every((t) => t.type === "image" || t.type === "br" || (t.type === "text" && !t.text.trim()));
            if (!onlyImages) return `<p>${this.parser.parseInline(tokens)}</p>\n`;
            const figs = imgs.map((t) => {
                const src = mediaPath(t.href);
                return `<figure class="jn-figure" style="--ar:${ratio(src).toFixed(4)}">${this.parser.parseInline([t])}${t.title ? `<figcaption>${esc(t.title)}</figcaption>` : ""}</figure>`;
            });
            // several images in one paragraph sit side by side, sized by their proportions
            return (figs.length > 1 ? `<div class="jn-figrow">${figs.join("")}</div>` : figs[0]) + "\n";
        },
        link({ href, title, tokens }) {
            const inner = this.parser.parseInline(tokens);
            const external = /^https?:\/\//i.test(href) && !href.startsWith(SITE);
            const t = title ? ` title="${esc(title)}"` : "";
            const target = /^\.?\/?assets\//.test(href) ? mediaPath(href) : href; // uploaded files → site-absolute
            return `<a href="${esc(target)}"${t}${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${inner}${external ? '<span class="jn-sr"> (opens in a new tab)</span>' : ""}</a>`;
        },
        heading({ tokens, depth }) {
            const inner = this.parser.parseInline(tokens);
            const level = Math.min(6, Math.max(2, depth)); // the page title is the only h1: # and ## both become h2
            const id = inner.replace(/<[^>]+>/g, "").toLowerCase().replace(/&[a-z#0-9]+;/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            return `<h${level}${id ? ` id="${id}"` : ""}>${inner}</h${level}>`;
        },
    },
});
/* Captions for inline images. The Pages CMS editor has no caption box, so the
   convention is an italic line directly under the image:
       ![A server rack](/assets/images/journal/rack.jpg)
       *The rack after the migration.*
   It works whether the italic line is its own paragraph or on the next line
   of the same paragraph. A Markdown image title ("…") also becomes the caption. */
function captionPass(tokens) {
    const isBlank = (t) => t.type === "br" || (t.type === "text" && !t.text.trim());
    const soleEm = (toks) => { const r = toks.filter((t) => !isBlank(t)); return r.length === 1 && r[0].type === "em" ? r[0] : null; };
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== "paragraph") continue;
        const imgs = t.tokens.filter((x) => x.type === "image");
        if (imgs.length !== 1) continue;
        const k = t.tokens.indexOf(imgs[0]);
        // same paragraph: image, line break, *caption*
        const after = t.tokens.slice(k + 1), em = soleEm(after);
        if (t.tokens.slice(0, k).every(isBlank) && em && after.some(isBlank)) {
            if (!imgs[0].title) imgs[0].title = em.text;
            t.tokens = [imgs[0]];
            continue;
        }
        if (!t.tokens.every((x) => x === imgs[0] || isBlank(x))) continue;
        // next paragraph: *caption*
        let j = i + 1;
        while (j < tokens.length && tokens[j].type === "space") j++;
        const n = tokens[j];
        const em2 = n && n.type === "paragraph" ? soleEm(n.tokens) : null;
        if (em2) { if (!imgs[0].title) imgs[0].title = em2.text; tokens.splice(i + 1, j - i); }
    }
    return tokens;
}
/* Markdown → HTML; wide tables scroll inside their own box instead of the page;
   raw <img> HTML (if the editor ever emits it) still gets lazy loading + a site-absolute src */
function renderMd(md) {
    const html = marked.parser(captionPass(marked.lexer(md)));
    return html
        .replace(/<table>/g, '<div class="jn-table"><table>').replace(/<\/table>/g, "</table></div>")
        .replace(/<img(?![^>]*\bdata-jn\b)([^>]*?)\s*\/?>/g, (m, attrs) => {
            let a = attrs.replace(/\bsrc="([^"]*)"/, (mm, v) => `src="${esc(srcAttr(mediaPath(v)))}"`);
            if (!/\bloading=/.test(a)) a += ' loading="lazy" decoding="async"';
            return `<img${a}>`;
        });
}
const plainText = (md) => md.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`~|-]/g, " ");
const wordCount = (md) => (plainText(md).match(/[\p{L}\p{N}’']+/gu) || []).length;

/* ---------------- load + validate ---------------- */

const errors = [], warnings = [];
function loadEntries() {
    const out = [];
    for (const [dir, T] of Object.entries(TYPES)) {
        const folder = path.join(CONTENT, dir);
        if (!fs.existsSync(folder)) continue;
        for (const file of fs.readdirSync(folder).sort()) {
            if (!/\.(md|markdown)$/i.test(file)) continue;
            const rel = path.relative(ROOT, path.join(folder, file));
            let fm;
            try { fm = splitFrontmatter(fs.readFileSync(path.join(folder, file), "utf8")); }
            catch (e) { errors.push(`${rel}: could not parse frontmatter (${e.message})`); continue; }
            const d = fm.data;
            const status = str(d.status).toLowerCase();
            if (status !== "published") { warnings.push(`${rel}: ${status || "no status"} — skipped (not published)`); continue; }
            if (!fm.ok) { errors.push(`${rel}: missing YAML frontmatter`); continue; }

            const problems = [];
            for (const k of T.required) if (!str(d[k])) problems.push(`missing "${k}"`);
            const date = isoDate(d[T.date]);
            if (str(d[T.date]) && !date) problems.push(`"${T.date}" is not a valid yyyy-mm-dd date`);
            const end = isoDate(d.end_date);
            if (str(d.end_date) && !end) problems.push(`"end_date" is not a valid yyyy-mm-dd date`);
            if (end && date && end < date) problems.push(`"end_date" is before "${T.date}"`);
            const slug = str(d.slug).toLowerCase();
            if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) problems.push(`"slug" must be lowercase words joined by hyphens`);
            if (RESERVED_SLUGS.has(slug)) problems.push(`"slug" "${slug}" is reserved`);
            for (const k of ["event_url", "registration_url", "github_url", "demo_url"]) if (str(d[k]) && !isUrl(str(d[k]))) problems.push(`"${k}" must be a full http(s) URL`);
            const cover = mediaPath(d.cover_image);
            if (cover && !str(d.cover_alt)) problems.push(`"cover_alt" is required when a cover image is set`);
            const gallery = (Array.isArray(d.gallery) ? d.gallery : []).map((g) => (typeof g === "string" ? { image: g } : g || {}))
                .map((g) => ({ src: mediaPath(g.image), alt: str(g.alt), caption: str(g.caption) })).filter((g) => g.src);
            gallery.forEach((g, i) => { if (!g.alt) problems.push(`gallery image ${i + 1} needs a description (alt)`); });
            if (cover && looksLikeFilename(str(d.cover_alt))) warnings.push(`${rel}: cover alt text looks like a file name ("${str(d.cover_alt)}") — describe the image instead`);
            gallery.forEach((g, i) => { if (looksLikeFilename(g.alt)) warnings.push(`${rel}: gallery image ${i + 1} alt text looks like a file name — describe the image instead`); });
            if (problems.length) { errors.push(`${rel}: ${problems.join("; ")}`); continue; }

            const body = fm.body || "";
            MD_NOTES.length = 0;
            const html = renderMd(body);
            const inlineImgs = [...body.matchAll(/!\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)/g)].map((m) => mediaPath(m[1]));
            for (const n of MD_NOTES) warnings.push(`${rel}: ${n}`);
            for (const img of [cover, ...gallery.map((g) => g.src), ...inlineImgs]) {
                if (!img || !img.startsWith("/") || img.startsWith("//")) continue;
                USED_MEDIA.add(decodeSafe(img));
                const info = imageInfo(img);
                if (!info) warnings.push(`${rel}: image not found in the repository: ${img}`);
                else if (info.bytes > 1.5 * 1024 * 1024) warnings.push(`${rel}: ${img} is ${(info.bytes / 1048576).toFixed(1)} MB — consider exporting it at ≤ 2400 px wide (JPEG/WebP ~80%) before uploading`);
            }
            const words = wordCount(body);
            const rt = Number(d.reading_time);
            out.push({
                file: rel, kind: T.type, typeLabel: T.label,
                title: str(d.title), slug, url: `/journal/${slug}/`,
                excerpt: str(d[T.excerpt]), date, end,
                cover, coverAlt: str(d.cover_alt), gallery,
                category: str(d.category), tags: list(d.tags), technologies: list(d.technologies),
                readingTime: T.type === "article" ? (rt > 0 ? Math.round(rt) : Math.max(1, Math.round(words / 220))) : 0,
                featured: d.featured === true || str(d.featured).toLowerCase() === "true",
                location: str(d.location), venue: str(d.venue), organiser: str(d.organiser), participation: str(d.participation),
                eventUrl: str(d.event_url), registrationUrl: str(d.registration_url),
                projectName: str(d.project_name), hackathonName: str(d.hackathon_name), teamName: str(d.team_name),
                role: str(d.my_role), result: str(d.result),
                githubUrl: str(d.github_url), demoUrl: str(d.demo_url),
                seoTitle: str(d.seo_title), seoDescription: str(d.seo_description),
                html, words,
            });
        }
    }
    // slugs share one URL space
    const seen = new Map();
    for (const e of out) {
        if (seen.has(e.slug)) errors.push(`duplicate slug "${e.slug}" in ${seen.get(e.slug)} and ${e.file}`);
        else seen.set(e.slug, e.file);
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.title.localeCompare(b.title)));
    return out;
}

/* ---------------- shared chrome (lifted from projects.html) ---------------- */

function absolutise(html) {
    return html
        .replace(/\s(href|src)="(?!https?:|mailto:|tel:|#|\/|data:|javascript:)([^"]*)"/g, (m, a, v) => ` ${a}="/${v.replace(/^index\.html/, "")}"`)
        .replace(/\saria-current="page"/g, "");
}
function chrome() {
    const src = fs.readFileSync(path.join(ROOT, "projects.html"), "utf8");
    const pick = (re, name) => { const m = re.exec(src); if (!m) throw new Error(`projects.html: could not find the ${name}`); return absolutise(m[0]); };
    return {
        header: pick(/<header class="tf-header">[\s\S]*?<\/header>/, "site header"),
        footer: pick(/<footer class="tf-footer">[\s\S]*?<\/footer>/, "site footer"),
        menu: pick(/<!-- Mobile Menu -->[\s\S]*?<!-- \/Mobile Menu -->/, "mobile menu"),
    };
}

function page({ title, description, canonical, ogType = "website", image, imageAlt, jsonld, bodyClass, main, scripts = [], C }) {
    const og = image ? abs(image) : `${SITE}/assets/images/Logo%20White.png`;
    return `<!DOCTYPE html>
<html lang="en-GB">
<head>
    <meta charset="utf-8">
    <title>${esc(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta name="robots" content="index, follow">
    <meta property="og:site_name" content="Yoosuf Ahamed">
    <meta property="og:type" content="${ogType}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(og)}">
    ${imageAlt ? `<meta property="og:image:alt" content="${esc(imageAlt)}">` : ""}
    <meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">
    <meta name="twitter:site" content="@yusufahmd01">
    <link rel="alternate" type="application/rss+xml" title="Field Notes — Yoosuf Ahamed" href="/journal/feed.xml">
    <link rel="stylesheet" href="/assets/fonts/fonts.css">
    <link rel="stylesheet" href="/assets/icon/icomoon/style.css">
    <link rel="stylesheet" href="/assets/css/bootstrap.min.css">
    <link rel="stylesheet" href="/assets/css/styles.css">
    <link rel="stylesheet" href="/assets/css/custom-logo.css">
    <link rel="stylesheet" href="/assets/css/projects.css">
    <link rel="stylesheet" href="/assets/css/night-sky.css">
    <link rel="stylesheet" href="/assets/css/journal.css">
    <link rel="stylesheet" href="/assets/css/theme-mono.css">
    <link rel="shortcut icon" href="/assets/images/Logo%20Black.png">
    <link rel="apple-touch-icon-precomposed" href="/assets/images/Logo%20Black.png">
    ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body class="page-journal ${bodyClass || ""}">
    <a class="jn-skip" href="#jn-main">Skip to content</a>
    <div class="night-sky-glow" aria-hidden="true"></div>
    <canvas class="night-sky" id="night-sky" aria-hidden="true"></canvas>
    <button id="goTop" aria-label="Back to top">
        <span class="border-progress"></span>
        <span class="ic-wrap"><span class="icon icon-arrow-caret-right"></span></span>
    </button>
    <main id="wrapper">
        ${C.header}
        <div class="jn" id="jn-main" tabindex="-1">
${main}
        </div>
        ${C.footer}
    </main>
    ${C.menu}
    <script src="/assets/js/jquery.min.js"></script>
    <script src="/assets/js/infinityslide.js"></script>
    <script src="/assets/js/main.js"></script>
    <script src="/assets/js/night-sky.js"></script>
${scripts.map((s) => `    <script src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

/* ---------------- fragments ---------------- */

const ARROW = '<svg class="pj-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8"/></svg>';
const BACK = '<svg class="pj-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false" style="transform: rotate(-135deg)"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8"/></svg>';
const extLink = (href, label, cls = "pj-link") => `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}${ARROW}<span class="jn-sr"> (opens in a new tab)</span></a>`;

function entryDate(e, f = fmtLong) { return e.kind === "event" || e.kind === "hackathon" ? fmtRange(e.date, e.end, f) : fmtDay(e.date, f); }
function metaLine(e) {
    const bits = [`<time datetime="${e.date}">${esc(entryDate(e, fmtShort))}</time>`];
    if (e.kind === "article") bits.push(`${e.readingTime} min read`);
    if (e.kind === "article" && e.category) bits.push(esc(e.category));
    if (e.kind === "event" && e.location) bits.push(esc(e.location));
    if (e.kind === "hackathon" && e.result) bits.push(esc(e.result));
    if (e.kind === "experiment" && e.technologies.length) bits.push(esc(e.technologies.slice(0, 3).join(" · ")));
    return bits.join('<span class="jn-dot" aria-hidden="true">·</span>');
}
const upcoming = (e) => e.kind === "event" && (e.end || e.date) >= TODAY;
function typeTag(e) { return `<span class="jn-type" data-type="${e.kind}">${esc(e.typeLabel)}${upcoming(e) ? '<span class="jn-type__flag">Upcoming</span>' : ""}</span>`; }

/* typographic placeholder when an entry has no cover: initials of the type on a ruled field */
function visual(e, cls) {
    if (e.cover) return `<img class="${cls}" src="${esc(srcAttr(e.cover))}" alt="${esc(e.coverAlt)}"${dims(e.cover)} loading="lazy" decoding="async">`;
    return `<div class="${cls} jn-noimg" aria-hidden="true"><span>${esc(e.typeLabel)}</span></div>`;
}

function card(e) {
    const hay = [e.title, e.excerpt, e.typeLabel, e.category, e.tags.join(" "), e.technologies.join(" "), e.location, e.hackathonName, e.projectName].join(" ").toLowerCase();
    return `                <li class="jn-row" data-type="${e.kind}" data-search="${esc(hay)}">
                    <a class="jn-row__link" href="${e.url}">
                        <div class="jn-row__date"><time datetime="${e.date}">${esc(fmtDay(e.date, fmtShort))}</time></div>
                        <div class="jn-row__main">
                            ${typeTag(e)}
                            <h3 class="jn-row__title">${esc(e.title)}</h3>
                            <p class="jn-row__excerpt">${esc(e.excerpt)}</p>
                            <p class="jn-row__meta">${metaLine(e)}</p>
                        </div>
                        <div class="jn-row__media">${visual(e, "jn-row__img")}</div>
                    </a>
                </li>`;
}

/* ---------------- listing ---------------- */

function listingPage(entries, C) {
    const counts = Object.fromEntries(TYPE_ORDER.map((t) => [t, entries.filter((e) => e.kind === t).length]));
    const featured = entries.find((e) => e.featured) || null;
    const rest = entries;
    const filters = [["all", "All", entries.length], ...TYPE_ORDER.map((t) => [t, TYPE_INFO[t].plural, counts[t]])];
    const main = `
            <section class="jn-hero" aria-labelledby="jn-title">
                <div class="container">
                    <div class="jn-hero__top">
                        <span class="pj-label">Field notes / A personal engineering journal</span>
                        <a href="/" class="pj-link">${BACK}Back to home</a>
                    </div>
                    <h1 class="jn-hero__title" id="jn-title">Beyond the code<span class="dot">.</span></h1>
                    <div class="jn-hero__body">
                        <p class="jn-hero__lede">Ideas, experiences, experiments, and moments from my journey in technology.</p>
                        <dl class="jn-index">
${TYPE_ORDER.map((t, i) => `                            <div><dt><span>0${i + 1}</span>${esc(TYPE_INFO[t].plural)}</dt><dd>${String(counts[t]).padStart(2, "0")}</dd></div>`).join("\n")}
                        </dl>
                    </div>
                </div>
            </section>
${featured ? `
            <section class="jn-featured" aria-labelledby="jn-featured-title">
                <div class="container">
                    <p class="pj-label" id="jn-featured-title">Featured</p>
                    <a class="jn-feature" href="${featured.url}">
                        <div class="jn-feature__media">${visual(featured, "jn-feature__img")}</div>
                        <div class="jn-feature__text">
                            ${typeTag(featured)}
                            <h2 class="jn-feature__title">${esc(featured.title)}</h2>
                            <p class="jn-feature__excerpt">${esc(featured.excerpt)}</p>
                            <p class="jn-row__meta">${metaLine(featured)}</p>
                            <span class="pj-link">Read the note${ARROW}</span>
                        </div>
                    </a>
                </div>
            </section>` : ""}

            <section class="jn-list" aria-labelledby="jn-latest-title">
                <div class="container">
                    <div class="jn-list__head">
                        <h2 class="jn-list__title" id="jn-latest-title">Latest publications</h2>
${entries.length ? `                        <div class="jn-tools" data-jn-tools>
                            <div class="jn-filters" role="group" aria-label="Filter by type">
${filters.map(([k, l, n]) => `                                <button type="button" class="jn-filter" data-jn-filter="${k}" aria-pressed="${k === "all"}"${n || k === "all" ? "" : " disabled"}>${esc(l)}<span>${n}</span></button>`).join("\n")}
                            </div>
                            <div class="jn-search">
                                <label class="jn-sr" for="jn-q">Search the journal</label>
                                <input id="jn-q" type="search" placeholder="Search notes" autocomplete="off" data-jn-search>
                            </div>
                        </div>` : ""}
                    </div>
${entries.length ? `                    <ol class="jn-rows" data-jn-rows>
${rest.map(card).join("\n")}
                    </ol>
                    <p class="jn-empty" data-jn-empty hidden>No notes match this filter.</p>
                    <p class="jn-sr" aria-live="polite" data-jn-status></p>` : `                    <div class="jn-empty jn-empty--first">
                        <p>No field notes have been published yet.</p>
                        <p class="jn-empty__sub">Articles, events, hackathons and experiments will appear here as they are written.</p>
                    </div>`}
                </div>
            </section>`;
    return page({
        title: "Field Notes — A personal engineering journal | Yoosuf Ahamed",
        description: "Field notes by Yoosuf Ahamed: technical articles, technology events, hackathon experiences and engineering experiments.",
        canonical: `${SITE}/journal/`, bodyClass: "page-journal--index", main, C,
        jsonld: { "@context": "https://schema.org", "@type": "Blog", name: "Field Notes", url: `${SITE}/journal/`, author: { "@type": "Person", name: "Yoosuf Ahamed", url: SITE } },
        scripts: entries.length ? ["/assets/js/journal.js"] : [],
    });
}

/* ---------------- entry pages ---------------- */

function facts(rows) {
    const r = rows.filter(([, v]) => v);
    if (!r.length) return "";
    return `<dl class="jn-facts">${r.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}
function chips(items, label) {
    if (!items.length) return "";
    return `<div class="jn-chips"><p class="jn-chips__label">${esc(label)}</p><ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}
function linkRow(links) {
    const l = links.filter(([u]) => u);
    return l.length ? `<div class="jn-links">${l.map(([u, t]) => extLink(u, t)).join("")}</div>` : "";
}
function galleryBlock(e) {
    if (!e.gallery.length) return "";
    return `
                <section class="jn-gallery" aria-labelledby="jn-gallery-title">
                    <h2 class="jn-section-title" id="jn-gallery-title">${e.kind === "event" ? "Photographs" : "Gallery"}</h2>
                    <ul class="jn-gallery__grid${e.gallery.length === 1 ? " jn-gallery__grid--single" : ""}">
${e.gallery.map((g) => `                        <li style="--ar:${ratio(g.src).toFixed(4)}"><figure>${zoomImg(g.src, g.alt, g.caption)}${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ""}</figure></li>`).join("\n")}
                    </ul>
                </section>`;
}

function aside(e) {
    if (e.kind === "article") {
        return facts([["Published", `<time datetime="${e.date}">${esc(fmtDay(e.date))}</time>`], ["Reading time", `${e.readingTime} min`], ["Category", esc(e.category)]]) + chips(e.tags, "Tags");
    }
    if (e.kind === "event") {
        return facts([
            ["Date", `<time datetime="${e.date}">${esc(fmtRange(e.date, e.end))}</time>`],
            ["Location", esc(e.location)], ["Venue", esc(e.venue)], ["Organiser", esc(e.organiser)], ["My participation", esc(e.participation)],
        ]) + linkRow([[e.eventUrl, "Event website"], [upcoming(e) ? e.registrationUrl : "", "Register"]]) + chips(e.tags, "Tags");
    }
    if (e.kind === "hackathon") {
        return facts([
            ["Hackathon", esc(e.hackathonName)], ["Dates", `<time datetime="${e.date}">${esc(fmtRange(e.date, e.end))}</time>`],
            ["Project", esc(e.projectName)], ["Team", esc(e.teamName)], ["My role", esc(e.role)], ["Result", esc(e.result)],
        ]) + chips(e.technologies, "Built with") + linkRow([[e.githubUrl, "Source on GitHub"], [e.demoUrl, "Live demo"]]);
    }
    return facts([["Logged", `<time datetime="${e.date}">${esc(fmtDay(e.date))}</time>`]]) + chips(e.technologies, "Stack") + linkRow([[e.githubUrl, "Source on GitHub"], [e.demoUrl, "Live demo"]]);
}

function related(e, all) {
    const score = (o) => (o.kind === e.kind ? 2 : 0) + o.tags.filter((t) => e.tags.includes(t)).length * 2 + o.technologies.filter((t) => e.technologies.includes(t)).length + (o.category && o.category === e.category ? 1 : 0);
    return all.filter((o) => o !== e).map((o) => [score(o), o]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || (a[1].date < b[1].date ? 1 : -1)).slice(0, 3).map(([, o]) => o);
}

function entryPage(e, all, C) {
    const i = all.indexOf(e), newer = all[i - 1], older = all[i + 1];
    const rel = related(e, all);
    const headline = e.kind === "hackathon" && e.projectName && e.projectName !== e.title ? `<p class="jn-entry__sub">${esc(e.projectName)} · ${esc(e.hackathonName)}</p>` : e.kind === "hackathon" ? `<p class="jn-entry__sub">${esc(e.hackathonName)}</p>` : "";
    const lede = e.excerpt ? `<p class="jn-entry__lede">${esc(e.excerpt)}</p>` : "";
    const cover = e.cover ? `
                <figure class="jn-cover">${zoomImg(e.cover, e.coverAlt, "", 'decoding="async" fetchpriority="high"')}</figure>` : "";
    const main = `
            <article class="jn-entry jn-entry--${e.kind}" aria-labelledby="jn-entry-title">
                <div class="container">
                    <div class="jn-hero__top">
                        <nav aria-label="Breadcrumb"><ol class="jn-crumbs"><li><a href="/journal/">Field notes</a></li><li><span aria-current="page">${esc(TYPE_INFO[e.kind].plural)}</span></li></ol></nav>
                        <a href="/journal/" class="pj-link">${BACK}Back to journal</a>
                    </div>
                    <header class="jn-entry__head">
                        ${typeTag(e)}
                        <h1 class="jn-entry__title" id="jn-entry-title">${esc(e.title)}</h1>
                        ${headline}
                        ${lede}
                        <p class="jn-row__meta">${metaLine(e)}</p>
                    </header>${cover}
                    <div class="jn-entry__grid">
                        <aside class="jn-entry__aside" aria-label="${esc(e.typeLabel)} details">${aside(e)}</aside>
                        <div class="jn-prose">
${e.html || ""}
                        </div>
                    </div>${galleryBlock(e)}
${rel.length ? `
                    <section class="jn-related" aria-labelledby="jn-related-title">
                        <h2 class="jn-section-title" id="jn-related-title">Related notes</h2>
                        <ol class="jn-rows">
${rel.map(card).join("\n")}
                        </ol>
                    </section>` : ""}
                    <nav class="jn-pager" aria-label="More field notes">
                        ${newer ? `<a class="jn-pager__link jn-pager__link--prev" href="${newer.url}" rel="prev"><span>Newer</span><strong>${esc(newer.title)}</strong></a>` : "<span></span>"}
                        ${older ? `<a class="jn-pager__link jn-pager__link--next" href="${older.url}" rel="next"><span>Older</span><strong>${esc(older.title)}</strong></a>` : "<span></span>"}
                    </nav>
                    <p class="jn-back"><a href="/journal/" class="pj-link">${BACK}Back to journal</a></p>
                </div>
            </article>`;
    const canonical = `${SITE}${e.url}`;
    const author = { "@type": "Person", name: "Yoosuf Ahamed", url: SITE };
    const jsonld = e.kind === "event"
        ? { "@context": "https://schema.org", "@type": "Event", name: e.title, description: e.excerpt, startDate: e.date, ...(e.end ? { endDate: e.end } : {}), url: canonical, ...(e.cover ? { image: abs(e.cover) } : {}), ...(e.location || e.venue ? { location: { "@type": "Place", name: e.venue || e.location, ...(e.location ? { address: e.location } : {}) } } : {}), ...(e.organiser ? { organizer: { "@type": "Organization", name: e.organiser } } : {}) }
        : { "@context": "https://schema.org", "@type": "BlogPosting", headline: e.title, description: e.seoDescription || e.excerpt, datePublished: e.date, url: canonical, mainEntityOfPage: canonical, author, ...(e.cover ? { image: abs(e.cover) } : {}), ...(e.tags.length || e.technologies.length ? { keywords: [...e.tags, ...e.technologies].join(", ") } : {}) };
    return page({
        title: `${e.seoTitle || e.title} — Field Notes | Yoosuf Ahamed`,
        description: e.seoDescription || e.excerpt,
        canonical, ogType: "article", image: e.cover, imageAlt: e.coverAlt, jsonld, bodyClass: `page-journal--entry`, main, C,
        scripts: ["/assets/js/journal-lightbox.js"],
    });
}

/* ---------------- feeds ---------------- */

function feed(entries) {
    const items = entries.slice(0, 30).map((e) => `    <item>
      <title>${esc(e.title)}</title>
      <link>${SITE}${e.url}</link>
      <guid isPermaLink="true">${SITE}${e.url}</guid>
      <pubDate>${rfc822(e.date)}</pubDate>
      <category>${esc(e.typeLabel)}</category>
      <description>${esc(e.excerpt)}</description>
    </item>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Field Notes — Yoosuf Ahamed</title>
    <link>${SITE}/journal/</link>
    <atom:link href="${SITE}/journal/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Ideas, experiences, experiments, and moments from a journey in technology.</description>
    <language>en-gb</language>
${entries.length ? `    <lastBuildDate>${rfc822(entries[0].date)}</lastBuildDate>\n` : ""}${items}
  </channel>
</rss>
`;
}
function sitemap(entries) {
    const urls = [...SITEMAP_PAGES.map(([p, pr]) => [SITE + p, "", pr]), [`${SITE}/journal/`, entries[0]?.date || "", 0.7], ...entries.map((e) => [SITE + e.url, e.date, 0.6])];
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d, p]) => `  <url><loc>${esc(u)}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}<priority>${p.toFixed(1)}</priority></url>`).join("\n")}
</urlset>
`;
}
function latestJson(entries) {
    return JSON.stringify({
        generated: new Date().toISOString(),
        items: entries.slice(0, 3).map((e) => ({ title: e.title, url: e.url, type: e.kind, typeLabel: e.typeLabel, excerpt: e.excerpt, date: e.date, end: e.end || null, dateLabel: entryDate(e, fmtShort), readingTime: e.readingTime || null, cover: e.cover ? srcAttr(e.cover) : null, coverAlt: e.coverAlt || "" })),
    }, null, 2);
}

/* ---------------- write ---------------- */

function copySite() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    for (const name of fs.readdirSync(ROOT)) {
        if (EXCLUDE.has(name) || name.startsWith(".")) continue;
        if (path.resolve(ROOT, name) === OUT) continue;
        fs.cpSync(path.join(ROOT, name), path.join(OUT, name), { recursive: true, filter: (s) => {
            const base = path.basename(s);
            if (base.startsWith(".git") || base === ".DS_Store") return false;
            // journal uploads: only files used by published entries go live (draft images stay private)
            const rel = "/" + path.relative(ROOT, s).split(path.sep).join("/");
            if (rel.startsWith(MEDIA_DIR + "/") && fs.statSync(s).isFile()) return USED_MEDIA.has(rel);
            return true;
        } });
    }
}
function write(rel, data) {
    const file = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) throw new Error(`refusing to overwrite ${rel}: it already exists in the hand-made site`);
    fs.writeFileSync(file, data);
}

const entries = loadEntries();
for (const w of warnings) console.log(`  note  ${w}`);
if (errors.length) {
    console.error(`\nField notes: ${errors.length} problem${errors.length === 1 ? "" : "s"} in published content:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error("\nFix these entries (or set them back to Draft) and build again.");
    process.exit(1);
}
const byType = TYPE_ORDER.map((t) => { const n = entries.filter((e) => e.kind === t).length; return `${n} ${(n === 1 ? TYPE_INFO[t].label : TYPE_INFO[t].plural).toLowerCase()}`; }).join(", ");
if (CHECK_ONLY) { console.log(`Field notes: content is valid — ${entries.length} published (${byType}).`); process.exit(0); }

copySite();
const C = chrome();
write("journal/index.html", listingPage(entries, C));
for (const e of entries) write(`journal/${e.slug}/index.html`, entryPage(e, entries, C));
write("journal/latest.json", latestJson(entries));
write("journal/feed.xml", feed(entries));
write("sitemap.xml", sitemap(entries));
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`Field notes: built ${path.relative(ROOT, OUT) || "."}/ — ${entries.length} published (${byType}).`);
