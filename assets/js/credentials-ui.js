/* =========================================================
   CREDENTIALS UI
   ---------------------------------------------------------
   1. Homepage teaser   [data-cr-home]      (index.html)
   2. Registry page     [data-cr-registry]  (certifications.html)
      - record index (left) + document exhibition (right)
      - URL hash per record (#cr-002) with back / forward
      - the exhibition moves under the selected record ≤ 991px
   3. Fullscreen viewer [data-cr-viewer]
      - zoom (buttons, wheel, pinch, double-click), pan, fit
      - ← / → records, + / − zoom, 0 fit, Esc close
      - focus trap + background scroll lock
   Data: window.CREDENTIALS (assets/js/credentials-data.js)
   No dependencies.
   ========================================================= */

(function () {
    'use strict';

    var DATA = window.CREDENTIALS;
    var STATS = window.CREDENTIAL_STATS;
    if (!DATA || !STATS) return;

    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var ARROW = '<svg class="pj-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 9.5 9.5 2.5M4 2.5h5.5V8"/></svg>';
    var NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function kb(bytes) {
        if (!bytes) return '';
        return bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';
    }

    function fileName(url) {
        return url ? url.split('/').pop() : '';
    }

    function periodLabel() {
        if (!STATS.periodStart) return '—';
        return STATS.periodStart === STATS.periodEnd ? STATS.periodStart : STATS.periodStart + ' — ' + STATS.periodEnd;
    }

    function rangeLabel() {
        return STATS.firstCode === STATS.lastCode ? STATS.firstCode : STATS.firstCode + ' → ' + STATS.lastCode;
    }


    /* =====================================================
       1. HOMEPAGE TEASER
       ===================================================== */

    function initHome() {
        var root = document.querySelector('[data-cr-home]');
        if (!root) return;

        root.querySelectorAll('[data-cr-count]').forEach(function (el) { el.textContent = STATS.totalLabel; });
        root.querySelectorAll('[data-cr-ref]').forEach(function (el) { el.textContent = rangeLabel(); });
        root.querySelectorAll('[data-cr-period]').forEach(function (el) { el.textContent = periodLabel(); });

        var mono = root.querySelector('[data-cr-monograms]');
        if (mono) {
            mono.innerHTML = STATS.issuers.map(function (i) {
                return '<li title="' + esc(i.institution) + '"><span aria-hidden="true">' + esc(i.monogram) + '</span>' +
                    '<span class="pj-visually-hidden">' + esc(i.institution) + '</span></li>';
            }).join('');
        }

        // ---- "The Archive Index" entrance ----
        // --crh-fill (0 → 1) wipes CREDENTIALS from outline to white as the
        // heading travels from 88% to 42% of the viewport height. One way:
        // it never un-fills. At 35% the "04", row and monograms stagger in.
        var inner = root.querySelector('.crh-inner');
        var display = root.querySelector('[data-crh-display]');
        if (!inner || !display) return;

        root.classList.add('is-js');

        var fill = 0;
        var ticking = false;
        var done = false;

        function finish() {
            fill = 1;
            done = true;
            inner.style.setProperty('--crh-fill', '1');
            root.classList.add('is-in');
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        }

        function measure() {
            ticking = false;
            if (done) return;
            var vh = window.innerHeight || document.documentElement.clientHeight;
            var r = display.getBoundingClientRect();
            var start = vh * 0.88, end = vh * 0.42;
            var p = (start - r.top) / (start - end);
            p = Math.max(0, Math.min(1, p));
            if (r.bottom < 0) p = 1;               // already scrolled past (deep link / refresh)
            if (p > fill) {
                fill = p;
                inner.style.setProperty('--crh-fill', fill.toFixed(4));
            }
            if (fill >= 0.35) root.classList.add('is-in');
            if (fill >= 1) finish();
        }

        function onScroll() {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(measure);
            }
        }

        if (reduceMQ.matches) {
            finish();
            return;
        }

        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        window.addEventListener('load', onScroll);
        measure();
    }


    /* =====================================================
       2. REGISTRY PAGE
       ===================================================== */

    var registry = null;

    function initRegistry() {
        var root = document.querySelector('[data-cr-registry]');
        if (!root) return;

        var indexEl = root.querySelector('[data-cr-index]');
        var exhibit = root.querySelector('[data-cr-exhibit]');
        var exhibitHome = root.querySelector('[data-cr-exhibit-home]');
        var mobileMQ = window.matchMedia('(max-width: 991px)');

        // ---- Summary ----
        var set = function (key, html) {
            var el = root.querySelector('[data-cr-stat="' + key + '"]');
            if (el) el.innerHTML = html;
        };
        set('total', STATS.totalLabel);
        set('period', esc(periodLabel()));
        set('verify', STATS.pad(STATS.withVerification) + ' <span>/ ' + STATS.totalLabel + '</span>');
        set('docs', STATS.pad(STATS.withDocument) + ' <span>/ ' + STATS.totalLabel + '</span>');
        var range = root.querySelector('[data-cr-range]');
        if (range) range.textContent = rangeLabel();
        var lede = root.querySelector('[data-cr-lede]');
        if (lede && NUM_WORDS[STATS.total]) {
            lede.textContent = NUM_WORDS[STATS.total] + ' learning record' + (STATS.total === 1 ? '' : 's') + '. One continuous pursuit of knowledge.';
        }

        // ---- Index ----
        indexEl.innerHTML = DATA.map(function (c) {
            return '<li class="crp-rec" data-cr-rec="' + c.index + '">' +
                '<button type="button" class="crp-rec__btn" id="cr-rec-' + esc(c.id) + '" aria-controls="cr-exhibit" aria-current="false" data-cr-pick="' + c.index + '">' +
                    '<span class="crp-rec__code">' + esc(c.code) + '</span>' +
                    '<span class="crp-rec__main">' +
                        '<span class="crp-rec__inst">' + esc(c.institution) + '</span>' +
                        '<span class="crp-rec__title">' + esc(c.title) + '</span>' +
                    '</span>' +
                    '<span class="crp-rec__meta"><span>' + esc(c.credentialType) + '</span><span>' + esc(c.year || '') + '</span></span>' +
                    '<span class="crp-rec__state" aria-hidden="true"><span class="crp-rec__sel">Selected</span>' +
                        '<svg viewBox="0 0 12 12" focusable="false"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"/></svg></span>' +
                '</button>' +
                '<div class="crp-rec__slot" data-cr-slot></div>' +
            '</li>';
        }).join('') + '<li class="crp-index__marker" aria-hidden="true" data-cr-marker></li>';

        var rows = Array.prototype.slice.call(indexEl.querySelectorAll('.crp-rec'));
        var buttons = rows.map(function (r) { return r.querySelector('.crp-rec__btn'); });
        var marker = indexEl.querySelector('[data-cr-marker]');

        var current = -1;
        var swapTimer = 0;

        function placeMarker() {
            if (current < 0 || mobileMQ.matches) return;
            // rows are the list's positioned children; the button fills its row
            marker.style.transform = 'translateY(' + rows[current].offsetTop + 'px)';
            marker.style.height = buttons[current].offsetHeight + 'px';
        }

        function placeExhibit() {
            if (mobileMQ.matches) {
                var slot = rows[current] && rows[current].querySelector('[data-cr-slot]');
                if (slot && exhibit.parentNode !== slot) slot.appendChild(exhibit);
            } else if (exhibit.parentNode !== exhibitHome) {
                exhibitHome.appendChild(exhibit);
            }
            placeMarker();
        }

        function renderExhibit(c) {
            var pos = STATS.pad(c.index + 1) + ' / ' + STATS.totalLabel;
            var doc;

            if (c.hasDocument && c.preview) {
                var p = c.preview;
                doc = '<figure class="crx-figure">' +
                    '<button type="button" class="crx-frame" data-cr-open aria-label="Open ' + esc(c.title) + ' in the full-screen viewer">' +
                        '<span class="crx-sheet" style="aspect-ratio:' + p.width + ' / ' + p.height + ';--ar:' + (p.width / p.height).toFixed(4) + '">' +
                            '<img src="' + esc(p.src) + '" srcset="' + esc(p.src) + ' 1400w, ' + esc(p.large) + ' 2400w" ' +
                            'sizes="(max-width: 991px) 92vw, 52vw" width="' + p.width + '" height="' + p.height + '" ' +
                            'alt="Certificate: ' + esc(c.documentTitle || c.title) + ', issued by ' + esc(c.institution) + '" decoding="async">' +
                        '</span>' +
                        '<span class="crx-expand" aria-hidden="true">' +
                            '<svg viewBox="0 0 16 16" focusable="false"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>View full document</span>' +
                    '</button>' +
                    '<figcaption class="crx-cap"><span>Original document</span><span>' +
                        (c.documentType === 'pdf' ? 'PDF · page 1 shown unaltered' : 'Image · shown unaltered') + '</span></figcaption>' +
                '</figure>';
            } else {
                doc = '<div class="crx-missing" style="aspect-ratio: 1.414 / 1">' +
                    '<span class="crx-missing__label">Document not on file</span>' +
                    '<p class="crx-missing__title">' + esc(c.title) + '</p>' +
                    '<p class="crx-missing__text">The original document for this record has not been added to the registry. ' +
                    (c.hasVerification ? 'It can be checked on the issuer\'s page.' : 'Details below are taken from the credential record.') + '</p>' +
                    (c.hasVerification ? '<a class="pj-link" href="' + esc(c.verificationUrl) + '" target="_blank" rel="noopener noreferrer">Verify with issuer ' + ARROW + '</a>' : '') +
                '</div>';
            }

            var rowsHtml = '' +
                row('Institution', esc(c.institution)) +
                row('Type', esc(c.credentialType)) +
                row('Issued', esc(c.issuedLabel)) +
                (c.documentTitle && c.documentTitle !== c.title ? row('As printed', '<span class="crx-dim">“' + esc(c.documentTitle) + '”</span>') : '') +
                row('Topics', '<ul class="crx-topics">' + c.topics.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>') +
                row('Document', c.hasDocument ? esc((c.documentType || '').toUpperCase()) + (c.documentSize ? ' · ' + kb(c.documentSize) : '') : '<span class="crx-dim">Not on file</span>') +
                row('Verification', c.hasVerification
                    ? 'External link <span class="crx-dim">· ' + esc(hostOf(c.verificationUrl)) + '</span>'
                    : (c.verificationStatus === 'on-request' ? 'On request' : '<span class="crx-dim">Not available</span>'));

            var actions = '';
            if (c.hasDocument) {
                actions += '<button type="button" class="pj-btn" data-cr-open>View document' +
                    '<svg class="pj-arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg></button>';
                actions += '<a class="pj-btn pj-btn--ghost" href="' + esc(c.documentUrl) + '" download="' + esc(fileName(c.documentUrl)) + '">Download original' +
                    '<svg class="pj-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M6 1.5v8M2.5 6 6 9.5 9.5 6"/></svg></a>';
            }
            if (c.hasVerification) {
                actions += '<a class="pj-link" href="' + esc(c.verificationUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="Verify ' + esc(c.title) + ' on ' + esc(hostOf(c.verificationUrl)) + ' (opens in a new tab)">Verify ' + ARROW + '</a>';
            } else if (c.verificationStatus === 'on-request') {
                actions += '<span class="crx-onreq">Verification on request</span>';
            }

            exhibit.innerHTML =
                '<div class="crx-head">' +
                    '<span class="crx-code">Exhibit <strong>' + esc(c.code) + '</strong></span>' +
                    '<span class="crx-pos">' + pos + '</span>' +
                '</div>' +
                doc +
                '<div class="crx-body">' +
                    '<h3 class="crx-title" id="cr-exhibit-title">' + esc(c.title) + '</h3>' +
                    '<dl class="crx-data">' + rowsHtml + '</dl>' +
                    '<div class="crx-actions">' + actions + '</div>' +
                '</div>';

            var img = exhibit.querySelector('.crx-sheet img');
            if (img) {
                var done = function () { exhibit.classList.add('is-loaded'); };
                if (img.complete && img.naturalWidth) done();
                else { img.addEventListener('load', done); img.addEventListener('error', done); }
            } else {
                exhibit.classList.add('is-loaded');
            }
        }

        function row(label, value) {
            return '<div class="crx-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
        }

        function select(i, opts) {
            opts = opts || {};
            if (i < 0 || i >= DATA.length) return;
            var c = DATA[i];
            var changed = i !== current;

            if (changed) {
                buttons.forEach(function (b, j) {
                    b.setAttribute('aria-current', j === i ? 'true' : 'false');
                    rows[j].classList.toggle('is-selected', j === i);
                });

                var prev = current;
                current = i;
                placeExhibit();

                var instant = reduceMQ.matches || prev < 0 || opts.instant;
                clearTimeout(swapTimer);
                if (instant) {
                    exhibit.classList.remove('is-out');
                    exhibit.classList.remove('is-loaded');
                    renderExhibit(c);
                } else {
                    exhibit.classList.add('is-out');
                    swapTimer = setTimeout(function () {
                        exhibit.classList.remove('is-loaded');
                        renderExhibit(c);
                        // next frame: fade the new exhibit in
                        requestAnimationFrame(function () { exhibit.classList.remove('is-out'); });
                    }, 180);
                }
            }

            // URL state (#cr-002): clicks push, arrow-key browsing replaces
            var hash = '#' + c.id;
            if (opts.history && location.hash !== hash) {
                try {
                    if (opts.history === 'push') history.pushState({ cr: c.id }, '', hash);
                    else history.replaceState({ cr: c.id }, '', hash);
                } catch (e) { /* file:// or sandboxed */ }
            }

            if (opts.focus) buttons[i].focus({ preventScroll: true });

            if (opts.reveal && mobileMQ.matches) {
                // bring the record (with its preview underneath) into view
                var top = rows[i].getBoundingClientRect().top + window.pageYOffset - 88;
                window.scrollTo({ top: top, behavior: reduceMQ.matches ? 'auto' : 'smooth' });
            }
        }

        function indexFromHash() {
            var id = (location.hash || '').slice(1).toLowerCase();
            for (var i = 0; i < DATA.length; i++) if (DATA[i].id === id) return i;
            return -1;
        }

        // ---- Events ----
        indexEl.addEventListener('click', function (e) {
            var b = e.target.closest('[data-cr-pick]');
            if (!b) return;
            var i = +b.getAttribute('data-cr-pick');
            if (i === current) {
                if (DATA[i].hasDocument) viewer.open(i, b);
                return;
            }
            select(i, { history: 'push', reveal: true });
        });

        indexEl.addEventListener('keydown', function (e) {
            var b = e.target.closest('[data-cr-pick]');
            if (!b) return;
            var i = +b.getAttribute('data-cr-pick');
            var next = -1;
            if (e.key === 'ArrowDown') next = Math.min(DATA.length - 1, i + 1);
            else if (e.key === 'ArrowUp') next = Math.max(0, i - 1);
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = DATA.length - 1;
            if (next < 0) return;
            e.preventDefault();
            select(next, { history: 'replace', focus: true });
        });

        exhibit.addEventListener('click', function (e) {
            var o = e.target.closest('[data-cr-open]');
            if (o) viewer.open(current, o);
        });

        window.addEventListener('popstate', function () {
            // no hash = the page as first opened → the first record
            var i = indexFromHash();
            if (i < 0 && !location.hash) i = 0;
            if (i >= 0 && i !== current) select(i, { reveal: true });
        });
        window.addEventListener('hashchange', function () {
            var i = indexFromHash();
            if (i >= 0 && i !== current) select(i, { reveal: true });
        });

        var onMQ = function () { placeExhibit(); };
        if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', onMQ);
        else mobileMQ.addListener(onMQ);
        window.addEventListener('resize', placeMarker);
        if ('ResizeObserver' in window) new ResizeObserver(placeMarker).observe(indexEl);

        // ---- Initial selection ----
        var start = indexFromHash();
        select(start >= 0 ? start : 0, { instant: true });
        root.classList.add('is-ready');
        if (start >= 0) {
            // deep link: bring the archive into view once layout settles
            window.addEventListener('load', function () {
                var target = mobileMQ.matches ? rows[start] : root.querySelector('.crp-archive');
                var top = target.getBoundingClientRect().top + window.pageYOffset - 24;
                window.scrollTo({ top: top, behavior: 'auto' });
            });
        }

        registry = {
            select: select,
            current: function () { return current; }
        };
    }

    function hostOf(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    }


    /* =====================================================
       3. FULLSCREEN VIEWER
       ===================================================== */

    var viewer = (function () {
        var el = document.querySelector('[data-cr-viewer]');
        if (!el) return { open: function () {} };

        // Escape any transformed ancestor so position:fixed means the viewport
        document.body.appendChild(el);

        var stage = el.querySelector('[data-crv-stage]');
        var img = el.querySelector('[data-crv-img]');
        var zoomOut = el.querySelector('[data-crv-zoom]');
        var codeEl = el.querySelector('[data-crv-code]');
        var titleEl = el.querySelector('[data-crv-title]');
        var countEl = el.querySelector('[data-crv-count]');
        var noteEl = el.querySelector('[data-crv-note]');
        var dl = el.querySelector('[data-crv="download"]');
        var vf = el.querySelector('[data-crv="verify"]');
        var btnIn = el.querySelector('[data-crv="in"]');
        var btnOut = el.querySelector('[data-crv="out"]');

        var MIN = 0.5, MAX = 6, STEP = 1.25;
        var state = { i: -1, s: 1, x: 0, y: 0, fw: 0, fh: 0, nw: 0, nh: 0 };
        var lastFocus = null;
        var isOpen = false;
        var loadToken = 0;

        function docs() {
            return DATA.filter(function (c) { return c.hasDocument && c.preview; });
        }

        function measure() {
            var r = stage.getBoundingClientRect();
            var padX = r.width < 600 ? 16 : 64, padY = r.width < 600 ? 16 : 40;
            var aw = Math.max(80, r.width - padX * 2), ah = Math.max(80, r.height - padY * 2);
            var ratio = state.nw / state.nh;
            var fw = aw, fh = aw / ratio;
            if (fh > ah) { fh = ah; fw = ah * ratio; }
            state.fw = fw; state.fh = fh;
            img.style.width = fw + 'px';
            img.style.height = fh + 'px';
        }

        function clamp() {
            var r = stage.getBoundingClientRect();
            var w = state.fw * state.s, h = state.fh * state.s;
            var mx = Math.max(0, (w - r.width) / 2 + 24);
            var my = Math.max(0, (h - r.height) / 2 + 24);
            if (w <= r.width) state.x = 0; else state.x = Math.max(-mx, Math.min(mx, state.x));
            if (h <= r.height) state.y = 0; else state.y = Math.max(-my, Math.min(my, state.y));
        }

        function apply(animate) {
            clamp();
            el.classList.toggle('is-animating', !!animate && !reduceMQ.matches);
            img.style.transform = 'translate(-50%, -50%) translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.s + ')';
            zoomOut.textContent = Math.round(state.s * 100) + '%';
            el.classList.toggle('is-zoomed', state.s > 1.001);
            btnIn.disabled = state.s >= MAX - 0.001;
            btnOut.disabled = state.s <= MIN + 0.001;
        }

        // Zoom keeping the point (px, py) — relative to stage centre — fixed
        function zoomTo(s, px, py, animate) {
            s = Math.max(MIN, Math.min(MAX, s));
            px = px || 0; py = py || 0;
            var k = s / state.s;
            state.x = px - (px - state.x) * k;
            state.y = py - (py - state.y) * k;
            state.s = s;
            apply(animate);
        }

        function fit(animate) {
            state.s = 1; state.x = 0; state.y = 0;
            apply(animate);
        }

        function stagePoint(clientX, clientY) {
            var r = stage.getBoundingClientRect();
            return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
        }

        function show(i) {
            var c = DATA[i];
            if (!c || !c.hasDocument) return;
            state.i = i;
            var list = docs();
            var pos = list.indexOf(c);

            codeEl.textContent = c.code + ' · ' + c.institution;
            titleEl.textContent = c.title;
            countEl.textContent = STATS.pad(pos + 1) + ' / ' + STATS.pad(list.length);
            noteEl.textContent = c.documentType === 'pdf'
                ? 'Page 1 of the original PDF' + (c.hasVerification ? '' : ' · Verification on request')
                : 'Original image' + (c.hasVerification ? '' : ' · Verification on request');

            dl.href = c.documentUrl;
            dl.setAttribute('download', fileName(c.documentUrl));
            dl.setAttribute('aria-label', 'Download original ' + (c.documentType || 'document').toUpperCase() + (c.documentSize ? ' (' + kb(c.documentSize) + ')' : ''));

            if (c.hasVerification) {
                vf.hidden = false;
                vf.href = c.verificationUrl;
                vf.setAttribute('aria-label', 'Verify on ' + hostOf(c.verificationUrl) + ' (opens in a new tab)');
            } else {
                vf.hidden = true;
                vf.removeAttribute('href');
            }

            state.nw = c.preview.width;
            state.nh = c.preview.height;
            img.alt = 'Certificate: ' + (c.documentTitle || c.title) + ', issued by ' + c.institution;

            // Show the (already cached) exhibition image at once, then upgrade
            var token = ++loadToken;
            el.classList.add('is-loading');
            img.src = c.preview.src;
            var hi = new Image();
            hi.decoding = 'async';
            hi.onload = function () {
                if (token !== loadToken) return;
                img.src = c.preview.large;
                el.classList.remove('is-loading');
            };
            hi.onerror = function () { if (token === loadToken) el.classList.remove('is-loading'); };
            hi.src = c.preview.large;

            measure();
            fit(false);

            var multiple = list.length > 1;
            el.querySelector('[data-crv="prev"]').hidden = !multiple;
            el.querySelector('[data-crv="next"]').hidden = !multiple;
        }

        function step(dir) {
            var list = docs();
            if (list.length < 2) return;
            var pos = list.indexOf(DATA[state.i]);
            var next = list[(pos + dir + list.length) % list.length];
            show(next.index);
            if (registry) registry.select(next.index, { history: 'replace', instant: true });
        }

        function lock(on) {
            var root = document.documentElement;
            if (on) {
                var sb = window.innerWidth - root.clientWidth;
                root.classList.add('crv-lock');
                if (sb > 0) document.body.style.paddingRight = sb + 'px';
            } else {
                root.classList.remove('crv-lock');
                document.body.style.paddingRight = '';
            }
        }

        function open(i, from) {
            lastFocus = from || document.activeElement;
            el.hidden = false;
            isOpen = true;
            lock(true);
            show(i);
            // allow the fade-in transition to start from opacity 0
            requestAnimationFrame(function () { el.classList.add('is-open'); });
            el.querySelector('[data-crv="close"]').focus({ preventScroll: true });
        }

        function close() {
            if (!isOpen) return;
            isOpen = false;
            el.classList.remove('is-open');
            var finish = function () {
                if (isOpen) return;
                el.hidden = true;
                img.removeAttribute('src');
            };
            if (reduceMQ.matches) finish(); else setTimeout(finish, 260);
            lock(false);
            if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
            else if (registry) {
                var b = document.getElementById('cr-rec-' + DATA[registry.current()].id);
                if (b) b.focus({ preventScroll: true });
            }
        }

        // ---- Controls ----
        el.addEventListener('click', function (e) {
            var b = e.target.closest('[data-crv]');
            if (!b) {
                // click on the empty backdrop (not the document) closes
                if (e.target === stage && state.s <= 1.001 && !moved) close();
                return;
            }
            var a = b.getAttribute('data-crv');
            if (a === 'in') zoomTo(state.s * STEP, 0, 0, true);
            else if (a === 'out') zoomTo(state.s / STEP, 0, 0, true);
            else if (a === 'fit') fit(true);
            else if (a === 'close') close();
            else if (a === 'prev') step(-1);
            else if (a === 'next') step(1);
        });

        document.addEventListener('keydown', function (e) {
            if (!isOpen) return;
            var k = e.key;
            if (k === 'Escape') { e.preventDefault(); close(); }
            else if (k === 'ArrowLeft' && state.s <= 1.001) { e.preventDefault(); step(-1); }
            else if (k === 'ArrowRight' && state.s <= 1.001) { e.preventDefault(); step(1); }
            else if (k === '+' || k === '=') { e.preventDefault(); zoomTo(state.s * STEP, 0, 0, true); }
            else if (k === '-' || k === '_') { e.preventDefault(); zoomTo(state.s / STEP, 0, 0, true); }
            else if (k === '0') { e.preventDefault(); fit(true); }
            else if (/^Arrow/.test(k) && state.s > 1.001) {
                // pan when zoomed
                e.preventDefault();
                var d = 60;
                if (k === 'ArrowLeft') state.x += d;
                if (k === 'ArrowRight') state.x -= d;
                if (k === 'ArrowUp') state.y += d;
                if (k === 'ArrowDown') state.y -= d;
                apply(true);
            } else if (k === 'Tab') {
                // focus trap
                var f = Array.prototype.filter.call(
                    el.querySelectorAll('button, a[href]'),
                    function (n) { return !n.hidden && !n.disabled && n.offsetParent !== null; }
                );
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                else if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
            }
        });

        // Wheel / trackpad zoom around the cursor
        stage.addEventListener('wheel', function (e) {
            e.preventDefault();
            var p = stagePoint(e.clientX, e.clientY);
            var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022));
            zoomTo(state.s * f, p.x, p.y, false);
        }, { passive: false });

        // Pointer: drag to pan, two fingers to pinch, double-tap to zoom
        var pointers = {};
        var pinch = null;
        var drag = null;
        var moved = false;
        var lastTap = 0;

        stage.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            stage.setPointerCapture(e.pointerId);
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            moved = false;
            var ids = Object.keys(pointers);
            if (ids.length === 2) {
                var a = pointers[ids[0]], b = pointers[ids[1]];
                var mid = stagePoint((a.x + b.x) / 2, (a.y + b.y) / 2);
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: state.s, mx: mid.x, my: mid.y, x: state.x, y: state.y };
                drag = null;
            } else if (ids.length === 1) {
                drag = { x: e.clientX, y: e.clientY, sx: state.x, sy: state.y };
            }
        });

        stage.addEventListener('pointermove', function (e) {
            if (!pointers[e.pointerId]) return;
            pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
            var ids = Object.keys(pointers);
            if (pinch && ids.length >= 2) {
                var a = pointers[ids[0]], b = pointers[ids[1]];
                var s = Math.max(MIN, Math.min(MAX, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
                var k = s / pinch.s;
                state.s = s;
                state.x = pinch.mx - (pinch.mx - pinch.x) * k;
                state.y = pinch.my - (pinch.my - pinch.y) * k;
                moved = true;
                apply(false);
            } else if (drag && state.s > 1.001) {
                var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
                state.x = drag.sx + dx;
                state.y = drag.sy + dy;
                el.classList.add('is-dragging');
                apply(false);
            } else if (drag) {
                if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) moved = true;
            }
        });

        function endPointer(e) {
            if (!pointers[e.pointerId]) return;
            delete pointers[e.pointerId];
            var ids = Object.keys(pointers);
            if (ids.length < 2) pinch = null;
            if (ids.length === 1) {
                var p = pointers[ids[0]];
                drag = { x: p.x, y: p.y, sx: state.x, sy: state.y };
            }
            if (!ids.length) {
                el.classList.remove('is-dragging');
                // swipe between records on touch when not zoomed
                if (drag && e.pointerType !== 'mouse' && state.s <= 1.001 && e.type === 'pointerup') {
                    var dx = e.clientX - drag.x;
                    if (Math.abs(dx) > 60 && Math.abs(e.clientY - drag.y) < 50) { step(dx < 0 ? 1 : -1); moved = true; }
                }
                drag = null;
                if (e.type === 'pointerup' && !moved && e.target === img) {
                    var now = Date.now();
                    if (now - lastTap < 320) {
                        var pt = stagePoint(e.clientX, e.clientY);
                        if (state.s > 1.001) fit(true); else zoomTo(2.5, pt.x, pt.y, true);
                        lastTap = 0;
                    } else {
                        lastTap = now;
                    }
                }
            }
        }
        stage.addEventListener('pointerup', endPointer);
        stage.addEventListener('pointercancel', endPointer);

        window.addEventListener('resize', function () {
            if (!isOpen) return;
            measure();
            apply(false);
        });

        return { open: open, close: close };
    })();


    initHome();
    initRegistry();
})();
