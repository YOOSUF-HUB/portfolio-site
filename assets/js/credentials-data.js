/* =========================================================
   CREDENTIALS — single source of truth
   ---------------------------------------------------------
   Used by the homepage "Knowledge archive / 002" section and
   by certifications.html (the Credential Registry).

   To add a credential: append one object. Everything else
   (ids, counts, period, index, exhibition, viewer) follows.

   Field notes
   - id               Registry id. "CR—00N" is derived from order
                      if omitted.
   - title            Display title.
   - documentTitle    The title exactly as printed on the document
                      (only when it differs from `title`).
   - issued           ISO date printed on the document. Leave null
                      if the document has no date.
   - year             Derived from `issued` when omitted.
   - documentUrl      The ORIGINAL file (PDF or image). null when
                      no document is on file → the registry shows
                      a "document not on file" state instead.
   - documentType     "pdf" | "image"
   - preview          Faithful raster of page 1 of the original
                      (rendered from the PDF, never redrawn).
                      { src, large, width, height }
   - verificationUrl  Only a URL that already existed on the
                      live site. Never invented.
   - verificationStatus
                      "external-link"  issuer page exists (linked)
                      "on-request"     no public verification page
                      "none"           nothing available
                      This is NOT a claim the record has been
                      checked — only where a visitor can check it.
   ========================================================= */

(function () {
    'use strict';

    var DIR = 'assets/certificates/';

    var CREDENTIALS = [
        {
            id: 'cr-001',
            title: 'AI/ML Engineering — Stage 1',
            documentTitle: 'AI/ML Engineer - Stage 1',
            institution: 'SLIIT · Centre for Open & Distance Education',
            issuer: 'SLIIT',
            monogram: 'SL',
            credentialType: 'Certificate',
            issued: '2025-12-04',
            topics: ['Machine Learning', 'Applied AI', 'Python'],
            documentUrl: DIR + 'cr-001-sliit-ai-ml-engineer-stage-1.pdf',
            documentType: 'pdf',
            documentSize: 89248,
            preview: {
                src: DIR + 'cr-001-sliit-ai-ml-engineer-stage-1-1400.jpg',
                large: DIR + 'cr-001-sliit-ai-ml-engineer-stage-1.jpg',
                width: 2400,
                height: 1696
            },
            verificationUrl: 'https://code.sliit.org/certificates/dglefu1tib',
            verificationStatus: 'external-link'
        },
        {
            id: 'cr-002',
            title: 'Machine Learning A-Z: AI, Python & R',
            documentTitle: 'Machine Learning A-Z: AI, Python & R + ChatGPT Prize [2026]',
            institution: 'Udemy',
            issuer: 'Udemy',
            monogram: 'Ud',
            credentialType: 'Course Certificate',
            issued: '2026-01-14',
            topics: ['ML Algorithms', 'Deep Learning', 'Computer Vision', 'NLP'],
            documentUrl: DIR + 'cr-002-udemy-machine-learning-a-z.pdf',
            documentType: 'pdf',
            documentSize: 235908,
            preview: {
                src: DIR + 'cr-002-udemy-machine-learning-a-z-1400.jpg',
                large: DIR + 'cr-002-udemy-machine-learning-a-z.jpg',
                width: 2400,
                height: 1784
            },
            verificationUrl: 'https://www.udemy.com/certificate/UC-b34121cd-6458-4134-894a-6a72a3587a22/',
            verificationStatus: 'external-link'
        },
        {
            id: 'cr-003',
            title: 'GenAI Business Strategy & Solution Design',
            documentTitle: 'Generative AI Business Strategy and Solution Design',
            institution: 'Amazon Web Services',
            issuer: 'AWS',
            monogram: 'AWS',
            credentialType: 'Course Certificate',
            issued: '2025-12-22',
            topics: ['Responsible AI', 'Foundation Models', 'AI Strategy'],
            documentUrl: DIR + 'cr-003-aws-genai-business-strategy.pdf',
            documentType: 'pdf',
            documentSize: 93669,
            preview: {
                src: DIR + 'cr-003-aws-genai-business-strategy-1400.jpg',
                large: DIR + 'cr-003-aws-genai-business-strategy.jpg',
                width: 2400,
                height: 1854
            },
            verificationUrl: null,
            verificationStatus: 'on-request'
        },
        {
            id: 'cr-004',
            title: 'Introduction to Cloud Infrastructure',
            documentTitle: 'Introduction to Cloud Infrastructure: Describe cloud concepts',
            institution: 'Microsoft Learn',
            issuer: 'Microsoft',
            monogram: 'MS',
            credentialType: 'Training Achievement',
            issued: '2025-12-23',
            topics: ['IaaS', 'PaaS', 'Azure', 'Networking', 'Cloud Security'],
            documentUrl: DIR + 'cr-004-microsoft-learn-cloud-infrastructure.pdf',
            documentType: 'pdf',
            documentSize: 239664,
            preview: {
                src: DIR + 'cr-004-microsoft-learn-cloud-infrastructure-1400.jpg',
                large: DIR + 'cr-004-microsoft-learn-cloud-infrastructure.jpg',
                width: 2400,
                height: 1696
            },
            verificationUrl: 'https://learn.microsoft.com/en-us/users/yoosuf-8173/achievements/wvp2cg2n',
            verificationStatus: 'external-link'
        }
    ];

    // ---- Normalise + derived values (no hand-maintained numbers) ----

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function pad(n) { return (n < 10 ? '0' : '') + n; }

    CREDENTIALS.forEach(function (c, i) {
        c.index = i;
        c.id = c.id || 'cr-' + ('00' + (i + 1)).slice(-3);
        c.code = 'CR—' + c.id.replace(/^cr-/, '');
        if (c.issued) {
            var p = c.issued.split('-');
            c.year = c.year || +p[0];
            c.issuedLabel = MONTHS[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
            c.issuedShort = MONTHS[+p[1] - 1] + ' ' + p[0];
        } else {
            c.issuedLabel = c.year ? String(c.year) : 'Undated';
            c.issuedShort = c.issuedLabel;
        }
        c.hasDocument = !!c.documentUrl;
        c.hasVerification = c.verificationStatus === 'external-link' && !!c.verificationUrl;
        c.slug = c.id;
    });

    var dated = CREDENTIALS.filter(function (c) { return c.issued; })
        .map(function (c) { return c.issued; }).sort();

    var issuers = [];
    CREDENTIALS.forEach(function (c) {
        if (!issuers.some(function (x) { return x.issuer === c.issuer; })) {
            issuers.push({ issuer: c.issuer, monogram: c.monogram, institution: c.institution });
        }
    });

    function label(iso) {
        if (!iso) return '';
        var p = iso.split('-');
        return MONTHS[+p[1] - 1] + ' ' + p[0];
    }

    window.CREDENTIALS = CREDENTIALS;
    window.CREDENTIAL_STATS = {
        total: CREDENTIALS.length,
        totalLabel: pad(CREDENTIALS.length),
        withDocument: CREDENTIALS.filter(function (c) { return c.hasDocument; }).length,
        withVerification: CREDENTIALS.filter(function (c) { return c.hasVerification; }).length,
        periodStart: label(dated[0]),
        periodEnd: label(dated[dated.length - 1]),
        firstCode: CREDENTIALS.length ? CREDENTIALS[0].code : '',
        lastCode: CREDENTIALS.length ? CREDENTIALS[CREDENTIALS.length - 1].code : '',
        issuers: issuers,
        pad: pad
    };
})();
